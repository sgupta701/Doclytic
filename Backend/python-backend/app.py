# app.py

import os
import shutil
import joblib
import io
from typing import List, Optional

from fastapi import FastAPI, UploadFile, File, HTTPException, Form
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

# ─── Source 1: Summarizer Imports ─────────────────────────────────────────────
# We use the logic from the first app for text extraction and summarization
from summarizer import (
    extract_text_from_file, 
    generate_summary, 
    generate_integrated_summary
)

# ─── Source 2: Classification & Routing Configuration ─────────────────────────
# We use the logic from the second app for classification and routing rules
from config.routing_rules import ROUTING_RULES
from config.departments import DEPARTMENT_EMAILS
from utils.email_sender import send_document_email

# ─── App Configuration ────────────────────────────────────────────────────────
app = FastAPI(title="Document Intelligence API — Integrated IDMS")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["*"]
)

# ─── Storage & Model Setup ────────────────────────────────────────────────────
BASE_STORAGE_DIR = "storage"
MANUAL_REVIEW_DIR = os.path.join(BASE_STORAGE_DIR, "manual_review")
MODEL_PATH = "models/doc_clf.joblib"
CONFIDENCE_THRESHOLD = 0.50

# Ensure directories exist
os.makedirs(BASE_STORAGE_DIR, exist_ok=True)
os.makedirs(MANUAL_REVIEW_DIR, exist_ok=True)

# Load Classifier
try:
    clf = joblib.load(MODEL_PATH)
    print(f"✅ Classifier loaded from {MODEL_PATH}")
except Exception as e:
    print(f"⚠️ Warning: Could not load classifier. Routing will default to Manual Review. Error: {e}")
    clf = None

# ══════════════════════════════════════════════════════════════════════════════
# HELPER FUNCTIONS (Logic from Source 2)
# ══════════════════════════════════════════════════════════════════════════════

def classify_text(extracted_text: str):
    """Predicts the document type using the loaded Joblib model."""
    if not clf or not extracted_text:
        return "Unknown", 0.0
    
    try:
        # Check if model supports probability
        if hasattr(clf, "predict_proba"):
            probs = clf.predict_proba([extracted_text])[0]
            idx = probs.argmax()
            return clf.classes_[idx], float(probs[idx])
        else:
            pred = clf.predict([extracted_text])[0]
            return pred, 1.0 # Default confidence if not supported
    except Exception as e:
        print(f"Classification Error: {e}")
        return "Error", 0.0

def _resolve_department(predicted_label: str, probability: float):
    """Determines department based on label and confidence threshold."""
    if probability < CONFIDENCE_THRESHOLD:
        return None, "low_confidence_below_threshold"

    normalized_label = (predicted_label or "").strip().lower()
    department = ROUTING_RULES.get(normalized_label)
    if not department:
        return None, "unmapped_label"
    
    return department, "ok"

def route_and_send_email(predicted_label: str, document_path: str, probability: float, summary: str) -> dict:
    """Sends email with the document attachment and summary."""
    department, note = _resolve_department(predicted_label, probability)

    if department is None:
        return {"route_to": "manual_review", "emails": [], "note": note}

    emails = DEPARTMENT_EMAILS.get(department)
    if not emails:
        return {"route_to": "manual_review", "emails": [], "note": "no_emails_configured"}

    subject = f"New Document Routed: {predicted_label}"
    body = (
        f"A new {predicted_label} document has been routed to your department.\n\n"
        f"--- SUMMARY ---\n{summary}\n"
    )
    
    try:
        send_document_email(emails, subject, body, document_path)
        return {"route_to": department, "emails": emails, "note": "email_sent_successfully"}
    except Exception as e:
        return {"route_to": department, "emails": emails, "note": f"email_failed: {str(e)}"}

def route_and_store(predicted_label: str, document_path: str, probability: float, summary: str) -> dict:
    """Moves document to department folder and saves summary text file."""
    department, note = _resolve_department(predicted_label, probability)

    target_dir = (
        os.path.join(BASE_STORAGE_DIR, department)
        if department
        else MANUAL_REVIEW_DIR
    )
    
    os.makedirs(target_dir, exist_ok=True)
    note = note if department is None else "routed_successfully"

    stored_doc_path = None
    stored_summary_path = None

    if document_path and os.path.exists(document_path):
        filename = os.path.basename(document_path)
        target_path = os.path.join(target_dir, filename)

        # Avoid overwrite
        if os.path.exists(target_path):
            base, ext = os.path.splitext(filename)
            import time
            timestamp = int(time.time())
            target_path = os.path.join(target_dir, f"{base}_{timestamp}{ext}")

        shutil.move(document_path, target_path)
        stored_doc_path = target_path

        # Write summary alongside
        summary_filename = os.path.splitext(os.path.basename(target_path))[0] + "_summary.txt"
        stored_summary_path = os.path.join(target_dir, summary_filename)
        
        with open(stored_summary_path, "w", encoding="utf-8") as f:
            f.write(f"Document: {filename}\n")
            f.write(f"Label   : {predicted_label}\n")
            f.write(f"Confidence: {probability:.2f}\n")
            f.write(f"Department: {department or 'manual_review'}\n\n")
            f.write("=== SUMMARY ===\n")
            f.write(summary)

    return {
        "route_to": os.path.basename(target_dir),
        "stored_at": stored_doc_path,
        "summary_stored_at": stored_summary_path,
        "note": note,
    }

