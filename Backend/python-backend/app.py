# app.py — Integrated IDMS: Classify → Summarize → Route (email + folder)

import os
import shutil
import joblib
from io import BytesIO

from fastapi import FastAPI, File, UploadFile, Form
from fastapi.responses import JSONResponse
from PIL import Image
import pytesseract
import pdfplumber

# ── Summarizer imports ──────────────────────────────────────────────────────
from transformers import pipeline, AutoTokenizer, AutoModelForSeq2SeqLM
import fitz          # PyMuPDF  (OCR fallback for PDFs)
import docx as docx_lib
from odf import text as odf_text, teletype, opendocument

# ── Email + Routing configs ─────────────────────────────────────────────────
from config.routing_rules import ROUTING_RULES
from config.departments import DEPARTMENT_EMAILS
from utils.email_sender import send_document_email

# FIXED — works on all transformers versions
_SUMMARIZER_MODEL = "facebook/bart-large-cnn"
_tokenizer = AutoTokenizer.from_pretrained(_SUMMARIZER_MODEL)
_sum_model = AutoModelForSeq2SeqLM.from_pretrained(_SUMMARIZER_MODEL)
summarizer_pipeline = pipeline(
    "text2text-generation",
    model=_sum_model,
    tokenizer=_tokenizer
)
# ── Load classifier ─────────────────────────────────────────────────────────
MODEL_PATH = "models/doc_clf.joblib"
clf = joblib.load(MODEL_PATH)

# ── Constants ───────────────────────────────────────────────────────────────
STORAGE_DIR = "storage"
BASE_STORAGE_DIR = "storage"
MANUAL_REVIEW_DIR = os.path.join(BASE_STORAGE_DIR, "manual_review")
CONFIDENCE_THRESHOLD = 0.50

os.makedirs(STORAGE_DIR, exist_ok=True)
os.makedirs(MANUAL_REVIEW_DIR, exist_ok=True)

app = FastAPI(title="IDMS — Classify · Summarize · Route")


# ═══════════════════════════════════════════════════════════════════════════
# TEXT EXTRACTION  (supports PDF, image, DOCX, ODT, TXT)
# ═══════════════════════════════════════════════════════════════════════════

def extract_text_from_pdf_bytes(b: bytes) -> str:
    """Try pdfplumber first; fall back to OCR via PyMuPDF + pytesseract."""
    parts = []
    try:
        with pdfplumber.open(BytesIO(b)) as pdf:
            for page in pdf.pages:
                t = page.extract_text()
                if t:
                    parts.append(t)
    except Exception:
        pass

    if not parts:                          # scanned PDF → OCR
        try:
            pdf_doc = fitz.open(stream=b, filetype="pdf")
            for i, page in enumerate(pdf_doc, 1):
                pix = page.get_pixmap(dpi=300)
                img = Image.frombytes(
                    "RGB", [pix.width, pix.height], pix.samples)
                parts.append(
                    f"\n--- Page {i} ---\n{pytesseract.image_to_string(img)}")
        except Exception:
            pass

    return "\n".join(parts)


def extract_text_from_image_bytes(b: bytes) -> str:
    try:
        return pytesseract.image_to_string(Image.open(BytesIO(b)))
    except Exception:
        return ""


def extract_text_from_docx_bytes(b: bytes) -> str:
    try:
        doc = docx_lib.Document(BytesIO(b))
        return "\n".join(p.text for p in doc.paragraphs)
    except Exception:
        return ""


def extract_text_from_odt_bytes(b: bytes) -> str:
    try:
        doc = opendocument.load(BytesIO(b))
        paras = doc.getElementsByType(odf_text.P)
        return "\n".join(teletype.extractText(p) for p in paras)
    except Exception:
        return ""


def extract_text(file_bytes: bytes, filename: str, content_type: str = "") -> str:
    """Dispatch to the correct extractor based on filename / MIME type."""
    fn = filename.lower()
    mime = content_type.lower()

    if fn.endswith(".pdf") or "pdf" in mime:
        return extract_text_from_pdf_bytes(file_bytes)
    elif fn.endswith((".png", ".jpg", ".jpeg", ".tiff", ".bmp")) or mime.startswith("image/"):
        return extract_text_from_image_bytes(file_bytes)
    elif fn.endswith(".docx"):
        return extract_text_from_docx_bytes(file_bytes)
    elif fn.endswith(".odt"):
        return extract_text_from_odt_bytes(file_bytes)
    elif fn.endswith(".txt"):
        return file_bytes.decode("utf-8", errors="ignore")
    else:
        # Last resort: try to decode as plain text
        return file_bytes.decode("utf-8", errors="ignore")


