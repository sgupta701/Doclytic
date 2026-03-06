from __future__ import annotations

from datetime import date, datetime, timezone
from typing import Any, Dict, Iterable, Tuple

SENDER_WEIGHTS = {
    "court": 35,
    "regulator": 30,
    "government": 26,
    "police": 24,
    "internal": 75,
    "vendor": 10,
    "customer": 12,
    "unknown": 60,
}

DOCUMENT_TYPE_WEIGHTS = {
    "court_order": 28,
    "legal_notice": 26,
    "show_cause": 24,
    "compliance": 20,
    "complaint": 16,
    "contract": 14,
    "invoice": 10,
    "memo": 8,
}

URGENCY_KEYWORD_WEIGHTS = {
    "immediate": 10,
    "urgent": 8,
    "asap": 7,
    "within 24 hours": 12,
    "today": 8,
    "overdue": 9,
    "final reminder": 10,
    "show cause": 12,
    "legal notice": 12,
}


def _normalize_key(value: Any, default: str = "unknown") -> str:
    if not isinstance(value, str):
        return default
    normalized = value.strip().lower().replace("-", "_").replace(" ", "_")
    return normalized or default


def _parse_deadline(value: Any) -> datetime | None:
    if value is None:
        return None

    if isinstance(value, datetime):
        return value if value.tzinfo else value.replace(tzinfo=timezone.utc)

    if isinstance(value, date):
        return datetime(value.year, value.month, value.day, tzinfo=timezone.utc)

    if isinstance(value, str) and value.strip():
        candidate = value.strip().replace("Z", "+00:00")
        try:
            parsed = datetime.fromisoformat(candidate)
            return parsed if parsed.tzinfo else parsed.replace(tzinfo=timezone.utc)
        except ValueError:
            return None

    return None


def _score_deadline(selected_deadline: Any) -> Tuple[int, int | None]:
    deadline_dt = _parse_deadline(selected_deadline)
    if not deadline_dt:
        return 0, None

    now = datetime.now(timezone.utc)
    days_remaining = int((deadline_dt - now).total_seconds() // 86400)

    if days_remaining <= 0:
        return 35, days_remaining
    if days_remaining <= 1:
        return 30, days_remaining
    if days_remaining <= 3:
        return 24, days_remaining
    if days_remaining <= 7:
        return 16, days_remaining
    if days_remaining <= 14:
        return 8, days_remaining
    return 2, days_remaining


def _score_urgency_indicators(urgency_indicators: Iterable[str]) -> Tuple[int, list[str]]:
    score = 0
    matched_keywords: list[str] = []

    for indicator in urgency_indicators or []:
        if not isinstance(indicator, str):
            continue

        lowered = indicator.strip().lower()
        if not lowered:
            continue

        for keyword, weight in URGENCY_KEYWORD_WEIGHTS.items():
            if keyword in lowered:
                score += weight
                matched_keywords.append(keyword)

    return min(score, 25), sorted(set(matched_keywords))


def _score_sender(sender_category: Any) -> int:
    return SENDER_WEIGHTS.get(_normalize_key(sender_category), SENDER_WEIGHTS["unknown"])


def _score_document_type(document_type: Any) -> int:
    return DOCUMENT_TYPE_WEIGHTS.get(_normalize_key(document_type), 6)


def _level_from_score(score: int) -> str:
    if score >= 80:
        return "Critical"
    if score >= 60:
        return "High"
    if score >= 35:
        return "Medium"
    return "Low"


def _escalate(
    current_score: int,
    sender_category: Any,
    matched_urgency_keywords: list[str],
    days_remaining: int | None,
) -> Tuple[int, Dict[str, Any]]:
    escalation_reasons: list[str] = []
    minimum_score = current_score

    if days_remaining is not None and days_remaining <= 1:
        escalation_reasons.append("deadline_within_24h")

    if any(key in matched_urgency_keywords for key in ("legal notice", "show cause")):
        escalation_reasons.append("legal_or_show_cause_urgency")

    sender_key = _normalize_key(sender_category)
    if sender_key in {"court", "regulator"} and current_score >= 60:
        escalation_reasons.append("high_risk_sender")

    if sender_key == "government" and any(
        key in matched_urgency_keywords for key in ("immediate", "urgent")
    ):
        escalation_reasons.append("government_official_urgent")
        minimum_score = max(minimum_score, 60)

    if not escalation_reasons:
        return current_score, {"applied": False, "reason": "none"}

    boosted_score = min(max(current_score + 10, minimum_score), 100)
    return boosted_score, {"applied": True, "reason": "; ".join(escalation_reasons)}


def compute_priority(metadata: Dict[str, Any]) -> Dict[str, Any]:
    """Rule-based weighted priority scoring using extracted metadata."""
    sender = metadata.get("sender", {}) if isinstance(
        metadata.get("sender"), dict) else {}
    sender_category = sender.get("category", "unknown")

    sender_weight = _score_sender(sender_category)
    doc_type_weight = _score_document_type(metadata.get("document_type"))
    deadline_score, days_remaining = _score_deadline(
        metadata.get("selected_deadline"))
    urgency_score, matched_urgency_keywords = _score_urgency_indicators(
        metadata.get("urgency_indicators", []))

    base_score = min(sender_weight + doc_type_weight +
                     deadline_score + urgency_score, 100)
    final_score, escalation = _escalate(
        current_score=base_score,
        sender_category=sender_category,
        matched_urgency_keywords=matched_urgency_keywords,
        days_remaining=days_remaining,
    )

    return {
        "priority_score": final_score,
        "priority_level": _level_from_score(final_score),
        "breakdown": {
            "sender_weight": sender_weight,
            "deadline_score": deadline_score,
            "urgency_score": urgency_score,
            "doc_type_weight": doc_type_weight,
        },
        "escalation": escalation,
    }
