import smtplib
from email.message import EmailMessage
import os

SMTP_SERVER = "smtp.gmail.com"
SMTP_PORT = 587
SENDER_EMAIL = "pankhigupta440@gmail.com"
SENDER_PASSWORD = "oxexefdunwhhbwrm"  # Use App Passwords, not raw passwords


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
