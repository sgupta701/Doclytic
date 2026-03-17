import os
import re
import csv
import threading
import logging
from datetime import datetime, timezone
from typing import Dict, List, Optional

import joblib
import numpy as np
import pandas as pd
from bson import ObjectId
from bson.errors import InvalidId
from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, StreamingResponse
from gridfs import GridFSBucket
from pydantic import BaseModel
from pymongo import DESCENDING, MongoClient
from pymongo.uri_parser import parse_uri
from dotenv import load_dotenv

from config.routing_rules import ROUTING_RULES
from priority_service.services.scoring import compute_priority
from summarizer import extract_text_from_file, generate_integrated_summary, generate_summary
from utils.email_sender import send_document_email_bytes

app = FastAPI(title="Document Intelligence API - Integrated IDMS")
logger = logging.getLogger("idms.routing")
if not logger.handlers:
    logging.basicConfig(level=logging.INFO)

load_dotenv(os.path.join(os.path.dirname(__file__), "..", ".env"))

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["*"],
)

BASE_DIR = os.path.dirname(__file__)
MODEL_PATH = os.path.join(BASE_DIR, "models", "doc_clf.joblib")
DATASET_PATH = os.path.join(BASE_DIR, "dataset_pipeline", "output", "dataset.csv")
FEEDBACK_DATASET_PATH = os.path.join(
    BASE_DIR, "dataset_pipeline", "output", "manual_review_feedback.csv"
)
NEGATIVE_FEEDBACK_DATASET_PATH = os.path.join(
    BASE_DIR, "dataset_pipeline", "output", "manual_review_negative_feedback.csv"
)
CONFIDENCE_THRESHOLD = 0.60
AUTO_ROUTE_DEPT_THRESHOLD = 0.40
RELEVANT_DEPT_THRESHOLD = 0.15
MANUAL_REVIEW_MIN_SCORE = 0.20
TOP_DEPARTMENT_CANDIDATES = 2
FEEDBACK_SIMILARITY_THRESHOLD = float(os.getenv("FEEDBACK_SIMILARITY_THRESHOLD", "0.82"))
NEGATIVE_FEEDBACK_SIMILARITY_THRESHOLD = float(
    os.getenv("NEGATIVE_FEEDBACK_SIMILARITY_THRESHOLD", "0.80")
)
SBERT_MODEL_NAME = os.getenv("SBERT_MODEL_NAME", "sentence-transformers/all-MiniLM-L6-v2")

MONGO_URI = os.getenv("MONGO_URI", "").strip()
MONGO_DB_NAME = os.getenv("MONGO_DB_NAME", "test").strip()
DOC_BUCKET_NAME = os.getenv(
    "PYTHON_DOC_BUCKET_NAME", "pythonDocuments").strip()
DOC_FILES_COLLECTION = f"{DOC_BUCKET_NAME}.files"

mongo_client: Optional[MongoClient] = None
mongo_db = None
doc_bucket: Optional[GridFSBucket] = None
feedback_lock = threading.Lock()
feedback_rows: List[Dict[str, str]] = []
feedback_embeddings: Optional[np.ndarray] = None
negative_feedback_rows: List[Dict[str, str]] = []
negative_feedback_embeddings: Optional[np.ndarray] = None


class RouteUpdateRequest(BaseModel):
    route_to: str
    label: Optional[str] = None
    note: Optional[str] = None
    decided_by: Optional[str] = None


class RetrainRequest(BaseModel):
    min_feedback: int = 50


class NegativeFeedbackRequest(BaseModel):
    text: str
    wrong_label: str
    source_doc_id: Optional[str] = None


class SummaryItem(BaseModel):
    title: str
    summary: str


class IntegratedSummaryRequest(BaseModel):
    documents: List[SummaryItem]


try:
    clf = joblib.load(MODEL_PATH)
    print(f"Classifier loaded from {MODEL_PATH}")
except Exception as e:
    print(
        f"Warning: classifier not loaded. Routing falls back to manual review. Error: {e}")
    clf = None


def _is_st_classifier_ready() -> bool:
    return clf is not None and hasattr(clf, "encode")


def _normalize_label(label: str) -> str:
    return (label or "").strip().lower().replace(" ", "_")


def _normalize_department_name(name: str) -> str:
    return (name or "").strip().lower()


def _filename_to_features(filename: str) -> str:
    raw = (filename or "").strip()
    if not raw:
        return ""

    base = os.path.basename(raw)
    stem, _ = os.path.splitext(base)
    normalized = re.sub(r"[_\-.]+", " ", stem.lower())
    normalized = re.sub(r"\s+", " ", normalized).strip()
    return normalized


def _build_classification_input(extracted_text: str, filename: str = "") -> str:
    body = (extracted_text or "").strip()
    fname_features = _filename_to_features(filename)
    if not fname_features:
        return body

    # Repeat filename cues to make short but high-signal names more influential.
    return (
        f"filename cues {fname_features} "
        f"filename cues {fname_features} "
        f"{body}"
    ).strip()


def _build_label_department_map(rules: Dict[str, List[str]]) -> Dict[str, List[str]]:
    label_map: Dict[str, List[str]] = {}
    for department, labels in rules.items():
        for raw_label in labels:
            normalized = _normalize_label(raw_label)
            if not normalized:
                continue
            label_map.setdefault(normalized, [])
            if department not in label_map[normalized]:
                label_map[normalized].append(department)
    return label_map


LABEL_TO_DEPARTMENTS = _build_label_department_map(ROUTING_RULES)
DEPARTMENT_NAME_LOOKUP = {
    _normalize_department_name(dept): dept for dept in ROUTING_RULES.keys()
}
GENERIC_LABEL_TO_DEPARTMENTS = {
    "report": ["Operations"],
    "invoice": ["Finance"],
    "contract": ["Legal"],
    "email": ["Admin"],
    "form": ["Admin"],
}

