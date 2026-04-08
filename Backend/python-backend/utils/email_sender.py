import os
import smtplib
from email.message import EmailMessage
from dotenv import load_dotenv 
load_dotenv() 

SMTP_SERVER = "smtp.gmail.com"
SMTP_PORT = 587

SENDER_EMAIL = os.getenv("EMAIL_USER")
SENDER_PASSWORD = os.getenv("EMAIL_PASS")

def send_document_email(recipients, subject, body, file_path):
    msg = EmailMessage()
    msg["From"] = SENDER_EMAIL
    msg["To"] = ", ".join(recipients)
    msg["Subject"] = subject
    msg.set_content(body)

    # Attach the document
    with open(file_path, "rb") as f:
        file_data = f.read()
        file_name = os.path.basename(file_path)

    msg.add_attachment(file_data, maintype="application",
                       subtype="octet-stream", filename=file_name)

    # Send via SMTP
    with smtplib.SMTP(SMTP_SERVER, SMTP_PORT) as server:
        server.starttls()
        server.login(SENDER_EMAIL, SENDER_PASSWORD)
        server.send_message(msg)

    return True


def send_document_email_bytes(recipients, subject, body, filename, file_bytes, content_type="application/octet-stream"):
    msg = EmailMessage()
    msg["From"] = SENDER_EMAIL
    msg["To"] = ", ".join(recipients)
    msg["Subject"] = subject
    msg.set_content(body)

    maintype, subtype = ("application", "octet-stream")
    if content_type and "/" in content_type:
        parts = content_type.split("/", 1)
        maintype = parts[0] or "application"
        subtype = parts[1] or "octet-stream"

    msg.add_attachment(file_bytes, maintype=maintype, subtype=subtype, filename=filename)

    with smtplib.SMTP(SMTP_SERVER, SMTP_PORT) as server:
        server.starttls()
        server.login(SENDER_EMAIL, SENDER_PASSWORD)
        server.send_message(msg)

    return True
