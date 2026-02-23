# app.py

import io
from typing import List
from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from summarizer import (
    extract_text_from_file, 
    generate_summary, 
    generate_integrated_summary
)

app = FastAPI(title="Document Intelligence API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["*"]
)

@app.get("/")
def home():
    """Health check endpoint."""
    return {
        "status": "online", 
        "engine": "DistilBART-CNN",
        "features": ["single-doc-hover", "multi-doc-integration"]
    }

@app.post("/summarize")
async def summarize_single(file: UploadFile = File(...)):
    try:
        # Use await since this is async def
        raw_bytes = await file.read() 
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
    MULTI-DOC ENDPOINT (Use for Department View)
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
            "summary": integrated_overview
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Integration error: {str(e)}")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=8000)