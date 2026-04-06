# Doclytic - A Unified Document Intelligence System

Doclytic is a unified document ecosystem that uses OCR and deep learning to extract, classify, summarize, and route documents automatically to relevant departments, improving efficiency and accuracy in handling large volumes of paperwork.

---

## 🎯 Key Features

* **OCR-Based Document Processing** – Extract text from scanned documents and images
* **AI-Powered Classification** – Automatically categorize documents
* **Smart Summarization** – Generate concise summaries using LLMs
* **Automated Routing** – Send documents to relevant departments
* **RAG Pipeline** – Context-aware querying over documents
* **Authentication System** – Secure login with JWT & Google OAuth
* **Real-time Updates** – WebSocket integration for live updates

---

## 📸 Screenshots

### Login Page

![Login Screenshot](./screenshots/dashboard.png)

### Dashboard

![Dashboard1 Screenshot](./screenshots/dashboard.png)
![Dashboard2 Screenshot](./screenshots/dashboard.png)

### Summary (Quick View + Multidoc)

![summary Screenshot](./screenshots/dashboard.png)

### Compliance Calendar

![Compliance_Calendar Screenshot](./screenshots/upload.png)

### Gmail Fetch

![Gmail Screenshot](./screenshots/analysis.png)

### Document Detail Dashboard

![DDD Screenshot](./screenshots/rag.png)

### RAG based chat

![RAG Screenshot](./screenshots/rag.png)

---

## 🎥 Demo

👉 **Watch Full Working Demo:**

[Google Drive Demo Link](PASTE_YOUR_DRIVE_LINK_HERE)

---

## 🛠 Prerequisites

Node.js (v18+)
Python (3.9+)
MongoDB (Local or Atlas)
API Keys: Gemini, Groq, and Google Cloud Console

---

## ⚙️ Environment Setup

You must create .env files in both the Backend and Frontend directories.

### 1. Backend Environment (/Backend/.env)

```
# Database & Auth
MONGO_URI=your_mongodb_connection_string
JWT_SECRET=your_random_secret_string
CORS_ORIGINS=http://localhost:5173
FRONTEND_URL=http://localhost:5173

# AI Model Keys
GEMINI_API_KEY=your_key
GOOGLE_MULTI_SUMMARIZER_API_KEY=your_key
DETAILED_ANALYSIS_GROQ_KEY=your_key
# ... (Add all other Gemini/Groq keys here)

# Google OAuth
GOOGLE_CLIENT_ID=your_id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your_secret
GOOGLE_REDIRECT_URI=http://localhost:5000/auth/google/callback
```

### 2. Frontend Environment (/Frontend/.env)

```
VITE_API_URL=http://localhost:5000
```

---

## 🚀 Getting Started

To run this system, you need to open three separate terminals.

### 🟦 Terminal 1: Node.js Backend (Auth & Logic)

```
cd Backend
npm install
node src/server.js
```

### 🟨 Terminal 2: Python Backend (AI & RAG)

```
cd Backend

# Create and activate virtual environment
python -m venv venv
.\venv\Scripts\activate   # Windows
source venv/bin/activate    # Mac/Linux

# Install dependencies
pip install -r requirements.txt

# Start the AI Service
cd python-backend
uvicorn app:app --reload --port 8000
```

### 🟩 Terminal 3: React Frontend (UI)

```
cd Frontend
npm install
npm run dev
```

---

## 🏗 System Architecture

The project uses a Hybrid Backend Strategy:

Node.js (Express): Handles User Authentication, MongoDB CRUD, and WebSockets.
Python (FastAPI): Handles RAG (Retrieval-Augmented Generation), Gemini/Groq AI processing, and heavy document analysis.
React (Vite): Provides a modern, responsive interface using Tailwind CSS and Framer Motion.

---