def save_upload_temporarily(file: UploadFile) -> str:
    """Saves uploaded file to disk temporarily to allow for file-system routing operations."""
    path = os.path.join(BASE_STORAGE_DIR, file.filename)
    with open(path, "wb") as f:
        shutil.copyfileobj(file.file, f)
    # Reset file cursor for subsequent reads if needed
    file.file.seek(0)
    return path

# ══════════════════════════════════════════════════════════════════════════════
# ENDPOINTS
# ══════════════════════════════════════════════════════════════════════════════

@app.get("/")
def home():
    """Health check endpoint."""
    return {
        "status": "online", 
        "engine": "DistilBART-CNN (Summarizer) + Joblib (Classifier)",
        "features": ["single-doc-summary", "batch-integration", "auto-routing", "email-dispatch"]
    }

@app.post("/summarize")
async def summarize_single(file: UploadFile = File(...)):
    """
    Lightweight endpoint from Source 1. 
    Focuses purely on getting the summary back to the UI.
    """
    try:
        raw_bytes = await file.read() 
        # Using Source 1's extractor
        text = extract_text_from_file(raw_bytes, file.filename)
        
        if not text or text.strip() == "":
            return {"summary": "Error: Document is empty or unreadable."}
            
        summary = generate_summary(text)
        return {"summary": summary}
    except Exception as e:
        return {"summary": f"Python Error: {str(e)}"}

@app.post("/summarize-batch")
async def summarize_batch(files: List[UploadFile] = File(...)):
    """
    MULTI-DOC ENDPOINT (Source 1 Logic).
    Input: List of files
    Output: Integrated summary + individual breakdown
    """
    if not files:
        raise HTTPException(status_code=400, detail="No files provided")

    processed_results = []
    
    for file in files:
        try:
            raw_bytes = await file.read()
            text = extract_text_from_file(raw_bytes, file.filename)
            
            if text and not text.startswith("Error"):
                indiv_summary = generate_summary(text)
                processed_results.append({
                    "title": file.filename,
                    "summary": indiv_summary
                })
        except Exception:
            continue 

    if not processed_results:
        return {"error": "Could not process any of the provided documents."}

    try:
        integrated_overview = generate_integrated_summary(processed_results)
        return {
            "summary": integrated_overview,
            "individual_summaries": processed_results
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Integration error: {str(e)}")

@app.post("/classify-summarize")
async def classify_and_summarize(file: UploadFile = File(...)):
    """
    Classification + summary endpoint WITHOUT email dispatch/storage routing side-effects.
    Used for Gmail-fetched files that should only appear under department pages.
    """
    try:
        raw_bytes = await file.read()
        text = extract_text_from_file(raw_bytes, file.filename)

        if not text or text.strip() == "":
            return JSONResponse(
                {"error": "Could not extract text.", "file": file.filename},
                status_code=422,
            )

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
        return JSONResponse(
            {"status": "error", "message": str(e)},
            status_code=500,
        )

@app.post("/ingest")
async def ingest_and_route(file: UploadFile = File(...)):
    """
    FULL PIPELINE ENDPOINT (Source 2 Logic merged with Source 1 Engine).
    1. Extract Text (via Summarizer module)
    2. Classify (via Joblib)
    3. Summarize (via Summarizer module)
    4. Route (Email + Folder Move)
    """
    try:
        # 1. Save locally first (needed for email attachment and folder moving)
        saved_path = save_upload_temporarily(file)
        
        # 2. Extract Text (Using Source 1's extractor for consistency)
        # We read the file bytes from the saved path to ensure we have the content
        with open(saved_path, "rb") as f:
            raw_bytes = f.read()
            
        text = extract_text_from_file(raw_bytes, file.filename)
        
        if not text or text.strip() == "":
             return JSONResponse(
                 {"error": "Could not extract text.", "file": file.filename}, 
                 status_code=422
             )

        # 3. Classify
        predicted_label, probability = classify_text(text)

        # 4. Summarize
        summary = generate_summary(text)

        # 5. Route (Email)
        email_info = route_and_send_email(predicted_label, saved_path, probability, summary)

        # 6. Route (Storage) - This moves the file from saved_path to target_dir
        storage_info = route_and_store(predicted_label, saved_path, probability, summary)

        return {
            "status": "processed",
            "filename": file.filename,
            "classification": {
                "label": predicted_label,
                "confidence": probability
            },
            "summary": summary,
            "actions": {
                "email": email_info,
                "storage": storage_info
            }
        }

    except Exception as e:
        return JSONResponse(
            {"status": "error", "message": str(e)}, 
            status_code=500
        )

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=8000)
