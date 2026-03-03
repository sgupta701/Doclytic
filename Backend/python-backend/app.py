import os
from datetime import datetime, timezone
from typing import List, Optional

import joblib
from bson import ObjectId
from bson.errors import InvalidId
from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, StreamingResponse
from gridfs import GridFSBucket
from pydantic import BaseModel
from pymongo import DESCENDING, MongoClient
from pymongo.uri_parser import parse_uri
from dotenv import load_dotenv

from config.routing_rules import ROUTING_RULES
from summarizer import extract_text_from_file, generate_integrated_summary, generate_summary
from utils.email_sender import send_document_email_bytes

app = FastAPI(title="Document Intelligence API - Integrated IDMS")

load_dotenv(os.path.join(os.path.dirname(__file__), "..", ".env"))

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["*"],
)

MODEL_PATH = "models/doc_clf.joblib"
CONFIDENCE_THRESHOLD = 0.50

MONGO_URI = os.getenv("MONGO_URI", "").strip()
MONGO_DB_NAME = os.getenv("MONGO_DB_NAME", "test").strip()
DOC_BUCKET_NAME = os.getenv("PYTHON_DOC_BUCKET_NAME", "pythonDocuments").strip()
DOC_FILES_COLLECTION = f"{DOC_BUCKET_NAME}.files"

mongo_client: Optional[MongoClient] = None
mongo_db = None
doc_bucket: Optional[GridFSBucket] = None


class RouteUpdateRequest(BaseModel):
    route_to: str
    note: Optional[str] = None
    decided_by: Optional[str] = None


class SummaryItem(BaseModel):
    title: str
    summary: str


class IntegratedSummaryRequest(BaseModel):
    documents: List[SummaryItem]

try:
    clf = joblib.load(MODEL_PATH)
    print(f"Classifier loaded from {MODEL_PATH}")
except Exception as e:
    print(f"Warning: classifier not loaded. Routing falls back to manual review. Error: {e}")
    clf = None


def classify_text(extracted_text: str):
    """Predict the document class with probability if supported."""
    if not clf or not extracted_text:
        return "Unknown", 0.0

    try:
        if hasattr(clf, "predict_proba"):
            probs = clf.predict_proba([extracted_text])[0]
            idx = probs.argmax()
            return clf.classes_[idx], float(probs[idx])
        pred = clf.predict([extracted_text])[0]
        return pred, 1.0
    except Exception:
        return "Error", 0.0


def _resolve_department(predicted_label: str, probability: float):
    if probability < CONFIDENCE_THRESHOLD:
        return None, "low_confidence_below_threshold"

    normalized = (predicted_label or "").strip().lower()
    department = ROUTING_RULES.get(normalized)
    if not department:
        return None, "unmapped_label"
    return department, "ok"


def _ensure_db():
    """Initialize MongoDB and GridFS lazily."""
    global mongo_client, mongo_db, doc_bucket

    if doc_bucket is not None:
        return

    if not MONGO_URI:
        raise RuntimeError("MONGO_URI is not set.")

    mongo_client = MongoClient(MONGO_URI)
    parsed = parse_uri(MONGO_URI)
    db_name = parsed.get("database") or MONGO_DB_NAME
    mongo_db = mongo_client[db_name]
    doc_bucket = GridFSBucket(mongo_db, bucket_name=DOC_BUCKET_NAME)
    mongo_db[DOC_FILES_COLLECTION].create_index([("metadata.route_to", 1), ("uploadDate", DESCENDING)])


def _get_department_emails_from_db(department_name: str) -> List[str]:
    """Resolve recipient emails for a routed department from MongoDB."""
    _ensure_db()

    department = mongo_db["departments"].find_one(
        {"name": {"$regex": f"^{department_name.strip()}$", "$options": "i"}},
        {"_id": 1},
    )
    if not department:
        return []

    cursor = mongo_db["users"].find(
        {
            "department_id": department["_id"],
            "email": {"$exists": True, "$type": "string", "$ne": ""},
        },
        {"email": 1, "_id": 0},
    )

    emails = []
    seen = set()
    for row in cursor:
        email = (row.get("email") or "").strip()
        if not email:
            continue
        lower = email.lower()
        if lower in seen:
            continue
        seen.add(lower)
        emails.append(email)
    return emails


def route_and_send_email(
    predicted_label: str,
    filename: str,
    content_type: str,
    file_bytes: bytes,
    probability: float,
    summary: str,
) -> dict:
    department, note = _resolve_department(predicted_label, probability)
    if department is None:
        return {"route_to": "manual_review", "emails": [], "note": note}

    emails = _get_department_emails_from_db(department)
    if not emails:
        return {"route_to": "manual_review", "emails": [], "note": "no_department_users_found"}

    subject = f"New Document Routed: {predicted_label}"
    body = (
        f"A new {predicted_label} document has been routed to your department.\n\n"
        f"--- SUMMARY ---\n{summary}\n"
    )

    try:
        send_document_email_bytes(
            recipients=emails,
            subject=subject,
            body=body,
            filename=filename,
            file_bytes=file_bytes,
            content_type=content_type,
        )
        return {"route_to": department, "emails": emails, "note": "email_sent_successfully"}
    except Exception as e:
        return {"route_to": department, "emails": emails, "note": f"email_failed: {str(e)}"}