DEPARTMENT_KEYWORD_BOOSTS = {
    "Finance": {
        "keywords": [
            "salary", "payroll", "payslip", "salary listing", "wages", "compensation",
            "invoice", "tax", "gst", "budget", "reimbursement", "voucher", "balance sheet",
        ],
        "boost": 0.28,
    },
    "HR": {
        "keywords": [
            "employee", "resume", "offer letter", "joining", "relieving", "appraisal",
            "salary", "payroll", "attendance", "hr policy", "code of conduct",
        ],
        "boost": 0.24,
    },
    "Legal": {
        "keywords": [
            "agreement", "contract", "nda", "legal notice", "compliance", "litigation",
            "terms and conditions", "privacy policy",
        ],
        "boost": 0.24,
    },
    "Procurement": {
        "keywords": [
            "purchase order", "po", "quotation", "rfq", "rfi", "tender", "vendor",
            "supplier", "goods receipt", "delivery challan",
        ],
        "boost": 0.22,
    },
    "Operations": {
        "keywords": [
            "operations report", "incident report", "inventory", "shipment", "maintenance",
            "work order", "logistics", "production",
        ],
        "boost": 0.22,
    },
}


def _ensure_feedback_csv():
    os.makedirs(os.path.dirname(FEEDBACK_DATASET_PATH), exist_ok=True)
    if os.path.exists(FEEDBACK_DATASET_PATH) and os.path.getsize(FEEDBACK_DATASET_PATH) > 0:
        return
    with open(FEEDBACK_DATASET_PATH, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(
            f,
            fieldnames=["text", "label", "department", "source_doc_id", "created_at"],
        )
        writer.writeheader()


def _ensure_negative_feedback_csv():
    os.makedirs(os.path.dirname(NEGATIVE_FEEDBACK_DATASET_PATH), exist_ok=True)
    if os.path.exists(NEGATIVE_FEEDBACK_DATASET_PATH) and os.path.getsize(
        NEGATIVE_FEEDBACK_DATASET_PATH
    ) > 0:
        return
    with open(NEGATIVE_FEEDBACK_DATASET_PATH, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(
            f,
            fieldnames=["text", "wrong_label", "source_doc_id", "created_at"],
        )
        writer.writeheader()


def _load_feedback_memory():
    global feedback_rows, feedback_embeddings
    _ensure_feedback_csv()
    rows: List[Dict[str, str]] = []

    with open(FEEDBACK_DATASET_PATH, "r", newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            text = (row.get("text") or "").strip()
            label = _normalize_label(row.get("label") or "")
            department = (row.get("department") or "").strip()
            if not text or not label or not department:
                continue
            rows.append(
                {
                    "text": text,
                    "label": label,
                    "department": department,
                    "source_doc_id": (row.get("source_doc_id") or "").strip(),
                    "created_at": (row.get("created_at") or "").strip(),
                }
            )

    embeddings = None
    if rows and _is_st_classifier_ready():
        texts = [r["text"] for r in rows]
        embeddings = clf.encode(texts, batch_size=64)
        if embeddings.size > 0:
            norms = np.linalg.norm(embeddings, axis=1, keepdims=True)
            norms[norms == 0] = 1.0
            embeddings = embeddings / norms

    with feedback_lock:
        feedback_rows = rows
        feedback_embeddings = embeddings


def _load_negative_feedback_memory():
    global negative_feedback_rows, negative_feedback_embeddings
    _ensure_negative_feedback_csv()
    rows: List[Dict[str, str]] = []

    with open(NEGATIVE_FEEDBACK_DATASET_PATH, "r", newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            text = (row.get("text") or "").strip()
            wrong_label = _normalize_label(row.get("wrong_label") or "")
            if not text or not wrong_label:
                continue
            rows.append(
                {
                    "text": text,
                    "wrong_label": wrong_label,
                    "source_doc_id": (row.get("source_doc_id") or "").strip(),
                    "created_at": (row.get("created_at") or "").strip(),
                }
            )

    embeddings = None
    if rows and _is_st_classifier_ready():
        texts = [r["text"] for r in rows]
        embeddings = clf.encode(texts, batch_size=64)
        if embeddings.size > 0:
            norms = np.linalg.norm(embeddings, axis=1, keepdims=True)
            norms[norms == 0] = 1.0
            embeddings = embeddings / norms

    with feedback_lock:
        negative_feedback_rows = rows
        negative_feedback_embeddings = embeddings


def _append_feedback_sample(
    text: str, label: str, department: str, source_doc_id: str
) -> bool:
    global feedback_embeddings
    cleaned_text = (text or "").strip()
    normalized_label = _normalize_label(label)
    if not cleaned_text or len(cleaned_text) < 20 or not normalized_label:
        return False

    _ensure_feedback_csv()
    with open(FEEDBACK_DATASET_PATH, "a", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(
            f,
            fieldnames=["text", "label", "department", "source_doc_id", "created_at"],
        )
        writer.writerow(
            {
                "text": cleaned_text,
                "label": normalized_label,
                "department": department,
                "source_doc_id": source_doc_id,
                "created_at": datetime.now(timezone.utc).isoformat(),
            }
        )

    if _is_st_classifier_ready():
        emb = clf.encode([cleaned_text], batch_size=1)
        if emb.size > 0:
            norm = np.linalg.norm(emb, axis=1, keepdims=True)
            norm[norm == 0] = 1.0
            emb = emb / norm
            with feedback_lock:
                feedback_rows.append(
                    {
                        "text": cleaned_text,
                        "label": normalized_label,
                        "department": department,
                        "source_doc_id": source_doc_id,
                        "created_at": datetime.now(timezone.utc).isoformat(),
                    }
                )
                if feedback_embeddings is None:
                    feedback_embeddings = emb
                else:
                    feedback_embeddings = np.vstack([feedback_embeddings, emb])
            return True

    _load_feedback_memory()
    return True


def _append_negative_feedback_sample(text: str, wrong_label: str, source_doc_id: str = "") -> bool:
    global negative_feedback_embeddings
    cleaned_text = (text or "").strip()
    normalized_label = _normalize_label(wrong_label)
    if not cleaned_text or len(cleaned_text) < 20 or not normalized_label:
        return False

    _ensure_negative_feedback_csv()
    with open(NEGATIVE_FEEDBACK_DATASET_PATH, "a", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(
            f,
            fieldnames=["text", "wrong_label", "source_doc_id", "created_at"],
        )
        writer.writerow(
            {
                "text": cleaned_text,
                "wrong_label": normalized_label,
                "source_doc_id": source_doc_id,
                "created_at": datetime.now(timezone.utc).isoformat(),
            }
        )

    if _is_st_classifier_ready():
        emb = clf.encode([cleaned_text], batch_size=1)
        if emb.size > 0:
            norm = np.linalg.norm(emb, axis=1, keepdims=True)
            norm[norm == 0] = 1.0
            emb = emb / norm
            with feedback_lock:
                negative_feedback_rows.append(
                    {
                        "text": cleaned_text,
                        "wrong_label": normalized_label,
                        "source_doc_id": source_doc_id,
                        "created_at": datetime.now(timezone.utc).isoformat(),
                    }
                )
                if negative_feedback_embeddings is None:
                    negative_feedback_embeddings = emb
                else:
                    negative_feedback_embeddings = np.vstack(
                        [negative_feedback_embeddings, emb]
                    )
            return True

    _load_negative_feedback_memory()
    return True


def _predict_from_feedback_memory(classification_input: str):
    if not _is_st_classifier_ready():
        return None
    text = (classification_input or "").strip()
    if len(text) < 20:
        return None

    with feedback_lock:
        if not feedback_rows or feedback_embeddings is None or len(feedback_rows) == 0:
            return None
        local_rows = feedback_rows
        local_embeddings = feedback_embeddings

    query = clf.encode([text], batch_size=1)
    if query.size == 0:
        return None
    q_norm = np.linalg.norm(query, axis=1, keepdims=True)
    q_norm[q_norm == 0] = 1.0
    query = query / q_norm

    sims = np.dot(local_embeddings, query[0])
    best_idx = int(np.argmax(sims))
    best_sim = float(sims[best_idx])
    if best_sim < FEEDBACK_SIMILARITY_THRESHOLD:
        return None

    return local_rows[best_idx]["label"], best_sim


def _apply_negative_feedback_penalty(
    classification_input: str, label_probs: Dict[str, float]
) -> Dict[str, float]:
    if not _is_st_classifier_ready():
        return label_probs
    if not label_probs:
        return label_probs

    with feedback_lock:
        if (
            not negative_feedback_rows
            or negative_feedback_embeddings is None
            or len(negative_feedback_rows) == 0
        ):
            return label_probs
        local_rows = negative_feedback_rows
        local_embeddings = negative_feedback_embeddings

    query = clf.encode([classification_input], batch_size=1)
    if query.size == 0:
        return label_probs
    q_norm = np.linalg.norm(query, axis=1, keepdims=True)
    q_norm[q_norm == 0] = 1.0
    query = query / q_norm

    sims = np.dot(local_embeddings, query[0])
    max_sim_by_label: Dict[str, float] = {}
    for idx, sim in enumerate(sims):
        similarity = float(sim)
        if similarity < NEGATIVE_FEEDBACK_SIMILARITY_THRESHOLD:
            continue
        wrong_label = local_rows[idx]["wrong_label"]
        max_sim_by_label[wrong_label] = max(
            max_sim_by_label.get(wrong_label, 0.0), similarity
        )

    if not max_sim_by_label:
        return label_probs

    adjusted = dict(label_probs)
    for label, sim in max_sim_by_label.items():
        if label not in adjusted:
            continue
        # Strong similarity -> stronger reduction for that previously-wrong label.
        penalty_factor = max(0.10, 1.0 - (0.80 * sim))
        adjusted[label] = max(0.0, float(adjusted[label]) * penalty_factor)

    return adjusted


def _get_label_probabilities(classification_input: str) -> Dict[str, float]:
    if not clf:
        return {}

    if hasattr(clf, "predict_proba"):
        probs = clf.predict_proba([classification_input])[0]
        labels = [str(c).strip().lower() for c in getattr(clf, "classes_", [])]
        if labels and len(labels) == len(probs):
            return {labels[i]: float(probs[i]) for i in range(len(labels))}

    if hasattr(clf, "predict"):
        pred = str(clf.predict([classification_input])[0]).strip().lower()
        return {pred: 1.0}

    return {}


def _keyword_department_score_boost(classification_input: str) -> Dict[str, float]:
    text = (classification_input or "").lower()
    boosts: Dict[str, float] = {}
    if not text:
        return boosts

    for department, config in DEPARTMENT_KEYWORD_BOOSTS.items():
        keywords = config.get("keywords", [])
        base_boost = float(config.get("boost", 0.0))
        if any(keyword in text for keyword in keywords):
            boosts[department] = base_boost
    return boosts


def _compute_department_scores(label_probs: Dict[str, float], classification_input: str = "") -> Dict[str, float]:
    department_scores: Dict[str, float] = {}
    for label, prob in label_probs.items():
        departments = LABEL_TO_DEPARTMENTS.get(label) or GENERIC_LABEL_TO_DEPARTMENTS.get(
            label
        )
        if not departments:
            continue

        for department in departments:
            # Full-probability contribution per relevant department so shared
            # labels can trigger true multi-department routing.
            department_scores[department] = min(
                1.0, department_scores.get(department, 0.0) + float(prob)
            )

    # Add lightweight heuristic boosts from filename/text keywords for
    # cross-functional documents (e.g., salary/payroll touching HR + Finance).
    keyword_boosts = _keyword_department_score_boost(classification_input)
    for department, boost in keyword_boosts.items():
        department_scores[department] = min(
            1.0, department_scores.get(department, 0.0) + float(boost)
        )

    return department_scores


def _to_sorted_department_predictions(department_scores: Dict[str, float]) -> List[Dict[str, float]]:
    return [
        {"department": department, "score": float(score)}
        for department, score in sorted(
            department_scores.items(), key=lambda item: item[1], reverse=True
        )
    ]


def _resolve_department_routing(department_scores: Dict[str, float]) -> Dict[str, object]:
    predictions_all = _to_sorted_department_predictions(department_scores)
    predictions = predictions_all[:TOP_DEPARTMENT_CANDIDATES]
    relevant = [p for p in predictions if p["score"] >= RELEVANT_DEPT_THRESHOLD]
    auto = [p for p in relevant if p["score"] >= AUTO_ROUTE_DEPT_THRESHOLD]
    manual = [
        p
        for p in relevant
        if MANUAL_REVIEW_MIN_SCORE <= p["score"] < AUTO_ROUTE_DEPT_THRESHOLD
    ]

    if not relevant and predictions:
        relevant = predictions

    if auto:
        primary = auto[0]["department"]
        note = "ok"
    elif predictions:
        # When all department scores are very low (<20%), do not send to manual review.
        # Route to the top predicted department directly.
        primary = predictions[0]["department"]
        note = (
            "manual_review_required"
            if manual
            else "low_confidence_below_manual_threshold_routed_top_prediction"
        )
    else:
        primary = "manual_review"
        note = "manual_review_required"
    return {
        "primary_route": primary,
        "note": note,
        "department_predictions": predictions,
        "relevant_departments": relevant,
        "auto_route_departments": auto,
        "manual_review_departments": manual,
    }


def _routing_debug_payload(prediction: Dict[str, object]) -> Dict[str, object]:
    return {
        "thresholds": {
            "auto_route_department_threshold": AUTO_ROUTE_DEPT_THRESHOLD,
            "relevant_department_threshold": RELEVANT_DEPT_THRESHOLD,
            "single_label_confidence_threshold": CONFIDENCE_THRESHOLD,
        },
        "label": prediction.get("label"),
        "label_confidence": prediction.get("label_confidence"),
        "department_predictions": prediction.get("department_predictions", []),
        "auto_route_departments": prediction.get("auto_route_departments", []),
        "manual_review_departments": prediction.get("manual_review_departments", []),
        "primary_route": prediction.get("primary_route"),
        "note": prediction.get("note"),
    }


@app.on_event("startup")
def _startup_init_learning():
    try:
        _load_feedback_memory()
        _load_negative_feedback_memory()
    except Exception as exc:
        print(f"Warning: failed to load feedback memory: {exc}")


def classify_text(extracted_text: str, filename: str = ""):
    """Predict the document class with probability if supported."""
    if not clf or (not extracted_text and not filename):
        return "Unknown", 0.0

    try:
        clean_text = _build_classification_input(extracted_text, filename)
        if not clean_text:
            return "Unknown", 0.0

        feedback_pred = _predict_from_feedback_memory(clean_text)
        label_probs = _get_label_probabilities(clean_text)
        label_probs = _apply_negative_feedback_penalty(clean_text, label_probs)

        if feedback_pred:
            fb_label, fb_score = feedback_pred
            label_probs[fb_label] = max(float(label_probs.get(fb_label, 0.0)), float(fb_score))
            return fb_label, float(fb_score)

        if label_probs:
            best = max(label_probs.items(), key=lambda item: item[1])
            return best[0], float(best[1])

        pred = clf.predict([clean_text])[0]
        return str(pred).strip().lower(), 1.0
    except Exception:
        return "Error", 0.0


def _extract_sender_category(text: str) -> str:
    lowered = (text or "").lower()
    sender_rules = [
        ("court", ["hon'ble court", "district court",
         "high court", "supreme court", "tribunal"]),
        ("regulator", ["sebi", "rbi", "compliance authority",
         "regulatory authority", "regulator"]),
        ("government", ["government of", "ministry", "department of", "govt"]),
        ("police", ["police station", "fir",
         "crime branch", "investigation unit"]),
        ("internal", ["internal memo",
         "intra-office", "internal communication"]),
        ("vendor", ["vendor", "supplier"]),
        ("customer", ["customer", "client"]),
        ("seniors", ["senior", "manager", "administration"]),
        ("employees", ["Analyst", "Associate"])
    ]
    for category, markers in sender_rules:
        if any(marker in lowered for marker in markers):
            return category
    return "unknown"


def _extract_selected_deadline(text: str) -> str | None:
    lowered = (text or "").lower()
    patterns = [
        r"(?:due by|deadline[:\s]*|respond by|submit by)\s*(\d{4}-\d{2}-\d{2})",
        r"(?:due by|deadline[:\s]*|respond by|submit by)\s*(\d{2}/\d{2}/\d{4})",
        r"(?:on or before)\s*(\d{4}-\d{2}-\d{2})",
        r"(?:on or before)\s*(\d{2}/\d{2}/\d{4})",
    ]
    for pattern in patterns:
        match = re.search(pattern, lowered)
        if match:
            value = match.group(1)
            if "/" in value:
                dd, mm, yyyy = value.split("/")
                return f"{yyyy}-{mm}-{dd}"
            return value
    return None


def _extract_urgency_indicators(text: str) -> List[str]:
    lowered = (text or "").lower()
    markers = [
        "urgent",
        "immediate",
        "asap",
        "within 24 hours",
        "today",
        "overdue",
        "final reminder",
        "show cause",
        "legal notice",
    ]
    return [m for m in markers if m in lowered]


def extract_priority_metadata(extracted_text: str, predicted_label: str) -> dict:
    return {
        "sender": {
            "name": None,
            "category": _extract_sender_category(extracted_text),
        },
        "document_type": (predicted_label or "").strip().lower().replace(" ", "_"),
        "selected_deadline": _extract_selected_deadline(extracted_text),
        "urgency_indicators": _extract_urgency_indicators(extracted_text),
        "extraction_model_version": "rule-v1",
        "extraction_confidence": 0.6,
    }


def predict_document(extracted_text: str, filename: str = "") -> Dict[str, object]:
    classification_input = _build_classification_input(extracted_text, filename)
    if not classification_input:
        return {
            "label": "Unknown",
            "label_confidence": 0.0,
            "label_probabilities": {},
            "department_scores": {},
            **_resolve_department_routing({}),
        }

    predicted_label, label_confidence = classify_text(extracted_text, filename)
    label_probs = _get_label_probabilities(classification_input)
    label_probs = _apply_negative_feedback_penalty(classification_input, label_probs)
    if predicted_label and predicted_label not in ("Unknown", "Error"):
        label_probs[predicted_label] = max(
            float(label_probs.get(predicted_label, 0.0)), float(label_confidence)
        )

    department_scores = _compute_department_scores(label_probs, classification_input)
    routing = _resolve_department_routing(department_scores)

    return {
        "label": predicted_label,
        "label_confidence": float(label_confidence),
        "label_probabilities": label_probs,
        "department_scores": department_scores,
        **routing,
    }


def _ensure_db():
    """Initialize MongoDB and GridFS lazily."""
    global mongo_client, mongo_db, doc_bucket

    if doc_bucket is not None:
        return

    if not MONGO_URI:
        raise RuntimeError("MONGO_URI is not set.")

    mongo_client = MongoClient(MONGO_URI)
    parsed = parse_uri(MONGO_URI)
    db_name = parsed.get("database") or MONGO_DB_NAME
    mongo_db = mongo_client[db_name]
    doc_bucket = GridFSBucket(mongo_db, bucket_name=DOC_BUCKET_NAME)
    mongo_db[DOC_FILES_COLLECTION].create_index(
        [("metadata.route_to", 1), ("uploadDate", DESCENDING)])


def _get_department_emails_from_db(department_name: str) -> List[str]:
    """Resolve recipient emails for a routed department from MongoDB."""
    _ensure_db()

    department = mongo_db["departments"].find_one(
        {"name": {"$regex": f"^{department_name.strip()}$", "$options": "i"}},
        {"_id": 1},
    )
    if not department:
        return []

    cursor = mongo_db["users"].find(
        {
            "department_id": department["_id"],
            "email": {"$exists": True, "$type": "string", "$ne": ""},
        },
        {"email": 1, "_id": 0},
    )

    emails = []
    seen = set()
    for row in cursor:
        email = (row.get("email") or "").strip()
        if not email:
            continue
        lower = email.lower()
        if lower in seen:
            continue
        seen.add(lower)
        emails.append(email)
    return emails


def route_and_send_email(
    predicted_label: str,
    filename: str,
    content_type: str,
    file_bytes: bytes,
    routing_decision: Dict[str, object],
    summary: str,
) -> dict:
    auto_departments = [
        item["department"] for item in routing_decision.get("auto_route_departments", [])
    ]
    manual_departments = [
        item["department"] for item in routing_decision.get("manual_review_departments", [])
    ]

    if not auto_departments:
        primary_route = str(routing_decision.get("primary_route") or "manual_review")
        no_manual_candidates = len(manual_departments) == 0
        if primary_route != "manual_review" and no_manual_candidates:
            # Below-manual-threshold case: skip manual review and keep top prediction route.
            return {
                "route_to": primary_route,
                "routed_departments": [primary_route],
                "manual_review_departments": [],
                "emails": [],
                "note": "below_manual_threshold_no_manual_review",
            }
        return {
            "route_to": "manual_review",
            "routed_departments": [],
            "manual_review_departments": manual_departments,
            "emails": [],
            "note": "manual_review_required",
        }

    subject = f"New Document Routed: {predicted_label}"
    sent_departments: List[str] = []
    sent_emails: List[str] = []

    for department in auto_departments:
        emails = _get_department_emails_from_db(department)
        if not emails:
            manual_departments.append(department)
            continue

        body = (
            f"A new {predicted_label} document has been routed to your department.\n\n"
            f"--- SUMMARY ---\n{summary}\n"
        )
        try:
            send_document_email_bytes(
                recipients=emails,
                subject=subject,
                body=body,
                filename=filename,
                file_bytes=file_bytes,
                content_type=content_type,
            )
            sent_departments.append(department)
            sent_emails.extend(emails)
        except Exception:
            manual_departments.append(department)

    return {
        "route_to": sent_departments[0] if sent_departments else "manual_review",
        "routed_departments": sent_departments,
        "manual_review_departments": sorted(set(manual_departments)),
        "emails": sorted(set(sent_emails)),
        "note": "email_sent_successfully" if sent_departments else "email_failed_or_no_recipients",
    }


def route_and_store(
    predicted_label: str,
    filename: str,
    content_type: str,
    file_bytes: bytes,
    routing_decision: Dict[str, object],
    probability: float,
    summary: str,
) -> dict:
    """Store file + summary + classification metadata in MongoDB GridFS."""
    auto_departments = routing_decision.get("auto_route_departments", [])
    manual_departments = routing_decision.get("manual_review_departments", [])
    department_predictions = routing_decision.get("department_predictions", [])
    route_to = routing_decision.get("primary_route", "manual_review")
    note = routing_decision.get("note", "manual_review_required")

    auto_department_names = [item["department"] for item in auto_departments]
    manual_department_names = [item["department"] for item in manual_departments]
    if not auto_department_names and route_to and route_to != "manual_review":
        auto_department_names = [route_to]
    suggested_department = (
        manual_department_names[0]
        if manual_department_names
        else (auto_department_names[0] if auto_department_names else None)
    )

    _ensure_db()
    metadata = {
        "route_to": route_to,
        "note": note,
        "routed_departments": auto_department_names,
        "routing_history": [
            {
                "department": dep,
                "reason": "auto_routed",
                "timestamp": datetime.now(timezone.utc),
            }
            for dep in auto_department_names
        ],
        "department_predictions": department_predictions,
        "classification": {
            "label": predicted_label,
            "confidence": float(probability),
        },
        "manual_review": {
            "required": bool(manual_department_names),
            "status": "pending" if manual_department_names else "resolved",
            "suggested_department": suggested_department,
            "suggested_departments": manual_department_names,
            "confidence_by_department": {
                item["department"]: float(item["score"]) for item in department_predictions
            },
            "previously_higher_scored_departments": [],
        },
        "summary": summary,
        "content_type": content_type or "application/octet-stream",
        "original_filename": filename,
        "source": "python-ingest",
        "stored_at": datetime.now(timezone.utc),
    }

    file_id = doc_bucket.upload_from_stream(
        filename, file_bytes, metadata=metadata)
    return {
        "route_to": route_to,
        "routed_departments": auto_department_names,
        "manual_review_departments": manual_department_names,
        "department_predictions": department_predictions,
        "stored_id": str(file_id),
        "note": note,
    }


@app.get("/")
def home():
    return {
        "status": "online",
        "engine": "DistilBART-CNN (Summarizer) + Joblib (Classifier)",
        "features": ["single-doc-summary", "batch-integration", "auto-routing", "email-dispatch", "db-storage"],
    }


@app.get("/routing-rules")
def get_routing_rules():
    return {
        "departments": {
            dept: sorted([_normalize_label(label) for label in labels])
            for dept, labels in ROUTING_RULES.items()
        }
    }


@app.get("/learning/feedback-stats")
def feedback_stats():
    _ensure_feedback_csv()
    total = 0
    by_label: Dict[str, int] = {}
    if os.path.exists(FEEDBACK_DATASET_PATH):
        with open(FEEDBACK_DATASET_PATH, "r", newline="", encoding="utf-8") as f:
            reader = csv.DictReader(f)
            for row in reader:
                label = _normalize_label(row.get("label") or "")
                if not label:
                    continue
                total += 1
                by_label[label] = by_label.get(label, 0) + 1
    return {"feedback_samples": total, "by_label": by_label}


@app.post("/learning/feedback-negative")
def feedback_negative(payload: NegativeFeedbackRequest):
    ok = _append_negative_feedback_sample(
        text=payload.text,
        wrong_label=payload.wrong_label,
        source_doc_id=(payload.source_doc_id or "").strip(),
    )
    if not ok:
        return JSONResponse(
            {
                "status": "error",
                "message": "Invalid negative feedback payload (text too short or label missing)",
            },
            status_code=400,
        )
    return {"status": "ok", "message": "Negative feedback recorded"}


@app.post("/learning/retrain")
def retrain_from_feedback(payload: RetrainRequest):
    global clf
    _ensure_feedback_csv()

    if not os.path.exists(DATASET_PATH):
        return JSONResponse({"message": "Base dataset not found"}, status_code=404)
    if not os.path.exists(FEEDBACK_DATASET_PATH):
        return JSONResponse({"message": "Feedback dataset not found"}, status_code=404)

    base_df = pd.read_csv(DATASET_PATH)
    fb_df = pd.read_csv(FEEDBACK_DATASET_PATH)
    if len(fb_df) < max(1, payload.min_feedback):
        return JSONResponse(
            {
                "message": "Not enough feedback samples for retraining",
                "feedback_count": int(len(fb_df)),
                "required_min_feedback": int(payload.min_feedback),
            },
            status_code=400,
        )

    if "text" not in base_df.columns or "label" not in base_df.columns:
        return JSONResponse({"message": "Base dataset must contain text,label"}, status_code=400)
    if "text" not in fb_df.columns or "label" not in fb_df.columns:
        return JSONResponse({"message": "Feedback dataset must contain text,label"}, status_code=400)

    train_df = pd.concat(
        [base_df[["text", "label"]], fb_df[["text", "label"]]],
        ignore_index=True,
    )
    train_df["text"] = train_df["text"].fillna("").astype(str)
    train_df["label"] = train_df["label"].fillna("").astype(str).map(_normalize_label)
    train_df = train_df[(train_df["text"].str.len() > 0) & (train_df["label"].str.len() > 0)]

    if train_df.empty:
        return JSONResponse({"message": "No training rows after cleaning"}, status_code=400)

    try:
        from st_classifier import SentenceTransformerClassifier

        new_clf = SentenceTransformerClassifier(model_name=SBERT_MODEL_NAME)
        new_clf.fit(train_df["text"].tolist(), train_df["label"].tolist())
        joblib.dump(new_clf, MODEL_PATH)
        clf = new_clf
        _load_feedback_memory()
        return {
            "status": "ok",
            "message": "Model retrained with manual-review feedback",
            "base_rows": int(len(base_df)),
            "feedback_rows": int(len(fb_df)),
            "train_rows": int(len(train_df)),
            "model_path": MODEL_PATH,
        }
    except Exception as e:
        return JSONResponse({"status": "error", "message": str(e)}, status_code=500)


@app.post("/summarize")
async def summarize_single(file: UploadFile = File(...)):
    try:
        raw_bytes = await file.read()
        text = extract_text_from_file(raw_bytes, file.filename)
        if not text or text.strip() == "":
            return {"summary": "Error: Document is empty or unreadable."}
        return {"summary": generate_summary(text)}
    except Exception as e:
        return {"summary": f"Python Error: {str(e)}"}


@app.post("/summarize-batch")
async def summarize_batch(files: List[UploadFile] = File(...)):
    if not files:
        raise HTTPException(status_code=400, detail="No files provided")

    processed_results = []
    for file in files:
        try:
            raw_bytes = await file.read()
            text = extract_text_from_file(raw_bytes, file.filename)
            if text and not text.startswith("Error"):
                processed_results.append(
                    {"title": file.filename, "summary": generate_summary(text)})
        except Exception:
            continue

    if not processed_results:
        return {"error": "Could not process any of the provided documents."}

    try:
        return {
            "summary": generate_integrated_summary(processed_results),
            "individual_summaries": processed_results,
        }
    except Exception as e:
        raise HTTPException(
            status_code=500, detail=f"Integration error: {str(e)}")


@app.post("/summarize-integrated")
def summarize_integrated(payload: IntegratedSummaryRequest):
    """Create one combined summary from pre-summarized documents."""
    items = [
        {"title": (d.title or "").strip(),
         "summary": (d.summary or "").strip()}
        for d in payload.documents
        if (d.title or "").strip() and (d.summary or "").strip()
    ]
    return {"summary": generate_integrated_summary(items)}


@app.post("/classify-summarize")
async def classify_and_summarize(file: UploadFile = File(...)):
    """Classification + summary endpoint with no email and no DB write side effects."""
    try:
        raw_bytes = await file.read()
        text = extract_text_from_file(raw_bytes, file.filename)

        if not text or text.strip() == "":
            return JSONResponse({"error": "Could not extract text.", "file": file.filename}, status_code=422)

        prediction = predict_document(text, file.filename)
        predicted_label = str(prediction.get("label") or "Unknown")
        probability = float(prediction.get("label_confidence") or 0.0)
        routing_debug = _routing_debug_payload(prediction)
        logger.info(
            "classify_summarize filename=%s label=%s primary_route=%s auto=%s manual=%s",
            file.filename,
            predicted_label,
            routing_debug.get("primary_route"),
            routing_debug.get("auto_route_departments"),
            routing_debug.get("manual_review_departments"),
        )
        summary = generate_summary(text)
        route_to = str(prediction.get("primary_route") or "manual_review")
        note = str(prediction.get("note") or "manual_review_required")
        extracted_metadata = extract_priority_metadata(text, predicted_label)
        priority_result = compute_priority(extracted_metadata)

        return {
            "status": "processed",
            "filename": file.filename,
            "classification": {
                "label": predicted_label,
                "confidence": probability,
                "department_predictions": prediction.get("department_predictions", []),
            },
            "summary": summary,
            "extraction": extracted_metadata,
            "priority": {
                **priority_result,
                "engine_version": "rule-v1",
            },
            "actions": {
                "email": {
                    "route_to": route_to,
                    "routed_departments": [
                        item["department"] for item in prediction.get("auto_route_departments", [])
                    ],
                    "manual_review_departments": [
                        item["department"] for item in prediction.get("manual_review_departments", [])
                    ],
                    "emails": [],
                    "note": "skipped_for_gmail_fetch",
                },
                "storage": {
                    "route_to": route_to,
                    "note": note,
                },
            },
            "routing_debug": routing_debug,
        }
    except Exception as e:
        return JSONResponse({"status": "error", "message": str(e)}, status_code=500)


@app.post("/ingest")
async def ingest_and_route(file: UploadFile = File(...)):
    """
    Full pipeline:
    1. Extract text
    2. Classify
    3. Summarize
    4. Route email
    5. Store in DB (GridFS)
    """
    try:
        raw_bytes = await file.read()
        text = extract_text_from_file(raw_bytes, file.filename)

        if not text or text.strip() == "":
            return JSONResponse({"error": "Could not extract text.", "file": file.filename}, status_code=422)

        prediction = predict_document(text, file.filename)
        predicted_label = str(prediction.get("label") or "Unknown")
        probability = float(prediction.get("label_confidence") or 0.0)
        routing_debug = _routing_debug_payload(prediction)
        logger.info(
            "ingest filename=%s label=%s primary_route=%s auto=%s manual=%s",
            file.filename,
            predicted_label,
            routing_debug.get("primary_route"),
            routing_debug.get("auto_route_departments"),
            routing_debug.get("manual_review_departments"),
        )
        summary = generate_summary(text)
        extracted_metadata = extract_priority_metadata(text, predicted_label)
        priority_result = compute_priority(extracted_metadata)

        content_type = file.content_type or "application/octet-stream"
        email_info = route_and_send_email(
            predicted_label=predicted_label,
            filename=file.filename,
            content_type=content_type,
            file_bytes=raw_bytes,
            routing_decision=prediction,
            summary=summary,
        )
        storage_info = route_and_store(
            predicted_label=predicted_label,
            filename=file.filename,
            content_type=content_type,
            file_bytes=raw_bytes,
            routing_decision=prediction,
            probability=probability,
            summary=summary,
        )

        return {
            "status": "processed",
            "filename": file.filename,
            "classification": {
                "label": predicted_label,
                "confidence": probability,
                "department_predictions": prediction.get("department_predictions", []),
            },
            "summary": summary,
            "extraction": extracted_metadata,
            "priority": {
                **priority_result,
                "engine_version": "rule-v1",
            },
            "actions": {
                "email": email_info,
                "storage": storage_info,
            },
            "routing_debug": routing_debug,
        }
    except Exception as e:
        return JSONResponse({"status": "error", "message": str(e)}, status_code=500)


@app.post("/debug/routing-preview")
async def routing_preview(file: UploadFile = File(...)):
    """Debug-only preview of label and multi-department routing for an uploaded file."""
    try:
        raw_bytes = await file.read()
        text = extract_text_from_file(raw_bytes, file.filename)
        prediction = predict_document(text or "", file.filename)
        return {
            "filename": file.filename,
            "text_extracted": bool(text and text.strip()),
            "prediction": prediction,
            "routing_debug": _routing_debug_payload(prediction),
        }
    except Exception as e:
        return JSONResponse({"status": "error", "message": str(e)}, status_code=500)


@app.get("/documents")
def list_documents(route_to: Optional[str] = None, limit: int = 50):
    """List DB-stored files, optionally filtered by routed department."""
    try:
        _ensure_db()
        safe_limit = max(1, min(limit, 200))
        query = {}
        if route_to:
            query["metadata.route_to"] = {
                "$regex": f"^{route_to.strip()}$", "$options": "i"}

        docs = list(mongo_db[DOC_FILES_COLLECTION].find(
            query).sort("uploadDate", DESCENDING).limit(safe_limit))
        return {
            "count": len(docs),
            "items": [
                {
                    "id": str(d["_id"]),
                    "filename": d.get("filename"),
                    "length": d.get("length"),
                    "uploadDate": d.get("uploadDate"),
                    "route_to": d.get("metadata", {}).get("route_to"),
                    "routed_departments": d.get("metadata", {}).get("routed_departments", []),
                    "department_predictions": d.get("metadata", {}).get("department_predictions", []),
                    "manual_review": d.get("metadata", {}).get("manual_review", {}),
                    "classification": d.get("metadata", {}).get("classification"),
                    "summary": d.get("metadata", {}).get("summary"),
                    "content_type": d.get("metadata", {}).get("content_type"),
                }
                for d in docs
            ],
        }
    except Exception as e:
        return JSONResponse({"status": "error", "message": str(e)}, status_code=500)


@app.get("/documents/{document_id}")
def get_document_metadata(document_id: str):
    try:
        _ensure_db()
        oid = ObjectId(document_id)
        d = mongo_db[DOC_FILES_COLLECTION].find_one({"_id": oid})
        if not d:
            return JSONResponse({"message": "Document not found"}, status_code=404)
        return {
            "id": str(d["_id"]),
            "filename": d.get("filename"),
            "length": d.get("length"),
            "uploadDate": d.get("uploadDate"),
            "metadata": d.get("metadata", {}),
        }
    except InvalidId:
        return JSONResponse({"message": "Invalid document id"}, status_code=400)
    except Exception as e:
        return JSONResponse({"status": "error", "message": str(e)}, status_code=500)


@app.patch("/documents/{document_id}/route")
def update_document_route(document_id: str, payload: RouteUpdateRequest):
    """Update routed department metadata for an existing GridFS file."""
    try:
        _ensure_db()
        oid = ObjectId(document_id)
        route_to = (payload.route_to or "").strip()
        if not route_to:
            return JSONResponse({"message": "route_to is required"}, status_code=400)

        route_to_key = _normalize_department_name(route_to)
        canonical_department = DEPARTMENT_NAME_LOOKUP.get(route_to_key)
        if not canonical_department:
            return JSONResponse({"message": "Invalid route_to department"}, status_code=400)

        existing = mongo_db[DOC_FILES_COLLECTION].find_one({"_id": oid})
        if not existing:
            return JSONResponse({"message": "Document not found"}, status_code=404)

        selected_label = None
        if payload.label is not None and payload.label.strip():
            normalized_label = _normalize_label(payload.label)
            allowed_labels = {
                _normalize_label(l) for l in ROUTING_RULES.get(canonical_department, [])
            }
            if normalized_label not in allowed_labels:
                return JSONResponse(
                    {
                        "message": "Selected label is not valid for the chosen department",
                        "allowed_labels": sorted(allowed_labels),
                    },
                    status_code=400,
                )
            selected_label = normalized_label

        existing_metadata = existing.get("metadata", {}) or {}
        department_predictions = existing_metadata.get("department_predictions", []) or []
        score_by_department: Dict[str, float] = {}
        for item in department_predictions:
            if not isinstance(item, dict):
                continue
            dep_name = (item.get("department") or "").strip()
            score = float(item.get("score") or 0.0)
            if dep_name:
                score_by_department[dep_name] = score

        selected_score = float(score_by_department.get(canonical_department, 0.0))
        previously_higher_scored_departments = [
            {"department": dep, "score": score}
            for dep, score in sorted(
                score_by_department.items(), key=lambda kv: kv[1], reverse=True
            )
            if dep != canonical_department and score > selected_score
        ]

        existing_routed = existing_metadata.get("routed_departments", []) or []
        routed_departments = []
        for dep in existing_routed + [canonical_department]:
            if dep not in routed_departments:
                routed_departments.append(dep)

        update_ops = {
            "metadata.route_to": canonical_department,
            "metadata.note": payload.note or "routed_by_manual_review",
            "metadata.routed_departments": routed_departments,
            "metadata.manual_review.status": "resolved",
            "metadata.manual_review.decided_department": canonical_department,
            "metadata.manual_review.previously_higher_scored_departments": previously_higher_scored_departments,
            "metadata.manual_review.decided_at": datetime.now(timezone.utc),
        }
        if selected_label:
            update_ops["metadata.classification.label"] = selected_label
            update_ops["metadata.manual_review.decided_label"] = selected_label
        if payload.decided_by:
            update_ops["metadata.manual_review.decided_by"] = payload.decided_by

        update_doc = {
            "$set": update_ops,
            "$push": {
                "metadata.routing_history": {
                    "department": canonical_department,
                    "reason": "manual_review_decision",
                    "timestamp": datetime.now(timezone.utc),
                }
            },
        }

        mongo_db[DOC_FILES_COLLECTION].update_one({"_id": oid}, update_doc)

        updated = mongo_db[DOC_FILES_COLLECTION].find_one({"_id": oid})
        if selected_label:
            feedback_text = (
                (existing.get("metadata", {}) or {}).get("summary")
                or existing.get("filename")
                or ""
            )
            _append_feedback_sample(
                text=feedback_text,
                label=selected_label,
                department=canonical_department,
                source_doc_id=str(oid),
            )
        return {
            "id": str(updated["_id"]),
            "filename": updated.get("filename"),
            "route_to": updated.get("metadata", {}).get("route_to"),
            "classification": updated.get("metadata", {}).get("classification", {}),
            "note": updated.get("metadata", {}).get("note"),
            "manual_review": updated.get("metadata", {}).get("manual_review", {}),
        }
    except InvalidId:
        return JSONResponse({"message": "Invalid document id"}, status_code=400)
    except Exception as e:
        return JSONResponse({"status": "error", "message": str(e)}, status_code=500)


@app.get("/documents/{document_id}/download")
def download_document(document_id: str):
    try:
        _ensure_db()
        oid = ObjectId(document_id)
        d = mongo_db[DOC_FILES_COLLECTION].find_one({"_id": oid})
        if not d:
            return JSONResponse({"message": "Document not found"}, status_code=404)

        grid_out = doc_bucket.open_download_stream(oid)
        content_type = d.get("metadata", {}).get(
            "content_type", "application/octet-stream")
        filename = d.get("filename", f"{document_id}.bin")

        return StreamingResponse(
            grid_out,
            media_type=content_type,
            headers={"Content-Disposition": f'attachment; filename="{filename}"'},
        )
    except InvalidId:
        return JSONResponse({"message": "Invalid document id"}, status_code=400)
    except Exception as e:
        return JSONResponse({"status": "error", "message": str(e)}, status_code=500)


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="127.0.0.1", port=8000)
