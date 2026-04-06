# backend/ python-backend/summarizer.py

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
import time 
import pandas as pd

from datetime import datetime, timezone, timedelta
from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_core.messages import HumanMessage
from dotenv import load_dotenv

from langchain_groq import ChatGroq
from langchain_core.messages import HumanMessage
import os

load_dotenv()

llm = ChatGoogleGenerativeAI(
    model="gemini-2.5-flash", 
    google_api_key=os.getenv("GOOGLE_MULTI_SUMMARIZER_API_KEY")
)

detailed_gemini_key = os.getenv("DETAILED_ANALYSIS_GEMINI_KEY")
detailed_groq_key = os.getenv("DETAILED_ANALYSIS_GROQ_KEY")
deadline_key = os.getenv("DEADLINE_EXTRACTION_GEMINI_KEY")

detailed_gemini_llm = None
detailed_groq_llm = None

if detailed_gemini_key:
    detailed_gemini_llm = ChatGoogleGenerativeAI(
        model="gemini-2.5-flash", 
        api_key=detailed_gemini_key
    )

if detailed_groq_key:

    detailed_groq_llm = ChatGroq(
        model="llama-3.1-8b-instant", 
        api_key=detailed_groq_key
    )

deadline_llm = ChatGoogleGenerativeAI(
    model="gemini-2.5-flash", 
    google_api_key=deadline_key
) if deadline_key else llm

def generate_detailed_summary(text):
    if not text.strip():
        return "No text available for detailed analysis."
        
    prompt = f"""Please provide a highly detailed, comprehensive summary of this entire document. Break it down into key points and main takeaways. Format it as plain text. Do NOT use markdown formatting, asterisks, or bold text.
    
    DOCUMENT TEXT:
    {text[:15000]} # Limit to 15k chars to prevent exceeding Groq's 6k Token Per Minute limit
    """
    
    # 1. Try Gemini First
    if detailed_gemini_llm:
        try:
            response = detailed_gemini_llm.invoke([HumanMessage(content=prompt)])
            return response.content.replace('*', '').strip()
        except Exception as e:
            print(f"⚠️ Detailed Analysis Gemini hit quota: {e}. Rerouting to Groq...")
            
            # 2. Fallback to Groq
            if detailed_groq_llm:
                try:
                    response = detailed_groq_llm.invoke([HumanMessage(content=prompt)])
                    return response.content.replace('*', '').strip()
                except Exception as fallback_e:
                    return f"Fallback AI also failed: {fallback_e}"
            
            return "Gemini quota exceeded and no Groq fallback configured."
            
    # 3. Use Groq if no Gemini key exists
    elif detailed_groq_llm:
        try:
            response = detailed_groq_llm.invoke([HumanMessage(content=prompt)])
            return response.content.replace('*', '').strip()
        except Exception as e:
             return f"Groq AI failed: {e}"
             
    return "Detailed Analysis skipped: No API keys configured in .env."

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
        # --- PDF SUPPORT ---
        if ext.endswith(".pdf"):
            with pdfplumber.open(io.BytesIO(file_bytes)) as pdf:
                for page in pdf.pages[:5]:
                    page_text = page.extract_text()
                    if page_text:
                        text_data += page_text + "\n"
            
            if not text_data.strip():
                pdf_doc = fitz.open(stream=file_bytes, filetype="pdf")
                for i, page in enumerate(pdf_doc.pages(0, 2), start=1): 
                    pix = page.get_pixmap(dpi=200) 
                    img = Image.frombytes("RGB", [pix.width, pix.height], pix.samples)
                    text_data += pytesseract.image_to_string(img) + "\n"

        # --- IMAGE SUPPORT---
        elif ext.endswith((".png", ".jpg", ".jpeg", ".tiff", ".bmp", ".webp")):
            img = Image.open(io.BytesIO(file_bytes))
            text_data = pytesseract.image_to_string(img)

        # --- EXCEL / CSV SUPPORT ---
        elif ext.endswith((".xlsx", ".xls", ".csv")):
            if ext.endswith(".csv"):
                df = pd.read_csv(io.BytesIO(file_bytes))
            else:
                df = pd.read_excel(io.BytesIO(file_bytes))
            
            text_lines = []
            for _, row in df.head(30).iterrows(): 

                row_str = ", ".join([f"{col}: {val}" for col, val in row.items() if pd.notna(val)])
                text_lines.append(row_str + ".")
            
            text_data = " ".join(text_lines)

        # --- DOCX SUPPORT ---
        elif ext.endswith(".docx"):
            doc = docx.Document(io.BytesIO(file_bytes))
            for para in doc.paragraphs[:50]: 
                text_data += para.text + "\n"

        # --- TXT SUPPORT ---
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

