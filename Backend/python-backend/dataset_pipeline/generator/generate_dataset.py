import csv
import random
import sys
from collections import Counter
from pathlib import Path

from noise import add_ocr_noise
from templates import generate_department_document

PY_BACKEND_DIR = Path(__file__).resolve().parents[2]
if str(PY_BACKEND_DIR) not in sys.path:
    sys.path.append(str(PY_BACKEND_DIR))

from config.routing_rules import ROUTING_RULES  # noqa: E402

OUTPUT_PATH = Path(__file__).resolve().parent.parent / "output" / "dataset.csv"
TARGET_PER_LABEL = 250
TARGET_DEPARTMENTS = ["HR", "Finance", "Legal", "Operations", "Procurement"]


def read_label_counts(path: Path) -> Counter:
    counts = Counter()
    if not path.exists() or path.stat().st_size == 0:
        return counts

    with path.open("r", newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            label = (row.get("label") or "").strip().lower()
            if label:
                counts[label] += 1
    return counts


def append_rows(path: Path, rows):
    write_header = not path.exists() or path.stat().st_size == 0
    with path.open("a", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=["text", "label"])
        if write_header:
            writer.writeheader()
        writer.writerows(rows)


def generate_rows(label: str, department: str, missing_count: int):
    rows = []
    for _ in range(missing_count):
        text = generate_department_document(label=label, department=department)
        if random.random() < 0.35:
            text = add_ocr_noise(text)
        rows.append({"text": text, "label": label})
    return rows


def main():
    counts = read_label_counts(OUTPUT_PATH)
    total_appended = 0

    for department in TARGET_DEPARTMENTS:
        labels = ROUTING_RULES.get(department, [])
        for raw_label in labels:
            label = raw_label.strip().lower()
            current = counts.get(label, 0)
            missing = max(0, TARGET_PER_LABEL - current)
            new_rows = generate_rows(label, department, missing)
            if new_rows:
                append_rows(OUTPUT_PATH, new_rows)
                counts[label] += len(new_rows)
                total_appended += len(new_rows)
            print(
                f"{department}/{label}: existing={current}, "
                f"appended={len(new_rows)}, total={counts[label]}"
            )

    print(f"Done. Appended {total_appended} rows to {OUTPUT_PATH}")


if __name__ == "__main__":
    main()
