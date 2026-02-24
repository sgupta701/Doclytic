pip install -r requirements.txt

Train : python train_classifier.py

Start API :uvicorn app:app --reload --host 0.0.0.0 --port 8000

Go to -> http://127.0.0.1:8000/docs -> click ingest
