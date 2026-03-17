from bson.errors import InvalidId

from priority_service.services.metadata_extractor import normalize_metadata
from priority_service.services.priority_repository import (
    get_document_extraction,
    upsert_document_priority,
)
from priority_service.services.scoring import compute_priority


def run_priority_pipeline(document_id: str) -> dict:
    """Run extraction -> scoring -> persistence for one document."""
    try:
        extraction_doc = get_document_extraction(document_id)
    except InvalidId as exc:
        raise ValueError("Invalid document_id") from exc

    if not extraction_doc:
        raise LookupError("DocumentExtraction not found")

    metadata = normalize_metadata(extraction_doc)
    priority_result = compute_priority(metadata)
    upsert_document_priority(document_id, priority_result)

    return {
        "document_id": document_id,
        "status": "priority_saved",
        "result": priority_result,
    }
