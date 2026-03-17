# backend/summarizer/summarizer.py

import pytesseract
from PIL import Image
import pdfplumber
import fitz
import docx
from odf.opendocument import load
from odf import teletype
from odf.text import P
import os
import torch
from transformers import AutoTokenizer, AutoModelForSeq2SeqLM
import io
import re

model_name = "sshleifer/distilbart-cnn-12-6"
tokenizer = AutoTokenizer.from_pretrained(model_name)
model = AutoModelForSeq2SeqLM.from_pretrained(model_name)

device = "cuda" if torch.cuda.is_available() else "cpu"
model.to(device)

pytesseract.pytesseract.tesseract_cmd = r"C:\Program Files\Tesseract-OCR\tesseract.exe"

def extract_text_from_file(file_bytes, filename):
    ext = filename.lower()
    text_data = ""
    try:
        if ext.endswith(".pdf"):
            with pdfplumber.open(io.BytesIO(file_bytes)) as pdf:
                for page in pdf.pages[:5]:
                    page_text = page.extract_text()
                    if page_text:
                        text_data += page_text + "\n"
            
            if not text_data.strip():
                pdf_doc = fitz.open(stream=file_bytes, filetype="pdf")
                for i, page in enumerate(pdf_doc.pages(0, 2), start=1): # OCR first 2 pages
                    pix = page.get_pixmap(dpi=200) 
                    img = Image.frombytes("RGB", [pix.width, pix.height], pix.samples)
                    text_data += pytesseract.image_to_string(img) + "\n"

        elif ext.endswith((".png", ".jpg", ".jpeg")):
            img = Image.open(io.BytesIO(file_bytes))
            text_data = pytesseract.image_to_string(img)

        elif ext.endswith(".docx"):
            doc = docx.Document(io.BytesIO(file_bytes))
            for para in doc.paragraphs[:50]: 
                text_data += para.text + "\n"

        elif ext.endswith(".txt"):
            text_data = file_bytes.decode("utf-8", errors="ignore")[:5000] 

        else:
            return "Unsupported file type."
    except Exception as e:
        return f"Error reading file: {e}"
    
    return text_data.strip()

def get_essential_section(text):
    """Cleverly finds the Introduction or Abstract, otherwise returns top 1000 tokens."""
    # common header keywords
    pattern = re.compile(r'(abstract|introduction|summary|executive summary)', re.IGNORECASE)
    match = pattern.search(text)
    
    if match:
        # taking next 3000 chars form keyword
        start_index = match.start()
        return text[start_index : start_index + 3000]
    
    # default... return the start of doc
    return text[:4000] 

def run_model_inference(text, max_len=150, min_len=40):
    """Optimized for maximum speed: num_beams=1"""
    inputs = tokenizer(text, max_length=1024, return_tensors="pt", truncation=True).to(device)
    
    summary_ids = model.generate(
        inputs["input_ids"], 
        max_length=max_len, 
        min_length=min_len, 
        num_beams=1,           
        do_sample=False, 
        early_stopping=True
    )
    return tokenizer.decode(summary_ids[0], skip_special_tokens=True)

def detect_document_type(text):
    """Quickly scans text for keywords to identify the document type."""
    text_lower = text.lower()
    
    # resume
    if any(k in text_lower for k in ["experience", "education", "skills", "projects", "contact information"]):
        return "This document appears to be a resume for a professional profile. It highlights that "
    
    # research paper
    if any(k in text_lower for k in ["abstract", "methodology", "conclusion", "references", "doi:"]):
        return "This research paper discusses "
    
    # notice
    if any(k in text_lower for k in ["hereby", "notice is given", "dear", "sincerely", "subject:"]):
        return "This official notice/communication states that "
        
    # default
    return "This document states that "

def generate_summary(text):
    if not text.strip():
        return "No text to summarize."

    # get introduction/abstract
    essential_text = get_essential_section(text)

    # detect doc type
    prefix = detect_document_type(text[:2000]) 

    try:
        # generate summ
        raw_summary = run_model_inference(essential_text)
        
        # remove trailing spaces
        clean_summary = raw_summary.strip()
        
        # combine prefix with sum..
        if clean_summary.lower().startswith("the "):
            clean_summary = clean_summary[4:]
            
        return f"{prefix}{clean_summary}"
        
    except Exception as e:
        return f"Summarization failed: {str(e)}"

def generate_integrated_summary(summaries_with_titles):
    """
    Builds a natural-sounding, human-readable summary paragraph 
    without forcing the DistilBART model to understand instructions.
    """
    count = len(summaries_with_titles)
    
    if count == 0:
        return "No documents provided."
        
    if count == 1:
        return summaries_with_titles[0]['summary']

    order_words = ["first", "second", "third", "fourth", "fifth", "sixth", "seventh", "eighth", "ninth", "tenth"]
    
    final_text = f"I have analyzed the {count} provided documents. Here is the breakdown:\n\n"

    for i, item in enumerate(summaries_with_titles):
        title = item['title']
        sum_text = item['summary']
        
        nth = order_words[i] if i < len(order_words) else f"{i+1}th"

        if "resume for a professional profile" in sum_text:
            clean_sum = sum_text.replace("This document appears to be a resume for a professional profile. It highlights that ", "")
            paragraph = f"The {nth} document, titled '{title}', is a resume that highlights {clean_sum}"
            
        elif "research paper discusses" in sum_text:
            clean_sum = sum_text.replace("This research paper discusses ", "")
            paragraph = f"The {nth} document, titled '{title}', is a research paper that discusses {clean_sum}"
            
        elif "official notice/communication states" in sum_text:
            clean_sum = sum_text.replace("This official notice/communication states that ", "")
            paragraph = f"The {nth} document, titled '{title}', is an official notice stating that {clean_sum}"
            
        else:
            clean_sum = sum_text.replace("This document states that ", "")
            paragraph = f"The {nth} document, titled '{title}', states that {clean_sum}"

        final_text += paragraph + "\n\n"

    return final_text.strip()