def route_and_store(
    predicted_label: str,
    filename: str,
    content_type: str,
    file_bytes: bytes,
    probability: float,
    summary: str,
) -> dict:
    """Store file + summary + classification metadata in MongoDB GridFS."""
    department, note = _resolve_department(predicted_label, probability)
    route_to = department if department else "manual_review"
    note = note if department is None else "routed_successfully"

    _ensure_db()
    metadata = {
        "route_to": route_to,
        "note": note,
        "classification": {
            "label": predicted_label,
            "confidence": float(probability),
        },
        "summary": summary,
        "content_type": content_type or "application/octet-stream",
        "original_filename": filename,
        "source": "python-ingest",
        "stored_at": datetime.now(timezone.utc),
    }

    file_id = doc_bucket.upload_from_stream(filename, file_bytes, metadata=metadata)
    return {
        "route_to": route_to,
        "stored_id": str(file_id),
        "note": note,
    }


@app.get("/")
def home():
    return {
        "status": "online",
        "engine": "DistilBART-CNN (Summarizer) + Joblib (Classifier)",
        "features": ["single-doc-summary", "batch-integration", "auto-routing", "email-dispatch", "db-storage"],
    }


@app.post("/summarize")
async def summarize_single(file: UploadFile = File(...)):
    try:
        raw_bytes = await file.read()
        text = extract_text_from_file(raw_bytes, file.filename)
        if not text or text.strip() == "":
            return {"summary": "Error: Document is empty or unreadable."}
        return {"summary": generate_summary(text)}
    except Exception as e:
        return {"summary": f"Python Error: {str(e)}"}


