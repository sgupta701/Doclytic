import os
import re
import csv
import threading
from datetime import datetime, timezone
from typing import Dict, List, Optional

import joblib
import numpy as np
import pandas as pd
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
from priority_service.services.scoring import compute_priority
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

BASE_DIR = os.path.dirname(__file__)
MODEL_PATH = os.path.join(BASE_DIR, "models", "doc_clf.joblib")
DATASET_PATH = os.path.join(BASE_DIR, "dataset_pipeline", "output", "dataset.csv")
FEEDBACK_DATASET_PATH = os.path.join(
    BASE_DIR, "dataset_pipeline", "output", "manual_review_feedback.csv"
)
CONFIDENCE_THRESHOLD = 0.60
FEEDBACK_SIMILARITY_THRESHOLD = float(os.getenv("FEEDBACK_SIMILARITY_THRESHOLD", "0.82"))
SBERT_MODEL_NAME = os.getenv("SBERT_MODEL_NAME", "sentence-transformers/all-MiniLM-L6-v2")

MONGO_URI = os.getenv("MONGO_URI", "").strip()
MONGO_DB_NAME = os.getenv("MONGO_DB_NAME", "test").strip()
DOC_BUCKET_NAME = os.getenv(
    "PYTHON_DOC_BUCKET_NAME", "pythonDocuments").strip()
DOC_FILES_COLLECTION = f"{DOC_BUCKET_NAME}.files"

mongo_client: Optional[MongoClient] = None
mongo_db = None
doc_bucket: Optional[GridFSBucket] = None
feedback_lock = threading.Lock()
feedback_rows: List[Dict[str, str]] = []
feedback_embeddings: Optional[np.ndarray] = None


class RouteUpdateRequest(BaseModel):
    route_to: str
    label: Optional[str] = None
    note: Optional[str] = None
    decided_by: Optional[str] = None


class RetrainRequest(BaseModel):
    min_feedback: int = 50


class SummaryItem(BaseModel):
    title: str
    summary: str


class IntegratedSummaryRequest(BaseModel):
    documents: List[SummaryItem]


try:
    clf = joblib.load(MODEL_PATH)
    print(f"Classifier loaded from {MODEL_PATH}")
except Exception as e:
    print(
        f"Warning: classifier not loaded. Routing falls back to manual review. Error: {e}")
    clf = None


def _is_st_classifier_ready() -> bool:
    return clf is not None and hasattr(clf, "encode")


def _normalize_label(label: str) -> str:
    return (label or "").strip().lower().replace(" ", "_")


def _normalize_department_name(name: str) -> str:
    return (name or "").strip().lower()


def _filename_to_features(filename: str) -> str:
    raw = (filename or "").strip()
    if not raw:
        return ""

    base = os.path.basename(raw)
    stem, _ = os.path.splitext(base)
    normalized = re.sub(r"[_\-.]+", " ", stem.lower())
    normalized = re.sub(r"\s+", " ", normalized).strip()
    return normalized


def _build_classification_input(extracted_text: str, filename: str = "") -> str:
    body = (extracted_text or "").strip()
    fname_features = _filename_to_features(filename)
    if not fname_features:
        return body

    # Repeat filename cues to make short but high-signal names more influential.
    return (
        f"filename cues {fname_features} "
        f"filename cues {fname_features} "
        f"{body}"
    ).strip()


def _build_label_department_map(rules: Dict[str, List[str]]) -> Dict[str, str]:
    label_map: Dict[str, str] = {}
    for department, labels in rules.items():
        for raw_label in labels:
            normalized = _normalize_label(raw_label)
            if normalized and normalized not in label_map:
                label_map[normalized] = department
    return label_map


LABEL_TO_DEPARTMENT = _build_label_department_map(ROUTING_RULES)
DEPARTMENT_NAME_LOOKUP = {
    _normalize_department_name(dept): dept for dept in ROUTING_RULES.keys()
}
GENERIC_LABEL_TO_DEPARTMENT = {
    "report": "Operations",
    "invoice": "Finance",
    "contract": "Legal",
    "email": "Admin",
    "form": "Admin",
}


