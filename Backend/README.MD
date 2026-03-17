pip install -r requirements.txt

Train : python train_classifier.py

Start API :uvicorn app:app --reload --host 0.0.0.0 --port 8000

Go to -> http://127.0.0.1:8000/docs

DB-backed storage:
- `/ingest` stores uploaded documents directly in MongoDB GridFS (no filesystem `storage/` write).
- `/documents` lists stored documents (optional query: `route_to`, `limit`).
- `/documents/{document_id}` returns metadata.
- `/documents/{document_id}/download` downloads file bytes from DB.

Required env vars:
- `MONGO_URI` (required)
- `MONGO_DB_NAME` (optional, default: `test`)
- `PYTHON_DOC_BUCKET_NAME` (optional, default: `pythonDocuments`)
