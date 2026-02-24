# sends email.

# app.py
import os
import shutil
import joblib
from io import BytesIO
from fastapi import FastAPI, File, UploadFile, Form
from fastapi.responses import JSONResponse
from PIL import Image
import pytesseract
import pdfplumber

# Email + Routing configs
from config.routing_rules import ROUTING_RULES
from config.departments import DEPARTMENT_EMAILS
from utils.email_sender import send_document_email

# Load classifier
MODEL_PATH = "models/doc_clf.joblib"
clf = joblib.load(MODEL_PATH)

STORAGE_DIR = "storage"
os.makedirs(STORAGE_DIR, exist_ok=True)

CONFIDENCE_THRESHOLD = 0.50

app = FastAPI(title="IDMS Classifier + Router")

BASE_STORAGE_DIR = "storage"
MANUAL_REVIEW_DIR = os.path.join(BASE_STORAGE_DIR, "manual_review")
os.makedirs(MANUAL_REVIEW_DIR, exist_ok=True)


# --------------------------------------------------------
# TEXT EXTRACTION FUNCTIONS (UNCHANGED)
# --------------------------------------------------------
def extract_text_from_pdf_bytes(b: bytes) -> str:
    text_parts = []
    try:
        with pdfplumber.open(BytesIO(b)) as pdf:
            for page in pdf.pages:
                t = page.extract_text()
                if t:
                    text_parts.append(t)
    except Exception:
        pass

    if not text_parts:
        try:
            from pdf2image import convert_from_bytes
            pages = convert_from_bytes(b)
            for p in pages:
                text_parts.append(pytesseract.image_to_string(p))
        except Exception:
            try:
                img = Image.open(BytesIO(b))
                text_parts.append(pytesseract.image_to_string(img))
            except Exception:
                pass

    return "\n".join(text_parts)


def extract_text_from_image_bytes(b: bytes) -> str:
    try:
        img = Image.open(BytesIO(b))
        return pytesseract.image_to_string(img)
    except Exception:
        return ""


def save_upload(file: UploadFile):
    safe_name = file.filename
    path = os.path.join(STORAGE_DIR, safe_name)
    with open(path, "wb") as f:
        shutil.copyfileobj(file.file, f)
    return path


# --------------------------------------------------------
# CLASSIFICATION
# --------------------------------------------------------
def classify_text(extracted_text: str):
    try:
        probs = clf.predict_proba([extracted_text])[0]
        idx = probs.argmax()
        pred = clf.classes_[idx]
        proba = float(probs[idx])
        return pred, proba
    except Exception:
        pred = clf.predict([extracted_text])[0]
        return pred, None


# --------------------------------------------------------
# ROUTING + EMAIL SENDING
# --------------------------------------------------------
def route_and_send(predicted_label, document_path, probability):
    # Low confidence fallback
    if probability is not None and probability < CONFIDENCE_THRESHOLD:
        return {
            "route_to": "manual_review",
            "emails": [],
            "note": "low_confidence_below_threshold",
        }

    # 1. Map doc type → department
    department = ROUTING_RULES.get(predicted_label)
    if not department:
        return {
            "route_to": "manual_review",
            "emails": [],
            "note": "unmapped_label",
        }

    # 2. Get department emails
    emails = DEPARTMENT_EMAILS.get(department)
    if not emails:
        return {
            "route_to": "manual_review",
            "emails": [],
            "note": "no_emails_configured",
        }

    # 3. Send the email with the document
    subject = f"New Document Routed ({predicted_label})"
    body = f"A new {predicted_label} document has been routed to your department."

    send_document_email(emails, subject, body, document_path)

    return {
        "route_to": department,
        "emails": emails,
        "note": "email_sent_successfully",
    }

# route and store to department folder:


def route_and_store(predicted_label, document_path, probability):
    # Low confidence → manual review
    if probability is not None and probability < CONFIDENCE_THRESHOLD:
        target_dir = MANUAL_REVIEW_DIR
        note = "low_confidence_manual_review"
    else:
        department = ROUTING_RULES.get(predicted_label)
        if not department:
            target_dir = MANUAL_REVIEW_DIR
            note = "unmapped_label_manual_review"
        else:
            target_dir = os.path.join(BASE_STORAGE_DIR, department)
            note = "routed_successfully"

    os.makedirs(target_dir, exist_ok=True)

    if document_path:
        filename = os.path.basename(document_path)
        target_path = os.path.join(target_dir, filename)

        # Avoid overwrite
        if os.path.exists(target_path):
            base, ext = os.path.splitext(filename)
            target_path = os.path.join(target_dir, f"{base}_1{ext}")

        shutil.move(document_path, target_path)
    else:
        target_path = None

    return {
        "route_to": os.path.basename(target_dir),
        "stored_at": target_path,
        "note": note,
    }


# --------------------------------------------------------
# FASTAPI ENDPOINT
# --------------------------------------------------------
@app.post("/ingest")
async def ingest(file: UploadFile = File(None), text: str = Form(None)):
    """
    Accepts:
      • A PDF or image file
      • OR raw text

    Returns:
      • predicted label
      • probability
      • routed department
      • routed emails
    """
    if file is None and not text:
        return JSONResponse({"error": "Provide file or text"}, status_code=400)

    # Extract text from PDF / image / plain text
    extracted_text = ""
    saved_path = None

    if file:
        saved_path = save_upload(file)
        data = open(saved_path, "rb").read()
        mime = file.content_type.lower()

        if "pdf" in mime:
            extracted_text = extract_text_from_pdf_bytes(data)
        elif mime.startswith("image/") or saved_path.lower().endswith((".png", ".jpg", ".jpeg", ".tiff")):
            extracted_text = extract_text_from_image_bytes(data)
        else:
            try:
                extracted_text = data.decode(errors="ignore")
            except Exception:
                extracted_text = ""

    else:
        extracted_text = text
        saved_path = None

    if not extracted_text.strip():
        return JSONResponse({"error": "Could not extract text"}, status_code=422)

    # CLASSIFY
    predicted_label, probability = classify_text(extracted_text)

    # ROUTE + SEND EMAIL
    routing_info = route_and_send(predicted_label, saved_path, probability)

    # route +store email
    routing_info = route_and_store(predicted_label, saved_path, probability)

    return JSONResponse({
        "predicted_label": predicted_label,
        "probability": probability,
        "storage_path": saved_path,
        **routing_info
    })


# --------------------------------------------------------
# MANUAL TESTING
# --------------------------------------------------------
if __name__ == "__main__":
    test_doc = "storage/CV.pdf"

    if not os.path.exists(test_doc):
        raise FileNotFoundError(f"{test_doc} not found")

    print("Testing...")
    print("Extracting text...")

    with open(test_doc, "rb") as f:
        data = f.read()

    extracted = extract_text_from_pdf_bytes(data)

    print("Classifying...")
    pred, proba = classify_text(extracted)
    print(f"Prediction: {pred} | Probability: {proba}")

    print("Routing...")
    print(route_and_send(pred, test_doc, proba))

    print("Routing and storing...")
    routing_result = route_and_store(pred, test_doc, proba)

    print("Result:")
    print(routing_result)