@app.post("/summarize-batch")
async def summarize_batch(files: List[UploadFile] = File(...)):
    if not files:
        raise HTTPException(status_code=400, detail="No files provided")

    processed_results = []
    for file in files:
        try:
            raw_bytes = await file.read()
            text = extract_text_from_file(raw_bytes, file.filename)
            if text and not text.startswith("Error"):
                processed_results.append({"title": file.filename, "summary": generate_summary(text)})
        except Exception:
            continue

    if not processed_results:
        return {"error": "Could not process any of the provided documents."}

    try:
        return {
            "summary": generate_integrated_summary(processed_results),
            "individual_summaries": processed_results,
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Integration error: {str(e)}")


@app.post("/summarize-integrated")
def summarize_integrated(payload: IntegratedSummaryRequest):
    """Create one combined summary from pre-summarized documents."""
    items = [
        {"title": (d.title or "").strip(), "summary": (d.summary or "").strip()}
        for d in payload.documents
        if (d.title or "").strip() and (d.summary or "").strip()
    ]
    return {"summary": generate_integrated_summary(items)}


@app.post("/classify-summarize")
async def classify_and_summarize(file: UploadFile = File(...)):
    """Classification + summary endpoint with no email and no DB write side effects."""
    try:
        raw_bytes = await file.read()
        text = extract_text_from_file(raw_bytes, file.filename)

        if not text or text.strip() == "":
            return JSONResponse({"error": "Could not extract text.", "file": file.filename}, status_code=422)

        predicted_label, probability = classify_text(text)
        summary = generate_summary(text)
        department, note = _resolve_department(predicted_label, probability)
        route_to = department if department else "manual_review"

        return {
            "status": "processed",
            "filename": file.filename,
            "classification": {
                "label": predicted_label,
                "confidence": probability,
            },
            "summary": summary,
            "actions": {
                "email": {
                    "route_to": route_to,
                    "emails": [],
                    "note": "skipped_for_gmail_fetch",
                },
                "storage": {
                    "route_to": route_to,
                    "note": note,
                },
            },
        }
    except Exception as e:
        return JSONResponse({"status": "error", "message": str(e)}, status_code=500)


@app.post("/ingest")
async def ingest_and_route(file: UploadFile = File(...)):
    """
    Full pipeline:
    1. Extract text
    2. Classify
    3. Summarize
    4. Route email
    5. Store in DB (GridFS)
    """
    try:
        raw_bytes = await file.read()
        text = extract_text_from_file(raw_bytes, file.filename)

        if not text or text.strip() == "":
            return JSONResponse({"error": "Could not extract text.", "file": file.filename}, status_code=422)

        predicted_label, probability = classify_text(text)
        summary = generate_summary(text)

        content_type = file.content_type or "application/octet-stream"
        email_info = route_and_send_email(
            predicted_label=predicted_label,
            filename=file.filename,
            content_type=content_type,
            file_bytes=raw_bytes,
            probability=probability,
            summary=summary,
        )
        storage_info = route_and_store(
            predicted_label=predicted_label,
            filename=file.filename,
            content_type=content_type,
            file_bytes=raw_bytes,
            probability=probability,
            summary=summary,
        )

        return {
            "status": "processed",
            "filename": file.filename,
            "classification": {
                "label": predicted_label,
                "confidence": probability,
            },
            "summary": summary,
            "actions": {
                "email": email_info,
                "storage": storage_info,
            },
        }
    except Exception as e:
        return JSONResponse({"status": "error", "message": str(e)}, status_code=500)


@app.get("/documents")
def list_documents(route_to: Optional[str] = None, limit: int = 50):
    """List DB-stored files, optionally filtered by routed department."""
    try:
        _ensure_db()
        safe_limit = max(1, min(limit, 200))
        query = {}
        if route_to:
            query["metadata.route_to"] = {"$regex": f"^{route_to.strip()}$", "$options": "i"}

        docs = list(mongo_db[DOC_FILES_COLLECTION].find(query).sort("uploadDate", DESCENDING).limit(safe_limit))
        return {
            "count": len(docs),
            "items": [
                {
                    "id": str(d["_id"]),
                    "filename": d.get("filename"),
                    "length": d.get("length"),
                    "uploadDate": d.get("uploadDate"),
                    "route_to": d.get("metadata", {}).get("route_to"),
                    "classification": d.get("metadata", {}).get("classification"),
                    "summary": d.get("metadata", {}).get("summary"),
                    "content_type": d.get("metadata", {}).get("content_type"),
                }
                for d in docs
            ],
        }
    except Exception as e:
        return JSONResponse({"status": "error", "message": str(e)}, status_code=500)


@app.get("/documents/{document_id}")
def get_document_metadata(document_id: str):
    try:
        _ensure_db()
        oid = ObjectId(document_id)
        d = mongo_db[DOC_FILES_COLLECTION].find_one({"_id": oid})
        if not d:
            return JSONResponse({"message": "Document not found"}, status_code=404)
        return {
            "id": str(d["_id"]),
            "filename": d.get("filename"),
            "length": d.get("length"),
            "uploadDate": d.get("uploadDate"),
            "metadata": d.get("metadata", {}),
        }
    except InvalidId:
        return JSONResponse({"message": "Invalid document id"}, status_code=400)
    except Exception as e:
        return JSONResponse({"status": "error", "message": str(e)}, status_code=500)


@app.patch("/documents/{document_id}/route")
def update_document_route(document_id: str, payload: RouteUpdateRequest):
    """Update routed department metadata for an existing GridFS file."""
    try:
        _ensure_db()
        oid = ObjectId(document_id)
        route_to = (payload.route_to or "").strip()
        if not route_to:
            return JSONResponse({"message": "route_to is required"}, status_code=400)

        existing = mongo_db[DOC_FILES_COLLECTION].find_one({"_id": oid})
        if not existing:
            return JSONResponse({"message": "Document not found"}, status_code=404)

        update_ops = {
            "metadata.route_to": route_to,
            "metadata.note": payload.note or "routed_by_manual_review",
            "metadata.manual_review.status": "resolved",
            "metadata.manual_review.decided_department": route_to,
            "metadata.manual_review.decided_at": datetime.now(timezone.utc),
        }
        if payload.decided_by:
            update_ops["metadata.manual_review.decided_by"] = payload.decided_by

        mongo_db[DOC_FILES_COLLECTION].update_one({"_id": oid}, {"$set": update_ops})

        updated = mongo_db[DOC_FILES_COLLECTION].find_one({"_id": oid})
        return {
            "id": str(updated["_id"]),
            "filename": updated.get("filename"),
            "route_to": updated.get("metadata", {}).get("route_to"),
            "note": updated.get("metadata", {}).get("note"),
            "manual_review": updated.get("metadata", {}).get("manual_review", {}),
        }
    except InvalidId:
        return JSONResponse({"message": "Invalid document id"}, status_code=400)
    except Exception as e:
        return JSONResponse({"status": "error", "message": str(e)}, status_code=500)


@app.get("/documents/{document_id}/download")
def download_document(document_id: str):
    try:
        _ensure_db()
        oid = ObjectId(document_id)
        d = mongo_db[DOC_FILES_COLLECTION].find_one({"_id": oid})
        if not d:
            return JSONResponse({"message": "Document not found"}, status_code=404)

        grid_out = doc_bucket.open_download_stream(oid)
        content_type = d.get("metadata", {}).get("content_type", "application/octet-stream")
        filename = d.get("filename", f"{document_id}.bin")

        return StreamingResponse(
            grid_out,
            media_type=content_type,
            headers={"Content-Disposition": f'attachment; filename="{filename}"'},
        )
    except InvalidId:
        return JSONResponse({"message": "Invalid document id"}, status_code=400)
    except Exception as e:
        return JSONResponse({"status": "error", "message": str(e)}, status_code=500)


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="127.0.0.1", port=8000)