import random

def detect_document_type(text):
    """Quickly scans text for keywords and returns a randomized introductory sentence."""
    text_lower = text.lower()
    
    # 1. Resume / Professional Profile
    if any(k in text_lower for k in ["experience", "education", "skills", "projects", "contact information"]):
        options = [
            "This document appears to be a resume for a professional profile. It highlights that ",
            "Based on the credentials provided, this professional summary showcases how ",
            "This CV outlines a career trajectory, emphasizing that ",
            "The following professional profile details the expertise and ",
            "This career overview documents the professional background and "
        ]
        return random.choice(options)
    
    # 2. Research Paper / Academic Study
    if any(k in text_lower for k in ["abstract", "methodology", "conclusion", "references", "doi:"]):
        options = [
            "This research paper discusses ",
            "The following academic study explores ",
            "In this scholarly article, the authors investigate ",
            "This technical paper presents findings regarding ",
            "This scientific analysis examines the core aspects of "
        ]
        return random.choice(options)
    
    # 3. Notice / Formal Correspondence
    if any(k in text_lower for k in ["hereby", "notice is given", "dear", "sincerely", "subject:"]):
        options = [
            "This notice states that ",
            "The following announcement informs the recipient that ",
            "As per this formal communication, it is noted that ",
            "This official correspondence declares that ",
            "This formal letter provides notification regarding "
        ]
        return random.choice(options)
        
    options = [
        "In this document, it is stated that ",
        "The text provided conveys information about ",
        "According to the content, the main point is that ",
        "The following information indicates that ",
        "This record provides an overview of how ",
        "The provided text outlines the details concerning ",
        "Based on the documentation, it appears that ",
        "This summary covers the primary details of ",
        "The essential contents of this file suggest that "
    ]
    return random.choice(options)

def run_model_inference(text, max_len=100, min_len=30):
    """Optimized for speed (low beams) but high abstraction (repetition penalty)."""
    inputs = tokenizer(text, max_length=1024, return_tensors="pt", truncation=True).to(device)
    
    summary_ids = model.generate(
        inputs["input_ids"], 
        max_length=max_len, 
        min_length=min_len, 
        num_beams=2,             
        length_penalty=1.0,   
        do_sample=False, 
        early_stopping=True,
        no_repeat_ngram_size=3,  
        repetition_penalty=1.5  
    )
    return tokenizer.decode(summary_ids[0], skip_special_tokens=True)

def generate_summary(text):
    if not text.strip():
        return "No text to summarize."

    text = " ".join(text.split())
    essential_text = get_essential_section(text)

    if len(essential_text.split()) < 40:
        return f"This document mentions: {essential_text}"

    try:
        raw_summary = run_model_inference(essential_text, max_len=100, min_len=30)
        
        clean_summary = raw_summary.strip()

        prefix = detect_document_type(text[:1000]) 
        
        if clean_summary.lower().startswith("the "):
            clean_summary = clean_summary[4:]

        if clean_summary.lower().startswith(prefix.lower().strip()):
             clean_summary = clean_summary[len(prefix):].strip()

        return f"{prefix}{clean_summary}"
        
    except Exception as e:
        return f"Summarization failed: {str(e)}"

