import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowRight, FileText, X } from "lucide-react";
import DashboardLayout from "../components/DashboardLayout";
import { triggerTabPulse } from "../utils/tabPulse";

interface Department {
  _id: string;
  name: string;
  color?: string;
}

interface ManualReviewMetadata {
  required?: boolean;
  status?: string;
  suggested_department?: string | null;
  predicted_label?: string;
  decided_label?: string;
  confidence?: number;
  decided_department?: string;
}

interface DocumentItem {
  _id: string;
  title: string;
  summary?: string;
  createdAt?: string;
  routed_department?: string;
  routed_departments?: string[];
  python_file_id?: string;
  department_id?: string | { _id?: string; name?: string };
  metadata?: {
    manual_review?: ManualReviewMetadata;
    [k: string]: unknown;
  };
}

const BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:5000";
const API_URL = `${BASE_URL}`.replace(/\/$/, "");
const AI_BASE_URL = (import.meta.env.VITE_AI_API_URL || "http://127.0.0.1:8000").replace(/\/$/, "");
const FALLBACK_LABELS_BY_DEPARTMENT: Record<string, string[]> = {
  HR: [
    "resume", "profile", "employee_profile", "cv", "job_application", "offer_letter", "appraisal_letter",
    "appointment_letter", "joining_letter", "relieving_letter", "experience_letter", "promotion_letter",
    "salary_increment_letter", "complaint_letter", "warning_letter", "termination_letter", "employee_contract",
    "employee_agreement", "leave_application", "attendance_record", "employee_handbook_acknowledgement",
    "company_policies", "code_of_conduct", "nda_employee", "hr_nda",
  ],
  Finance: [
    "invoice", "tax_invoice", "proforma_invoice", "payment_receipt", "payment_advice", "payment_confirmation",
    "expense_report", "bank_statement", "tax_return", "gst_filing", "balance_sheet", "profit_and_loss_statement",
    "financial_statement", "budget_report", "audit_report", "salary_slip", "reimbursement_claim",
    "credit_note", "debit_note", "payment_voucher", "purchase_invoice", "financial_report", "cash_flow_statement",
  ],
  Legal: [
    "contract", "contracts", "service_agreement", "non_disclosure_agreement", "nda", "lease_agreement",
    "legal_contract", "memorandum_of_understanding", "partnership_agreement", "legal_notice", "litigation_document",
    "compliance_document", "patent_application", "copyright_document", "terms_and_conditions", "privacy_policy",
  ],
  Operations: [
    "report", "project_report", "operations_report", "daily_report", "weekly_report", "monthly_report",
    "performance_report", "incident_report", "maintenance_report", "production_report", "inventory_report",
    "quality_assurance_report", "logistics_report", "shipment_report", "work_order",
  ],
  Procurement: [
    "purchase_order", "quotation", "rfq", "rfi", "tender_document", "vendor_contract", "supplier_agreement",
    "goods_receipt_note", "delivery_challan", "material_request", "procurement_request", "vendor_invoice", "supply_order",
  ],
  Admin: [
    "internal_memo", "circular", "meeting_minutes", "office_notice", "facility_request", "maintenance_request",
    "visitor_log", "travel_request", "travel_expense_claim", "asset_allocation_form",
  ],
};

async function authFetch(url: string, options: RequestInit = {}) {
  const token = localStorage.getItem("token");
  const headers: Record<string, string> = {
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(options.body instanceof FormData ? {} : { "Content-Type": "application/json" }),
    ...(options.headers as Record<string, string>),
  };
  return fetch(url, { ...options, headers, credentials: "include" });
}

