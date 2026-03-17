from typing import Any, Dict


def normalize_metadata(extraction_doc: Dict[str, Any]) -> Dict[str, Any]:
    """Prepare extracted metadata for scoring."""
    dates = extraction_doc.get("dates", {})
    if not isinstance(dates, dict):
        dates = {}

    return {
        "sender": extraction_doc.get("sender", {}),
        "document_type": extraction_doc.get("document_type"),
        "selected_deadline": dates.get("selected_deadline"),
        "urgency_indicators": extraction_doc.get("urgency_indicators", []),
    }
