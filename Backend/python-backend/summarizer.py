# summarizer.py

import pytesseract
from PIL import Image
import pdfplumber
import fitz  # PyMuPDF
import docx
from odf import text, teletype, opendocument
import os
from transformers import pipeline, AutoTokenizer, AutoModelForSeq2SeqLM
import io

# Define models
model_name = "facebook/bart-large-cnn"
tokenizer = AutoTokenizer.from_pretrained(model_name)
model = AutoModelForSeq2SeqLM.from_pretrained(model_name)

# Create summarizer pipeline
summarizer_pipeline = pipeline(
    "summarization", model=model, tokenizer=tokenizer)

pytesseract.pytesseract.tesseract_cmd = r"C:\Program Files\Tesseract-OCR\tesseract.exe"

# --- Text extraction from multiple file types ---


def extract_text_from_file(file_bytes, filename):
    ext = filename.lower()
    text_data = ""

    try:
        if ext.endswith(".pdf"):
            # Try normal text extraction first
            with pdfplumber.open(io.BytesIO(file_bytes)) as pdf:
                for page in pdf.pages:
                    page_text = page.extract_text()
                    if page_text:
                        text_data += page_text + "\n"

            # If no text found → OCR fallback
            if not text_data.strip():
                pdf_doc = fitz.open(stream=file_bytes, filetype="pdf")
                for i, page in enumerate(pdf_doc, start=1):
                    pix = page.get_pixmap(dpi=300)
                    img = Image.frombytes(
                        "RGB", [pix.width, pix.height], pix.samples)
                    ocr_text = pytesseract.image_to_string(img)
                    text_data += f"\n\n--- Page {i} ---\n{ocr_text}"

        elif ext.endswith((".png", ".jpg", ".jpeg")):
            img = Image.open(io.BytesIO(file_bytes))
            text_data = pytesseract.image_to_string(img)

        elif ext.endswith(".docx"):
            doc = docx.Document(io.BytesIO(file_bytes))
            for para in doc.paragraphs:
                text_data += para.text + "\n"

        elif ext.endswith(".odt"):
            doc = opendocument.load(io.BytesIO(file_bytes))
            allparas = doc.getElementsByType(text.P)
            for p in allparas:
                text_data += teletype.extractText(p) + "\n"

        elif ext.endswith(".txt"):
            text_data = file_bytes.decode("utf-8", errors="ignore")

        else:
            return "Unsupported file type."

    except Exception as e:
        return f"Error reading file: {e}"

    return text_data.strip()


# --- Summarization function ---
def generate_summary(text, max_chunk_tokens=900):
    if not text.strip():
        return "No text to summarize."

    # Short text
    if len(text.split()) < 100:
        return summarizer_pipeline(text, max_length=150, min_length=30, do_sample=False)[0]['summary_text']

    # Split into token chunks
    inputs = tokenizer(text, return_tensors="pt",
                       truncation=False)["input_ids"][0]
    token_chunks = [inputs[i:i+max_chunk_tokens]
                    for i in range(0, len(inputs), max_chunk_tokens)]

    summaries = []
    for chunk in token_chunks:
        chunk_text = tokenizer.decode(chunk, skip_special_tokens=True)
        try:
            summary = summarizer_pipeline(
                chunk_text, max_length=250, min_length=80, do_sample=False)[0]['summary_text']
            summaries.append(summary)
        except:
            continue

    combined_summary = " ".join(summaries)

    # Final compression if multiple chunks
    if len(summaries) > 1:
        final_summary = summarizer_pipeline(
            combined_summary, max_length=300, min_length=100, do_sample=False)[0]['summary_text']
        return final_summary
    else:
        return combined_summary
