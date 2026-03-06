# ROUTING_RULES = {
#     # Map classifier labels -> sidebar department names
#     "invoice": "Finance",
#     "contract": "Legal",

#     "resume,raise letter,complaint letter, appointment letter, "
#     "relieving letter, offer letter, experience certificate, non-disclosure agreement, code of condict, salary slips,employee handbook acknowledgement, company policies": "HR",


#     "report": "Operations",
#     # Common procurement-like labels
#     "purchase_order": "Procurement",
#     "quotation": "Procurement",
#     "rfq": "Procurement",
# }

ROUTING_RULES = {

    "Finance": [
        "invoice",
        "payment_receipt",
        "expense_report",
        "bank_statement",
        "tax_return",
        "gst_filing",
        "balance_sheet",
        "profit_and_loss_statement",
        "financial_statement",
        "budget_report",
        "audit_report",
        "salary_slip",
        "reimbursement_claim",
        "credit_note",
        "debit_note",
        "payment_voucher",
        "purchase_invoice"
    ],

    "HR": [
        "resume",
        "cv",
        "job_application",
        "offer_letter",
        "appointment_letter",
        "joining_letter",
        "relieving_letter",
        "experience_letter",
        "promotion_letter",
        "salary_increment_letter",
        "complaint_letter",
        "warning_letter",
        "termination_letter",
        "employee_contract",
        "employee_agreement",
        "leave_application",
        "attendance_record",
        "employee_handbook_acknowledgement",
        "company_policies",
        "code_of_conduct",
        "nda_employee"
    ],

    "Legal": [
        "contract",
        "service_agreement",
        "non_disclosure_agreement",
        "nda",
        "memorandum_of_understanding",
        "partnership_agreement",
        "legal_notice",
        "litigation_document",
        "compliance_document",
        "patent_application",
        "copyright_document",
        "terms_and_conditions",
        "privacy_policy"
    ],

    "Procurement": [
        "purchase_order",
        "quotation",
        "rfq",
        "rfi",
        "tender_document",
        "vendor_contract",
        "supplier_agreement",
        "goods_receipt_note",
        "delivery_challan",
        "material_request",
        "procurement_request",
        "vendor_invoice",
        "supply_order"
    ],

    "Operations": [
        "project_report",
        "operations_report",
        "daily_report",
        "weekly_report",
        "monthly_report",
        "performance_report",
        "incident_report",
        "maintenance_report",
        "production_report",
        "inventory_report",
        "quality_assurance_report",
        "logistics_report",
        "shipment_report",
        "work_order"
    ],

    "IT": [
        "system_design_document",
        "technical_documentation",
        "api_documentation",
        "software_requirements_specification",
        "architecture_document",
        "bug_report",
        "incident_ticket",
        "change_request",
        "deployment_report",
        "security_policy",
        "access_request",
        "it_asset_request"
    ],

    "Admin": [
        "internal_memo",
        "circular",
        "meeting_minutes",
        "office_notice",
        "facility_request",
        "maintenance_request",
        "visitor_log",
        "travel_request",
        "travel_expense_claim",
        "asset_allocation_form"
    ]
}
