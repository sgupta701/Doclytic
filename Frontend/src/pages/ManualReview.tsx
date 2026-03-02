import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowRight, FileText } from "lucide-react";
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
  confidence?: number;
  decided_department?: string;
}

interface DocumentItem {
  _id: string;
  title: string;
  summary?: string;
  createdAt?: string;
  routed_department?: string;
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
  const [documents, setDocuments] = useState<DocumentItem[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [selectedDeptByDoc, setSelectedDeptByDoc] = useState<Record<string, string>>({});

  const normalizeName = (value?: string) =>
    (value || "").trim().toLowerCase().replace(/\s+/g, " ");
  const toDepartmentSlug = (departmentName: string) =>
    departmentName.trim().toLowerCase().replace(/\s+/g, "-");

  const getDeptIdByName = (name?: string | null, sourceDepartments: Department[] = departments) => {
    const wanted = normalizeName(name || "");
    if (!wanted) return "";
    const match = sourceDepartments.find((d) => normalizeName(d.name) === wanted);
    return match?._id || "";
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

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const [docsRes, deptsRes] = await Promise.all([
          authFetch(`${API_URL}/api/documents`),
          authFetch(`${API_URL}/api/departments`),
        ]);

        const docsJson = docsRes.ok ? await docsRes.json().catch(() => []) : [];
        const deptsJson = deptsRes.ok ? await deptsRes.json().catch(() => []) : [];
        const docs = (Array.isArray(docsJson) ? docsJson : docsJson?.data || []) as DocumentItem[];
        const depts = (Array.isArray(deptsJson) ? deptsJson : deptsJson?.data || []) as Department[];

        setDocuments(docs);
        setDepartments(depts);

        const defaults: Record<string, string> = {};
        docs.forEach((doc) => {
          const suggested = doc.metadata?.manual_review?.suggested_department || "";
          const deptId = getDeptIdByName(suggested, depts);
          if (deptId) defaults[doc._id] = deptId;
        });
        setSelectedDeptByDoc(defaults);
      } catch (error) {
        console.error("Manual review load error:", error);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const onRouteDocument = async (doc: DocumentItem) => {
    const selectedDepartmentId = selectedDeptByDoc[doc._id];
    if (!selectedDepartmentId) {
      alert("Select a department first.");
      return;
    }

    const chosen = departments.find((d) => d._id === selectedDepartmentId);
    if (!chosen) {
      alert("Invalid department selection.");
      return;
    }

    setRoutingId(doc._id);
    try {
      const existingMetadata = doc.metadata || {};
      const existingManualReview = existingMetadata.manual_review || {};

      const res = await authFetch(`${API_URL}/api/documents/${doc._id}`, {
        method: "PUT",
        body: JSON.stringify({
          department_id: chosen._id,
          routed_department: chosen.name,
          metadata: {
            ...existingMetadata,
            manual_review: {
              ...existingManualReview,
              required: false,
              status: "resolved",
              decided_department: chosen.name,
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
            route_to: chosen.name,
            note: "routed_by_manual_review",
          }),
        });

        if (!pyRes.ok) {
          const pyText = await pyRes.text().catch(() => "");
          throw new Error(pyText || "Failed to sync Python GridFS metadata");
        }
      }

      triggerTabPulse(`/department/${toDepartmentSlug(chosen.name)}`);

      setDocuments((prev) => prev.filter((d) => d._id !== doc._id));
    } catch (error) {
      console.error("Manual route error:", error);
      alert("Could not route document.");
    } finally {
      setRoutingId(null);
    }
  };

  return (
    <DashboardLayout>
      <div className="min-h-screen bg-slate-50 p-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">Manual Review</h1>
          <p className="text-gray-600 mt-1">Low-confidence documents are parked here until a user confirms the final department.</p>
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
                        onChange={(e) => setSelectedDeptByDoc((prev) => ({ ...prev, [doc._id]: e.target.value }))}
                        className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
                      >
                        <option value="">Choose department</option>
                        {departments.map((d) => (
                          <option key={d._id} value={d._id}>
                            {d.name}
                          </option>
                        ))}
                      </select>
                      <button
                        onClick={() => onRouteDocument(doc)}
                        disabled={routingId === doc._id}
                        className="px-4 py-2 rounded-lg bg-blue-600 text-white text-sm hover:bg-blue-700 disabled:opacity-60 inline-flex items-center gap-2"
                      >
                        <ArrowRight className="w-4 h-4" />
                        {routingId === doc._id ? "Routing..." : "Route"}
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
