from datetime import datetime, timezone
from typing import Any, Dict

from bson import ObjectId

from priority_service.config.mongodb import get_database
from priority_service.config.settings import settings


def get_document_extraction(document_id: str) -> Dict[str, Any] | None:
    """Fetch extraction metadata for a document."""
    db = get_database()
    return db[settings.extraction_collection].find_one({"document_id": ObjectId(document_id)})


def upsert_document_priority(document_id: str, result: Dict[str, Any]) -> None:
    """Write priority output to DocumentPriority collection."""
    db = get_database()
    payload = {
        "document_id": ObjectId(document_id),
        **result,
        "engine_version": settings.engine_version,
        "updatedAt": datetime.now(timezone.utc),
    }

    db[settings.priority_collection].update_one(
        {"document_id": ObjectId(document_id)},
        {
            "$set": payload,
            "$setOnInsert": {"createdAt": datetime.now(timezone.utc)},
        },
        upsert=True,
    )
