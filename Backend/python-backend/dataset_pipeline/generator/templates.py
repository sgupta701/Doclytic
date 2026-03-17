import random

from metrics_data import cities, legal_entities, person_names, vendor_names


def _humanize(label: str) -> str:
    return label.replace("_", " ").title()


def _rand_date() -> str:
    return f"{random.randint(1, 28):02d}-{random.randint(1, 12):02d}-{random.randint(2023, 2026)}"


def _rand_gstin() -> str:
    letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ"
    alnum = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ"
    return (
        f"{random.randint(10, 99)}"
        f"{''.join(random.choice(letters) for _ in range(5))}"
        f"{random.randint(1000, 9999)}"
        f"{random.choice(letters)}"
        f"{random.choice(alnum)}"
        f"Z"
        f"{random.choice(alnum)}"
    )


def _hr_text(label: str) -> str:
    candidate = random.choice(person_names)
    return f"""
HR DOCUMENT: {_humanize(label)}
Department: HR
Candidate Name: {candidate}
Document Date: {_rand_date()}

Profile Summary:
Candidate profile reviewed for role fit and policy compliance.

Employment Details:
Offer/appointment terms, compensation band and reporting manager are included.

Confidentiality:
This HR file contains personal information and NDA related clauses.
""".strip()


def _legal_text(label: str) -> str:
    party_a = random.choice(legal_entities)
    party_b = random.choice([x for x in legal_entities if x != party_a])
    return f"""
LEGAL DOCUMENT: {_humanize(label)}
Department: Legal
Agreement Date: {_rand_date()}
Parties: {party_a} and {party_b}

Clause 1.1 Scope:
This agreement defines legal obligations and enforceable terms.

Clause 3.2 Confidentiality:
No disclosure of confidential information without written consent.

Clause 6.1 Dispute Resolution:
All disputes subject to jurisdiction and arbitration provisions.
""".strip()


def _finance_text(label: str) -> str:
    vendor = random.choice(vendor_names)
    qty = random.randint(1, 20)
    unit_price = random.randint(2000, 65000)
    total = qty * unit_price
    return f"""
FINANCE DOCUMENT: {_humanize(label)}
Department: Finance
Vendor: {vendor}
Date: {_rand_date()}
GSTIN: {_rand_gstin()}

Invoice/Payment Details:
Line Item Quantity: {qty}
Unit Price: INR {unit_price:,}
Total Amount: INR {total:,}

Compliance:
Tax and accounting entry validated for finance review.
""".strip()


def _operations_text(label: str) -> str:
    return f"""
OPERATIONS DOCUMENT: {_humanize(label)}
Department: Operations
Location: {random.choice(cities)}
Reporting Date: {_rand_date()}

Summary:
Operations performance and throughput trends recorded for this period.

Metrics:
Open incidents: {random.randint(0, 25)}
Closed tasks: {random.randint(40, 220)}
Inventory variance: {random.randint(0, 8)}%

Action:
Escalations and follow-up tasks assigned to relevant teams.
""".strip()


def _procurement_text(label: str) -> str:
    vendor = random.choice(vendor_names)
    return f"""
PROCUREMENT DOCUMENT: {_humanize(label)}
Department: Procurement
Vendor: {vendor}
Request Date: {_rand_date()}

Procurement Details:
Material request, quotation references and delivery timelines are listed.

Commercial Terms:
Payment milestones, penalties and acceptance conditions are documented.

Logistics:
Shipment and goods receipt tracking IDs attached for closure.
""".strip()


def _generic_text(label: str, department: str) -> str:
    return f"""
DOCUMENT TYPE: {_humanize(label)}
Department: {department}
Generated On: {_rand_date()}

Body:
This file contains department-specific records and process details.
""".strip()


def generate_department_document(label: str, department: str) -> str:
    if department == "HR":
        return _hr_text(label)
    if department == "Legal":
        return _legal_text(label)
    if department == "Finance":
        return _finance_text(label)
    if department == "Operations":
        return _operations_text(label)
    if department == "Procurement":
        return _procurement_text(label)
    return _generic_text(label, department)