def _ensure_feedback_csv():
    os.makedirs(os.path.dirname(FEEDBACK_DATASET_PATH), exist_ok=True)
    if os.path.exists(FEEDBACK_DATASET_PATH) and os.path.getsize(FEEDBACK_DATASET_PATH) > 0:
        return
    with open(FEEDBACK_DATASET_PATH, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(
            f,
            fieldnames=["text", "label", "department", "source_doc_id", "created_at"],
        )
        writer.writeheader()


def _load_feedback_memory():
    global feedback_rows, feedback_embeddings
    _ensure_feedback_csv()
    rows: List[Dict[str, str]] = []

    with open(FEEDBACK_DATASET_PATH, "r", newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            text = (row.get("text") or "").strip()
            label = _normalize_label(row.get("label") or "")
            department = (row.get("department") or "").strip()
            if not text or not label or not department:
                continue
            rows.append(
                {
                    "text": text,
                    "label": label,
                    "department": department,
                    "source_doc_id": (row.get("source_doc_id") or "").strip(),
                    "created_at": (row.get("created_at") or "").strip(),
                }
            )

    embeddings = None
    if rows and _is_st_classifier_ready():
        texts = [r["text"] for r in rows]
        embeddings = clf.encode(texts, batch_size=64)
        if embeddings.size > 0:
            norms = np.linalg.norm(embeddings, axis=1, keepdims=True)
            norms[norms == 0] = 1.0
            embeddings = embeddings / norms

    with feedback_lock:
        feedback_rows = rows
        feedback_embeddings = embeddings


def _append_feedback_sample(
    text: str, label: str, department: str, source_doc_id: str
) -> bool:
    global feedback_embeddings
    cleaned_text = (text or "").strip()
    normalized_label = _normalize_label(label)
    if not cleaned_text or len(cleaned_text) < 20 or not normalized_label:
        return False

    _ensure_feedback_csv()
    with open(FEEDBACK_DATASET_PATH, "a", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(
            f,
            fieldnames=["text", "label", "department", "source_doc_id", "created_at"],
        )
        writer.writerow(
            {
                "text": cleaned_text,
                "label": normalized_label,
                "department": department,
                "source_doc_id": source_doc_id,
                "created_at": datetime.now(timezone.utc).isoformat(),
            }
        )

    if _is_st_classifier_ready():
        emb = clf.encode([cleaned_text], batch_size=1)
        if emb.size > 0:
            norm = np.linalg.norm(emb, axis=1, keepdims=True)
            norm[norm == 0] = 1.0
            emb = emb / norm
            with feedback_lock:
                feedback_rows.append(
                    {
                        "text": cleaned_text,
                        "label": normalized_label,
                        "department": department,
                        "source_doc_id": source_doc_id,
                        "created_at": datetime.now(timezone.utc).isoformat(),
                    }
                )
                if feedback_embeddings is None:
                    feedback_embeddings = emb
                else:
                    feedback_embeddings = np.vstack([feedback_embeddings, emb])
            return True

    _load_feedback_memory()
    return True


def _predict_from_feedback_memory(classification_input: str):
    if not _is_st_classifier_ready():
        return None
    text = (classification_input or "").strip()
    if len(text) < 20:
        return None

    with feedback_lock:
        if not feedback_rows or feedback_embeddings is None or len(feedback_rows) == 0:
            return None
        local_rows = feedback_rows
        local_embeddings = feedback_embeddings

    query = clf.encode([text], batch_size=1)
    if query.size == 0:
        return None
    q_norm = np.linalg.norm(query, axis=1, keepdims=True)
    q_norm[q_norm == 0] = 1.0
    query = query / q_norm

    sims = np.dot(local_embeddings, query[0])
    best_idx = int(np.argmax(sims))
    best_sim = float(sims[best_idx])
    if best_sim < FEEDBACK_SIMILARITY_THRESHOLD:
        return None

    return local_rows[best_idx]["label"], best_sim


@app.on_event("startup")
def _startup_init_learning():
    try:
        _load_feedback_memory()
    except Exception as exc:
        print(f"Warning: failed to load feedback memory: {exc}")


def classify_text(extracted_text: str, filename: str = ""):
    """Predict the document class with probability if supported."""
    if not clf or (not extracted_text and not filename):
        return "Unknown", 0.0

    try:
        clean_text = _build_classification_input(extracted_text, filename)
        if not clean_text:
            return "Unknown", 0.0

        feedback_pred = _predict_from_feedback_memory(clean_text)
        if feedback_pred:
            return feedback_pred[0], feedback_pred[1]

        if hasattr(clf, "predict_proba"):
            probs = clf.predict_proba([clean_text])[0]
            idx = probs.argmax()
            label = str(clf.classes_[idx]).strip().lower()
            return label, float(probs[idx])

        pred = clf.predict([clean_text])[0]
        return str(pred).strip().lower(), 1.0
    except Exception:
        return "Error", 0.0


def _extract_sender_category(text: str) -> str:
    lowered = (text or "").lower()
    sender_rules = [
        ("court", ["hon'ble court", "district court",
         "high court", "supreme court", "tribunal"]),
        ("regulator", ["sebi", "rbi", "compliance authority",
         "regulatory authority", "regulator"]),
        ("government", ["government of", "ministry", "department of", "govt"]),
        ("police", ["police station", "fir",
         "crime branch", "investigation unit"]),
        ("internal", ["internal memo",
         "intra-office", "internal communication"]),
        ("vendor", ["vendor", "supplier"]),
        ("customer", ["customer", "client"]),
        ("seniors", ["senior", "manager", "administration"]),
        ("employees", ["Analyst", "Associate"])
    ]
    for category, markers in sender_rules:
        if any(marker in lowered for marker in markers):
            return category
    return "unknown"


def _extract_selected_deadline(text: str) -> str | None:
    lowered = (text or "").lower()
    patterns = [
        r"(?:due by|deadline[:\s]*|respond by|submit by)\s*(\d{4}-\d{2}-\d{2})",
        r"(?:due by|deadline[:\s]*|respond by|submit by)\s*(\d{2}/\d{2}/\d{4})",
        r"(?:on or before)\s*(\d{4}-\d{2}-\d{2})",
        r"(?:on or before)\s*(\d{2}/\d{2}/\d{4})",
    ]
    for pattern in patterns:
        match = re.search(pattern, lowered)
        if match:
            value = match.group(1)
            if "/" in value:
                dd, mm, yyyy = value.split("/")
                return f"{yyyy}-{mm}-{dd}"
            return value
    return None


def _extract_urgency_indicators(text: str) -> List[str]:
    lowered = (text or "").lower()
    markers = [
        "urgent",
        "immediate",
        "asap",
        "within 24 hours",
        "today",
        "overdue",
        "final reminder",
        "show cause",
        "legal notice",
    ]
    return [m for m in markers if m in lowered]


def extract_priority_metadata(extracted_text: str, predicted_label: str) -> dict:
    return {
        "sender": {
            "name": None,
            "category": _extract_sender_category(extracted_text),
        },
        "document_type": (predicted_label or "").strip().lower().replace(" ", "_"),
        "selected_deadline": _extract_selected_deadline(extracted_text),
        "urgency_indicators": _extract_urgency_indicators(extracted_text),
        "extraction_model_version": "rule-v1",
        "extraction_confidence": 0.6,
    }


def _resolve_department(predicted_label: str, probability: float):
    if probability < CONFIDENCE_THRESHOLD:
        return None, "low_confidence_below_threshold"

    normalized = _normalize_label(predicted_label)
    department = LABEL_TO_DEPARTMENT.get(normalized) or GENERIC_LABEL_TO_DEPARTMENT.get(
        normalized)
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
    mongo_db[DOC_FILES_COLLECTION].create_index(
        [("metadata.route_to", 1), ("uploadDate", DESCENDING)])


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

    file_id = doc_bucket.upload_from_stream(
        filename, file_bytes, metadata=metadata)
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


@app.get("/routing-rules")
def get_routing_rules():
    return {
        "departments": {
            dept: sorted([_normalize_label(label) for label in labels])
            for dept, labels in ROUTING_RULES.items()
        }
    }


@app.get("/learning/feedback-stats")
def feedback_stats():
    _ensure_feedback_csv()
    total = 0
    by_label: Dict[str, int] = {}
    if os.path.exists(FEEDBACK_DATASET_PATH):
        with open(FEEDBACK_DATASET_PATH, "r", newline="", encoding="utf-8") as f:
            reader = csv.DictReader(f)
            for row in reader:
                label = _normalize_label(row.get("label") or "")
                if not label:
                    continue
                total += 1
                by_label[label] = by_label.get(label, 0) + 1
    return {"feedback_samples": total, "by_label": by_label}


@app.post("/learning/retrain")
def retrain_from_feedback(payload: RetrainRequest):
    global clf
    _ensure_feedback_csv()

    if not os.path.exists(DATASET_PATH):
        return JSONResponse({"message": "Base dataset not found"}, status_code=404)
    if not os.path.exists(FEEDBACK_DATASET_PATH):
        return JSONResponse({"message": "Feedback dataset not found"}, status_code=404)

    base_df = pd.read_csv(DATASET_PATH)
    fb_df = pd.read_csv(FEEDBACK_DATASET_PATH)
    if len(fb_df) < max(1, payload.min_feedback):
        return JSONResponse(
            {
                "message": "Not enough feedback samples for retraining",
                "feedback_count": int(len(fb_df)),
                "required_min_feedback": int(payload.min_feedback),
            },
            status_code=400,
        )

    if "text" not in base_df.columns or "label" not in base_df.columns:
        return JSONResponse({"message": "Base dataset must contain text,label"}, status_code=400)
    if "text" not in fb_df.columns or "label" not in fb_df.columns:
        return JSONResponse({"message": "Feedback dataset must contain text,label"}, status_code=400)

    train_df = pd.concat(
        [base_df[["text", "label"]], fb_df[["text", "label"]]],
        ignore_index=True,
    )
    train_df["text"] = train_df["text"].fillna("").astype(str)
    train_df["label"] = train_df["label"].fillna("").astype(str).map(_normalize_label)
    train_df = train_df[(train_df["text"].str.len() > 0) & (train_df["label"].str.len() > 0)]

    if train_df.empty:
        return JSONResponse({"message": "No training rows after cleaning"}, status_code=400)

    try:
        from st_classifier import SentenceTransformerClassifier

        new_clf = SentenceTransformerClassifier(model_name=SBERT_MODEL_NAME)
        new_clf.fit(train_df["text"].tolist(), train_df["label"].tolist())
        joblib.dump(new_clf, MODEL_PATH)
        clf = new_clf
        _load_feedback_memory()
        return {
            "status": "ok",
            "message": "Model retrained with manual-review feedback",
            "base_rows": int(len(base_df)),
            "feedback_rows": int(len(fb_df)),
            "train_rows": int(len(train_df)),
            "model_path": MODEL_PATH,
        }
    except Exception as e:
        return JSONResponse({"status": "error", "message": str(e)}, status_code=500)


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
                processed_results.append(
                    {"title": file.filename, "summary": generate_summary(text)})
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
        raise HTTPException(
            status_code=500, detail=f"Integration error: {str(e)}")


@app.post("/summarize-integrated")
def summarize_integrated(payload: IntegratedSummaryRequest):
    """Create one combined summary from pre-summarized documents."""
    items = [
        {"title": (d.title or "").strip(),
         "summary": (d.summary or "").strip()}
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

        predicted_label, probability = classify_text(text, file.filename)
        summary = generate_summary(text)
        department, note = _resolve_department(predicted_label, probability)
        route_to = department if department else "manual_review"
        extracted_metadata = extract_priority_metadata(text, predicted_label)
        priority_result = compute_priority(extracted_metadata)

        return {
            "status": "processed",
            "filename": file.filename,
            "classification": {
                "label": predicted_label,
                "confidence": probability,
            },
            "summary": summary,
            "extraction": extracted_metadata,
            "priority": {
                **priority_result,
                "engine_version": "rule-v1",
            },
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

        predicted_label, probability = classify_text(text, file.filename)
        summary = generate_summary(text)
        extracted_metadata = extract_priority_metadata(text, predicted_label)
        priority_result = compute_priority(extracted_metadata)

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
            "extraction": extracted_metadata,
            "priority": {
                **priority_result,
                "engine_version": "rule-v1",
            },
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
            query["metadata.route_to"] = {
                "$regex": f"^{route_to.strip()}$", "$options": "i"}

        docs = list(mongo_db[DOC_FILES_COLLECTION].find(
            query).sort("uploadDate", DESCENDING).limit(safe_limit))
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

        route_to_key = _normalize_department_name(route_to)
        canonical_department = DEPARTMENT_NAME_LOOKUP.get(route_to_key)
        if not canonical_department:
            return JSONResponse({"message": "Invalid route_to department"}, status_code=400)

        existing = mongo_db[DOC_FILES_COLLECTION].find_one({"_id": oid})
        if not existing:
            return JSONResponse({"message": "Document not found"}, status_code=404)

        selected_label = None
        if payload.label is not None and payload.label.strip():
            normalized_label = _normalize_label(payload.label)
            allowed_labels = {
                _normalize_label(l) for l in ROUTING_RULES.get(canonical_department, [])
            }
            if normalized_label not in allowed_labels:
                return JSONResponse(
                    {
                        "message": "Selected label is not valid for the chosen department",
                        "allowed_labels": sorted(allowed_labels),
                    },
                    status_code=400,
                )
            selected_label = normalized_label

        update_ops = {
            "metadata.route_to": canonical_department,
            "metadata.note": payload.note or "routed_by_manual_review",
            "metadata.manual_review.status": "resolved",
            "metadata.manual_review.decided_department": canonical_department,
            "metadata.manual_review.decided_at": datetime.now(timezone.utc),
        }
        if selected_label:
            update_ops["metadata.classification.label"] = selected_label
            update_ops["metadata.manual_review.decided_label"] = selected_label
        if payload.decided_by:
            update_ops["metadata.manual_review.decided_by"] = payload.decided_by

        mongo_db[DOC_FILES_COLLECTION].update_one(
            {"_id": oid}, {"$set": update_ops})

        updated = mongo_db[DOC_FILES_COLLECTION].find_one({"_id": oid})
        if selected_label:
            feedback_text = (
                (existing.get("metadata", {}) or {}).get("summary")
                or existing.get("filename")
                or ""
            )
            _append_feedback_sample(
                text=feedback_text,
                label=selected_label,
                department=canonical_department,
                source_doc_id=str(oid),
            )
        return {
            "id": str(updated["_id"]),
            "filename": updated.get("filename"),
            "route_to": updated.get("metadata", {}).get("route_to"),
            "classification": updated.get("metadata", {}).get("classification", {}),
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
        content_type = d.get("metadata", {}).get(
            "content_type", "application/octet-stream")
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