# ═══════════════════════════════════════════════════════════════════════════
# SUMMARIZATION
# ═══════════════════════════════════════════════════════════════════════════

def generate_summary(text: str, max_chunk_tokens: int = 900) -> str:
    text = text.strip()
    if not text:
        return "No text available to summarise."

    if len(text.split()) < 100:
        return summarizer_pipeline(
            text, max_length=150, min_length=30, do_sample=False
        )[0]["generated_text"]   # ← changed from summary_text

    input_ids = _tokenizer(text, return_tensors="pt",
                           truncation=False)["input_ids"][0]
    chunks = [input_ids[i: i + max_chunk_tokens]
              for i in range(0, len(input_ids), max_chunk_tokens)]

    summaries = []
    for chunk in chunks:
        chunk_text = _tokenizer.decode(chunk, skip_special_tokens=True)
        try:
            s = summarizer_pipeline(
                chunk_text, max_length=250, min_length=80, do_sample=False
            )[0]["generated_text"]   # ← changed from summary_text
            summaries.append(s)
        except Exception:
            continue

    if not summaries:
        return "Could not generate summary."

    combined = " ".join(summaries)
    if len(summaries) > 1:
        return summarizer_pipeline(
            combined, max_length=300, min_length=100, do_sample=False
        )[0]["generated_text"]   # ← changed from summary_text
    return combined

# ═══════════════════════════════════════════════════════════════════════════
# CLASSIFICATION
# ═══════════════════════════════════════════════════════════════════════════


def classify_text(extracted_text: str):
    try:
        probs = clf.predict_proba([extracted_text])[0]
        idx = probs.argmax()
        return clf.classes_[idx], float(probs[idx])
    except AttributeError:          # classifier has no predict_proba
        pred = clf.predict([extracted_text])[0]
        return pred, None


# ═══════════════════════════════════════════════════════════════════════════
# ROUTING — email  +  folder storage
# ═══════════════════════════════════════════════════════════════════════════

def _resolve_department(predicted_label: str, probability):
    """Return (department_or_None, note) based on label and confidence."""
    if probability is not None and probability < CONFIDENCE_THRESHOLD:
        return None, "low_confidence_below_threshold"
    department = ROUTING_RULES.get(predicted_label)
    if not department:
        return None, "unmapped_label"
    return department, "ok"


def route_and_send_email(predicted_label: str, document_path: str,
                         probability, summary: str) -> dict:
    """Send email with both the original document and the summary."""
    department, note = _resolve_department(predicted_label, probability)

    if department is None:
        return {"route_to": "manual_review", "emails": [], "note": note}

    emails = DEPARTMENT_EMAILS.get(department)
    if not emails:
        return {"route_to": "manual_review", "emails": [], "note": "no_emails_configured"}

    subject = f"New Document Routed: {predicted_label}"
    body = (
        f"A new {predicted_label} document has been routed to your department."
        f"Summary:{summary}"
    )
    send_document_email(emails, subject, body, document_path)

    return {"route_to": department, "emails": emails, "note": "email_sent_successfully"}