def generate_integrated_summary(summaries_with_titles):
    """
    Takes locally generated summaries and uses Gemini to write a cohesive paragraph.
    Safely falls back to a clean list if Gemini fails.
    """
    
    valid_items = [
        item for item in summaries_with_titles 
        if "Processing document with AI" not in item.get('summary', '')
    ]
    
    # Slice to 4 documents
    items_to_process = valid_items[:4]
    count = len(items_to_process)
    
    if count == 0:
        return "Not enough fully processed documents to generate an insight."

    # Prepare data for Gemini
    raw_compilation = ""
    for item in items_to_process:
        raw_compilation += f"Title: '{item['title']}'\nSummary: {item['summary']}\n\n"

    prompt = f"""
    You are an expert executive assistant. I will provide you with the titles and summaries of {count} recent documents. 
    Your task is to write a clear, cohesive executive overview of these documents.

    CRITICAL RULES:
    1. Group by Theme: Identify documents that share a common theme. Summarize related documents in the same paragraph.
    2. Mention Titles: Naturally weave the exact document titles (enclose them in 'single quotes') into your sentences.
    3. Natural Flow: Write readable, professional prose.
    4. Formatting Strictness: ABSOLUTELY NO markdown, no asterisks (*), and no bold text. Plain text only.

    DOCUMENTS TO SUMMARIZE:
    {raw_compilation}
    """

    max_retries = 2
    for attempt in range(max_retries):
        try:
            response = llm.invoke([HumanMessage(content=prompt)])
            return response.content.replace('*', '').strip()
            
        except Exception as e:
            # print actual error 
            print(f"\n[GEMINI AGGREGATION ERROR]: {str(e)}\n")
            
            if "429" in str(e) or "RESOURCE_EXHAUSTED" in str(e):
                if attempt < max_retries - 1:
                    time.sleep(5)
                    continue
            
            # PERFECTLY CLEAN FALLBACK: No HTML tags at all, just text
            fallback_parts = []
            for item in items_to_process:
                fallback_parts.append(f"📄 {item['title'].upper()}:\n{item['summary']}")

            return "\n\n".join(fallback_parts)

def extract_deadline_with_ai(text, default_days=14):
    """Uses Gemini to smartly extract deadlines, or applies a default duration."""
    now = datetime.now(timezone.utc)
    
    if not text or not text.strip():
        return (now + timedelta(days=default_days)).strftime("%Y-%m-%d")

    today_str = now.strftime("%Y-%m-%d")

    # SAFE PROMPT: No raw document text inside the f-string
    instructions = f"""
    You are a strict data extraction assistant. Find the most critical deadline or due date in the following document.
    
    RULES:
    1. If the text mentions a relative date (e.g., "within 14 days", "in 48 hours"), calculate the exact date assuming today is {today_str}.
    2. If it mentions a vague date like "27march" or "March 27", assume it is for the current year.
    3. Format your response STRICTLY as YYYY-MM-DD.
    4. If there is absolutely no deadline or due date mentioned, respond ONLY with the word: None.
    5. Do not include any other words, explanations, or markdown. Just the date or "None".

    DOCUMENT TEXT:
    """
    
    # Safely concatenate to avoid Python curly brace crashes
    prompt = instructions + text[:8000]

    try:
        import re
        response = deadline_llm.invoke([HumanMessage(content=prompt)])
        result = response.content.strip()
        
        # Verify it actually looks like a YYYY-MM-DD date
        if re.match(r"^\d{4}-\d{2}-\d{2}$", result):
            return result
            
    except Exception as e:
        print(f"AI Deadline Extraction Failed: {e}")
        
    # --- FALLBACK LOGIC ---
    return (now + timedelta(days=default_days)).strftime("%Y-%m-%d")