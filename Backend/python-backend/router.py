import joblib
import os
from config.routing_rules import ROUTING_RULES
from config.departments import DEPARTMENT_EMAILS
from utils.email_sender import send_document_email

# Load classifier
MODEL_PATH = "models/doc_clf.joblib"
model = joblib.load(MODEL_PATH)

# Your classifier must take text input, so we need a helper:


def extract_text_from_pdf(pdf_path):
    # Minimal safe text reader
    import fitz  # PyMuPDF
    doc = fitz.open(pdf_path)
    text = ""
    for page in doc:
        text += page.get_text()
    return text


def classify_document(document_path):
    text = extract_text_from_pdf(document_path)
    prediction = model.predict([text])[0]
    return prediction


def route_document(doc_type, document_path):
    # Step 1: Map document type → department
    department = ROUTING_RULES.get(doc_type)

    if not department:
        raise ValueError(
            f"No routing rule found for document type: {doc_type}")

    # Step 2: Get emails for that department
    emails = DEPARTMENT_EMAILS.get(department)
    if not emails:
        raise ValueError(f"No emails configured for department: {department}")

    # Step 3: Send email with attachment
    subject = f"New Document Routed ({doc_type})"
    body = f"A new {doc_type} document has been routed to your department."

    send_document_email(emails, subject, body, document_path)

    return {
        "status": "success",
        "department": department,
        "emails": emails,
        "document_sent": document_path
    }