def route_and_store(predicted_label: str, document_path: str,
                    probability, summary: str) -> dict:
    """Move the document to a department folder and save an accompanying summary .txt."""
    department, note = _resolve_department(predicted_label, probability)

    target_dir = (
        os.path.join(BASE_STORAGE_DIR, department)
        if department
        else MANUAL_REVIEW_DIR
    )
    note = note if department is None else "routed_successfully"
    os.makedirs(target_dir, exist_ok=True)

    stored_doc_path = None
    stored_summary_path = None

    if document_path and os.path.exists(document_path):
        filename = os.path.basename(document_path)
        target_path = os.path.join(target_dir, filename)

        # Avoid overwrite
        if os.path.exists(target_path):
            base, ext = os.path.splitext(filename)
            target_path = os.path.join(target_dir, f"{base}_1{ext}")

        shutil.move(document_path, target_path)
        stored_doc_path = target_path

        # Write summary alongside the document
        summary_filename = os.path.splitext(os.path.basename(target_path))[
            0] + "_summary.txt"
        stored_summary_path = os.path.join(target_dir, summary_filename)
        with open(stored_summary_path, "w", encoding="utf-8") as f:
            f.write(f"Document: {filename}\n")
            f.write(f"Label   : {predicted_label}\n")
            f.write(f"Department: {department or 'manual_review'}\n\n")
            f.write("=== SUMMARY ===\n")
            f.write(summary)

    return {
        "route_to": os.path.basename(target_dir),
        "stored_at": stored_doc_path,
        "summary_stored_at": stored_summary_path,
        "note": note,
    }


# ═══════════════════════════════════════════════════════════════════════════
# HELPERS
# ═══════════════════════════════════════════════════════════════════════════

def save_upload(file: UploadFile) -> str:
    path = os.path.join(STORAGE_DIR, file.filename)
    with open(path, "wb") as f:
        shutil.copyfileobj(file.file, f)
    return path


# ═══════════════════════════════════════════════════════════════════════════
# ENDPOINTS
# ═══════════════════════════════════════════════════════════════════════════

@app.get("/")
def home():
    return {"status": "running", "message": "IDMS — Classify · Summarise · Route"}


@app.post("/ingest")
async def ingest(file: UploadFile = File(None), text: str = Form(None)):
    """
    Accepts a PDF / image / DOCX / ODT / TXT file  OR  raw text.

    Pipeline:
      1. Extract text
      2. Classify document
      3. Summarise document
      4. Route: send email (with summary in body + document attachment)
      5. Route: store document + summary .txt in department folder
    """
    if file is None and not text:
        return JSONResponse({"error": "Provide a file or text."}, status_code=400)

    # ── 1. Extract ──────────────────────────────────────────────────────────
    extracted_text = ""
    saved_path = None

    if file:
        saved_path = save_upload(file)
        file_bytes = open(saved_path, "rb").read()
        extracted_text = extract_text(
            file_bytes, file.filename, file.content_type or "")
    else:
        extracted_text = text

    if not extracted_text.strip():
        return JSONResponse({"error": "Could not extract text from the provided input."},
                            status_code=422)

    # ── 2. Classify ─────────────────────────────────────────────────────────
    predicted_label, probability = classify_text(extracted_text)

    # ── 3. Summarise ────────────────────────────────────────────────────────
    summary = generate_summary(extracted_text)

    # ── 4. Email routing ────────────────────────────────────────────────────
    email_info = route_and_send_email(
        predicted_label, saved_path, probability, summary)

    # ── 5. Folder storage ───────────────────────────────────────────────────
    #  NOTE: route_and_store may *move* saved_path, so call it after emailing.
    storage_info = route_and_store(
        predicted_label, saved_path, probability, summary)

    return JSONResponse({
        "predicted_label": predicted_label,
        "probability": probability,
        "summary": summary,
        **email_info,
        **{f"storage_{k}": v for k, v in storage_info.items()},
    })


# ═══════════════════════════════════════════════════════════════════════════
# MANUAL SMOKE-TEST
# ═══════════════════════════════════════════════════════════════════════════

if __name__ == "__main__":
    TEST_DOC = "storage/CV.pdf"
    if not os.path.exists(TEST_DOC):
        raise FileNotFoundError(TEST_DOC)

    print("── Extracting text …")
    with open(TEST_DOC, "rb") as f:
        raw = f.read()
    text_out = extract_text(raw, TEST_DOC)
    print(text_out[:300], "…\n")

    print("── Classifying …")
    label, prob = classify_text(text_out)
    print(f"  label={label}  prob={prob}\n")

    print("── Summarising …")
    summ = generate_summary(text_out)
    print(f"  {summ}\n")

    print("── Email routing …")
    print(route_and_send_email(label, TEST_DOC, prob, summ))

    print("── Folder routing …")
    print(route_and_store(label, TEST_DOC, prob, summ))