export default function ManualReview() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [routingId, setRoutingId] = useState<string | null>(null);
  const [dismissingId, setDismissingId] = useState<string | null>(null);
  const [clearingQueue, setClearingQueue] = useState(false);
  const [documents, setDocuments] = useState<DocumentItem[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [selectedDeptByDoc, setSelectedDeptByDoc] = useState<Record<string, string>>({});
  const [selectedLabelByDoc, setSelectedLabelByDoc] = useState<Record<string, string>>({});
  const [labelsByDepartment, setLabelsByDepartment] = useState<Record<string, string[]>>(
    FALLBACK_LABELS_BY_DEPARTMENT
  );

  const FALLBACK_DEPARTMENT_NAMES = ["Finance", "HR", "Legal", "Operations", "Procurement", "Admin"];

  const normalizeName = (value?: string) =>
    (value || "").trim().toLowerCase().replace(/\s+/g, " ");
  const normalizeLabel = (value?: string) =>
    (value || "").trim().toLowerCase().replace(/\s+/g, "_");
  const prettifyLabel = (value?: string) =>
    (value || "")
      .split("_")
      .filter(Boolean)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(" ");
  const toDepartmentSlug = (departmentName: string) =>
    departmentName.trim().toLowerCase().replace(/\s+/g, "-");

  const getDeptIdByName = (name?: string | null, sourceDepartments: Department[] = departments) => {
    const wanted = normalizeName(name || "");
    if (!wanted) return "";
    const match = sourceDepartments.find((d) => normalizeName(d.name) === wanted);
    if (match?._id) return match._id;

    // Common fallback mappings from AI suggestion labels to actual department names.
    const alias: Record<string, string> = {
      operations: "admin",
      operation: "admin",
      finances: "finance",
    };
    const aliasTarget = alias[wanted];
    if (aliasTarget) {
      const aliasMatch = sourceDepartments.find((d) => normalizeName(d.name) === aliasTarget);
      if (aliasMatch?._id) return aliasMatch._id;
    }

    return match?._id || "";
  };

  const getDeptByName = (name?: string | null, sourceDepartments: Department[] = departments) => {
    const wanted = normalizeName(name || "");
    if (!wanted) return undefined;
    return sourceDepartments.find((d) => normalizeName(d.name) === wanted);
  };

  const getLabelsForDepartment = (departmentName?: string | null) => {
    const selected = normalizeName(departmentName || "");
    if (!selected) return [] as string[];
    const key = Object.keys(labelsByDepartment).find((deptName) => normalizeName(deptName) === selected);
    return key ? labelsByDepartment[key] || [] : [];
  };

  const manualReviewDocs = useMemo(
    () =>
      documents.filter((doc) => {
        const routed = normalizeName(doc.routed_department);
        const manual = doc.metadata?.manual_review;
        return (
          routed === "manual_review" ||
          manual?.required === true ||
          normalizeName(manual?.status) === "pending"
        );
      }),
    [documents]
  );

  const departmentOptions = useMemo(() => {
    const allNames: string[] = [];
    const pushUnique = (name?: string) => {
      const trimmed = (name || "").trim();
      if (!trimmed) return;
      if (!allNames.some((n) => normalizeName(n) === normalizeName(trimmed))) {
        allNames.push(trimmed);
      }
    };

    departments.forEach((d) => pushUnique(d.name));
    manualReviewDocs.forEach((doc) => pushUnique(doc.metadata?.manual_review?.suggested_department || ""));
    FALLBACK_DEPARTMENT_NAMES.forEach((name) => pushUnique(name));

    return allNames.sort((a, b) => a.localeCompare(b));
  }, [departments, manualReviewDocs]);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const [docsRes, deptsRes] = await Promise.all([
          authFetch(`${API_URL}/api/documents`),
          authFetch(`${API_URL}/api/departments`),
        ]);
        const rulesRes = await fetch(`${AI_BASE_URL}/routing-rules`).catch(() => null);

        const docsJson = docsRes.ok ? await docsRes.json().catch(() => []) : [];
        const deptsJson = deptsRes.ok ? await deptsRes.json().catch(() => []) : [];
        const docs = (Array.isArray(docsJson) ? docsJson : docsJson?.data || []) as DocumentItem[];
        const depts = (Array.isArray(deptsJson) ? deptsJson : deptsJson?.data || []) as Department[];
        const rulesJson =
          rulesRes && rulesRes.ok
            ? await rulesRes.json().catch(() => null)
            : null;

        const fetchedDepartments = rulesJson?.departments;
        if (fetchedDepartments && typeof fetchedDepartments === "object") {
          setLabelsByDepartment(fetchedDepartments as Record<string, string[]>);
        }

        setDocuments(docs);
        setDepartments(depts);

        const defaults: Record<string, string> = {};
        const defaultLabels: Record<string, string> = {};
        docs.forEach((doc) => {
          const suggested = doc.metadata?.manual_review?.suggested_department || "";
          const currentDeptId = typeof doc.department_id === "string" ? doc.department_id : doc.department_id?._id || "";
          const currentDeptName =
            typeof doc.department_id === "object" ? doc.department_id?.name || "" : depts.find((d) => d._id === currentDeptId)?.name || "";
          const predictedLabel = normalizeLabel(doc.metadata?.manual_review?.predicted_label);

          if ((suggested || "").trim()) {
            defaults[doc._id] = suggested;
          } else if (currentDeptName) {
            defaults[doc._id] = currentDeptName;
          }

          const deptForDefault = defaults[doc._id] || currentDeptName || suggested;
          const deptLabels = (() => {
            const selected = normalizeName(deptForDefault || "");
            const source = fetchedDepartments && typeof fetchedDepartments === "object"
              ? (fetchedDepartments as Record<string, string[]>)
              : FALLBACK_LABELS_BY_DEPARTMENT;
            const key = Object.keys(source).find((deptName) => normalizeName(deptName) === selected);
            return key ? (source[key] || []).map((label) => normalizeLabel(label)) : [];
          })();

          if (predictedLabel && deptLabels.includes(predictedLabel)) {
            defaultLabels[doc._id] = predictedLabel;
          } else if (deptLabels.length > 0) {
            defaultLabels[doc._id] = deptLabels[0];
          }
        });
        setSelectedDeptByDoc(defaults);
        setSelectedLabelByDoc(defaultLabels);
      } catch (error) {
        console.error("Manual review load error:", error);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const routeSingleDocument = async (
    doc: DocumentItem,
    selectedDepartmentName: string,
    selectedLabel: string
  ) => {
    const normalizedLabel = normalizeLabel(selectedLabel);
    if (!selectedDepartmentName) {
      throw new Error("Select a department first.");
    }
    if (!normalizedLabel) {
      throw new Error("Select a label first.");
    }

    const chosen = getDeptByName(selectedDepartmentName);
    const existingMetadata = doc.metadata || {};
    const existingManualReview = existingMetadata.manual_review || {};

    const res = await authFetch(`${API_URL}/api/documents/${doc._id}`, {
      method: "PUT",
      body: JSON.stringify({
        department_id: chosen?._id || null,
        routed_department: selectedDepartmentName,
        metadata: {
          ...existingMetadata,
          manual_review: {
            ...existingManualReview,
            required: false,
            status: "resolved",
            decided_department: selectedDepartmentName,
            decided_label: normalizedLabel,
          },
          classification: {
            ...(existingMetadata.classification as Record<string, unknown> || {}),
            label: normalizedLabel,
          },
        },
      }),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(text || "Failed to route document");
    }

    if (doc.python_file_id) {
      const pyRes = await fetch(`${AI_BASE_URL}/documents/${doc.python_file_id}/route`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          route_to: selectedDepartmentName,
          label: normalizedLabel,
          note: "routed_by_manual_review",
        }),
      });

      if (!pyRes.ok) {
        const pyText = await pyRes.text().catch(() => "");
        throw new Error(pyText || "Failed to sync Python GridFS metadata");
      }
    }

    triggerTabPulse(`/department/${toDepartmentSlug(selectedDepartmentName)}`);
    setDocuments((prev) => prev.filter((d) => d._id !== doc._id));
  };

  const onRouteDocument = async (doc: DocumentItem) => {
    const selectedDepartmentName = (selectedDeptByDoc[doc._id] || "").trim();
    const selectedLabel = normalizeLabel(selectedLabelByDoc[doc._id] || "");
    if (!selectedDepartmentName) {
      alert("Select a department first.");
      return;
    }
    if (!selectedLabel) {
      alert("Select a label first.");
      return;
    }

    setRoutingId(doc._id);
    try {
      await routeSingleDocument(doc, selectedDepartmentName, selectedLabel);
    } catch (error) {
      console.error("Manual route error:", error);
      alert("Could not route document.");
    } finally {
      setRoutingId(null);
    }
  };

  const clearEntireQueue = async () => {
    if (manualReviewDocs.length === 0 || clearingQueue) return;
    const confirmed = window.confirm(
      `Clear entire manual review queue (${manualReviewDocs.length} documents)?`
    );
    if (!confirmed) return;

    setClearingQueue(true);
    try {
      let successCount = 0;
      const docsSnapshot = [...manualReviewDocs];

      for (const doc of docsSnapshot) {
        const review = doc.metadata?.manual_review;
        const suggestedDepartment = (review?.suggested_department || "").trim();
        const deptName =
          (selectedDeptByDoc[doc._id] || "").trim() ||
          suggestedDepartment ||
          (typeof doc.department_id === "object" ? (doc.department_id?.name || "").trim() : "") ||
          "Admin";

        const deptLabels = getLabelsForDepartment(deptName).map((label) => normalizeLabel(label));
        const predictedLabel = normalizeLabel(review?.predicted_label);
        const chosenLabel =
          (selectedLabelByDoc[doc._id] || "").trim() && deptLabels.includes(normalizeLabel(selectedLabelByDoc[doc._id]))
            ? normalizeLabel(selectedLabelByDoc[doc._id])
            : (predictedLabel && deptLabels.includes(predictedLabel) ? predictedLabel : (deptLabels[0] || ""));

        if (!deptName || !chosenLabel) continue;

        try {
          await routeSingleDocument(doc, deptName, chosenLabel);
          successCount += 1;
        } catch (err) {
          console.error(`Failed to clear manual review item ${doc._id}:`, err);
        }
      }

      alert(`Cleared ${successCount} of ${docsSnapshot.length} documents from manual review queue.`);
    } finally {
      setClearingQueue(false);
    }
  };

  const dismissFromQueueWithNegativeFeedback = async (doc: DocumentItem) => {
    const review = doc.metadata?.manual_review;
    const predictedLabel = normalizeLabel(review?.predicted_label);
    const existingMetadata = doc.metadata || {};
    const existingManualReview = existingMetadata.manual_review || {};
    const fallbackRoute = (
      (Array.isArray(doc.routed_departments) ? doc.routed_departments : []).find(
        (d) => normalizeName(d) !== "manual_review"
      ) ||
      (normalizeName(doc.routed_department) !== "manual_review" ? doc.routed_department : "") ||
      ""
    ).trim();

    const res = await authFetch(`${API_URL}/api/documents/${doc._id}`, {
      method: "PUT",
      body: JSON.stringify({
        routed_department: fallbackRoute,
        metadata: {
          ...existingMetadata,
          manual_review: {
            ...existingManualReview,
            required: false,
            status: "dismissed",
            dismissed_reason: "prediction_marked_wrong",
            dismissed_at: new Date().toISOString(),
          },
        },
      }),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(text || "Failed to dismiss from manual review queue");
    }

    if (doc.python_file_id && predictedLabel) {
      const feedbackText = (doc.summary || doc.title || "").trim();
      if (feedbackText.length >= 20) {
        await fetch(`${AI_BASE_URL}/learning/feedback-negative`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            text: feedbackText,
            wrong_label: predictedLabel,
            source_doc_id: doc.python_file_id,
          }),
        }).catch(() => null);
      }
    }

    setDocuments((prev) => prev.filter((d) => d._id !== doc._id));
  };

  return (
    <DashboardLayout>
      <div className="min-h-screen bg-slate-50 p-8">
        <div className="mb-8 flex items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Manual Review</h1>
            <p className="text-gray-600 mt-1">Low-confidence documents are parked here until a user confirms the final department.</p>
          </div>
          <button
            onClick={clearEntireQueue}
            disabled={loading || clearingQueue || manualReviewDocs.length === 0}
            className="px-4 py-2 rounded-lg bg-red-600 text-white text-sm hover:bg-red-700 disabled:opacity-60"
          >
            {clearingQueue ? "Clearing..." : "Clear Entire Queue"}
          </button>
        </div>

        {loading ? (
          <div className="py-20 text-center text-gray-500">Loading manual review queue...</div>
        ) : manualReviewDocs.length === 0 ? (
          <div className="bg-white rounded-2xl p-12 text-center shadow-sm border border-gray-100">
            <FileText className="w-10 h-10 mx-auto text-gray-300 mb-3" />
            <p className="text-gray-500">No documents waiting for manual review.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {manualReviewDocs.map((doc) => {
              const review = doc.metadata?.manual_review;
              const suggested = review?.suggested_department || "No suggestion";
              const confidence = typeof review?.confidence === "number" ? `${(review.confidence * 100).toFixed(1)}%` : "N/A";
              const previouslyRoutedDepartments = Array.from(
                new Set(
                  [
                    ...(Array.isArray(doc.routed_departments) ? doc.routed_departments : []),
                    doc.routed_department || "",
                  ]
                    .map((d) => (d || "").trim())
                    .filter((d) => d && normalizeName(d) !== "manual_review")
                )
              );
              const previouslyRoutedText = previouslyRoutedDepartments.join(" / ");

              return (
                <div key={doc._id} className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <button
                        onClick={() => navigate(`/document/${doc._id}`)}
                        className="text-left text-lg font-semibold text-gray-900 hover:text-blue-600 transition"
                      >
                        {doc.title}
                      </button>
                      <p className="text-sm text-gray-500 mt-1">{doc.summary || "No summary available."}</p>
                      <div className="mt-3 flex flex-wrap gap-3 text-xs">
                        <span className="px-2 py-1 rounded bg-orange-50 text-orange-700 border border-orange-200">
                          Suggested: {suggested}
                        </span>
                        <span className="px-2 py-1 rounded bg-blue-50 text-blue-700 border border-blue-200">
                          Confidence: {confidence}
                        </span>
                        {previouslyRoutedText && (
                          <span className="px-2 py-1 rounded bg-emerald-50 text-emerald-700 border border-emerald-200">
                            Previously Routed: {previouslyRoutedText}
                          </span>
                        )}
                        {review?.predicted_label && (
                          <span className="px-2 py-1 rounded bg-gray-100 text-gray-700 border border-gray-200">
                            Predicted Label: {review.predicted_label}
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <select
                        value={selectedDeptByDoc[doc._id] || ""}
                        onChange={(e) => {
                          const newDept = e.target.value;
                          const predicted = normalizeLabel(review?.predicted_label);
                          const options = getLabelsForDepartment(newDept).map((label) => normalizeLabel(label));
                          const nextLabel =
                            predicted && options.includes(predicted)
                              ? predicted
                              : options[0] || "";

                          setSelectedDeptByDoc((prev) => ({ ...prev, [doc._id]: newDept }));
                          setSelectedLabelByDoc((prev) => ({ ...prev, [doc._id]: nextLabel }));
                        }}
                        className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
                      >
                        <option value="">Choose department</option>
                        {departmentOptions.map((name) => (
                          <option key={name} value={name}>
                            {name}
                            {normalizeName(review?.suggested_department) === normalizeName(name) ? " (Recommended)" : ""}
                          </option>
                        ))}
                      </select>
                      <select
                        value={selectedLabelByDoc[doc._id] || ""}
                        onChange={(e) =>
                          setSelectedLabelByDoc((prev) => ({ ...prev, [doc._id]: normalizeLabel(e.target.value) }))
                        }
                        className="px-3 py-2 border border-gray-300 rounded-lg text-sm min-w-[220px]"
                        disabled={!selectedDeptByDoc[doc._id]}
                      >
                        <option value="">
                          {selectedDeptByDoc[doc._id] ? "Choose label" : "Select department first"}
                        </option>
                        {getLabelsForDepartment(selectedDeptByDoc[doc._id]).map((label) => {
                          const normalized = normalizeLabel(label);
                          const isPredicted = normalized === normalizeLabel(review?.predicted_label);
                          return (
                            <option key={normalized} value={normalized}>
                              {prettifyLabel(normalized)}{isPredicted ? " (Predicted)" : ""}
                            </option>
                          );
                        })}
                      </select>
                      <button
                        onClick={() => onRouteDocument(doc)}
                        disabled={routingId === doc._id || dismissingId === doc._id}
                        className="px-4 py-2 rounded-lg bg-blue-600 text-white text-sm hover:bg-blue-700 disabled:opacity-60 inline-flex items-center gap-2"
                      >
                        <ArrowRight className="w-4 h-4" />
                        {routingId === doc._id ? "Routing..." : "Route"}
                      </button>
                      <button
                        onClick={async () => {
                          const confirmed = window.confirm(
                            "Remove this document from manual review queue and mark prediction as wrong?"
                          );
                          if (!confirmed) return;
                          setDismissingId(doc._id);
                          try {
                            await dismissFromQueueWithNegativeFeedback(doc);
                          } catch (err) {
                            console.error("Manual review dismiss error:", err);
                            alert("Could not remove document from manual review queue.");
                          } finally {
                            setDismissingId(null);
                          }
                        }}
                        disabled={routingId === doc._id || dismissingId === doc._id}
                        className="p-2 rounded-lg border border-gray-300 text-gray-600 hover:bg-gray-100 disabled:opacity-60"
                        title="Remove from queue (negative feedback)"
                        aria-label="Remove from queue"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
