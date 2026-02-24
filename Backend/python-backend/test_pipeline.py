import requests

BASE_URL = "http://127.0.0.1:8000"


def test_file(path):
    print(f"\n Testing: {path}")
    with open(path, "rb") as f:
        r = requests.post(f"{BASE_URL}/ingest",
                          files={"file": (path, f, "application/pdf")})
    data = r.json()
    print(f"  Label      : {data.get('predicted_label')}")
    print(f"  Confidence : {data.get('probability')}")
    print(f"  Summary    : {str(data.get('summary'))[:300]}")
    print(f"  Routed to  : {data.get('route_to')}")
    print(f"  Stored at  : {data.get('storage_stored_at')}")
    print(f"  Summary txt: {data.get('storage_summary_stored_at')}")


def test_text(raw_text):
    print(f"\n Testing: raw text input")
    r = requests.post(f"{BASE_URL}/ingest", data={"text": raw_text})
    data = r.json()
    print(f"  Label      : {data.get('predicted_label')}")
    print(f"  Confidence : {data.get('probability')}")
    print(f"  Summary    : {str(data.get('summary'))[:300]}")
    print(f"  Routed to  : {data.get('route_to')}")


if __name__ == "__main__":
    # ── Test 1: Upload a real document ──────────────────────────
    test_file("storage/CV.pdf")           # change to any file in storage/

    # ── Test 2: Raw text ────────────────────────────────────────
    test_text("""
        Invoice #INV-2025-001
        Billed to: Acme Corporation
        Services: Software development and consulting for Q1 2025
        Amount due: $12,500
        Payment terms: Net 30 days
        Please remit payment to the account details below.
    """)
