import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { FileText, Trash2 } from "lucide-react";
import DashboardLayout from "../components/DashboardLayout";
import { getDocumentDisplayName } from "../utils/documentName";
import { getDeleteDocumentErrorMessage } from "../utils/deleteError";

interface Department {
  _id: string;
  name: string;
  color?: string;
}

interface DocumentItem {
  _id: string;
  title: string;
  original_filename?: string;
  summary?: string;
  urgency?: "high" | "medium" | "low";
  priority?: {
    priority_score?: number;
    priority_level?: "Low" | "Medium" | "High" | "Critical";
  } | null;
  createdAt?: string;
  department_id?: string | { _id?: string; name?: string; color?: string };
  routed_department?: string;
  routed_departments?: string[];
  department?: Department | string | { _id?: string; name?: string; color?: string };
}

interface MyProfile {
  department_id?: string;
}

const BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:5000";
const API_URL = `${BASE_URL}`.replace(/\/$/, "");

async function authFetch(url: string, options: RequestInit = {}) {
  const token = localStorage.getItem("token");
  const headers: Record<string, string> = {
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    "Cache-Control": "no-cache",
    Pragma: "no-cache",
    ...(options.body instanceof FormData ? {} : { "Content-Type": "application/json" }),
    ...(options.headers as Record<string, string>),
  };

  return fetch(url, {
    ...options,
    headers,
    credentials: "include",
    cache: "no-store",
  });
}

export default function DepartmentDocuments() {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [department, setDepartment] = useState<Department | null>(null);
  const [documents, setDocuments] = useState<DocumentItem[]>([]);

  const normalizeToken = (value: string) =>
    value
      .trim()
      .toLowerCase()
      .replace(/\b(department|dept)\b/g, "")
      .replace(/[^a-z0-9]+/g, " ")
      .trim();

  const canonicalDepartmentSlug = (value: string) => {
    const v = normalizeToken(value).replace(/\s+/g, " ");
    if (v === "finances") return "finance";
    if (v === "operations" || v === "operation" || v === "admin") return "operations";
    return v;
  };

  const slugMatches = (left: string, right: string) => {
    if (!left || !right) return false;
    if (left === right) return true;
    const l = left.replace(/\s+/g, "");
    const r = right.replace(/\s+/g, "");
    return l.includes(r) || r.includes(l);
  };

  const getDocumentDepartmentId = (doc: DocumentItem) => {
    const stringifyId = (value: unknown): string => {
      if (!value) return "";
      if (typeof value === "string") return value;
      if (typeof value === "object" && "_id" in (value as Record<string, unknown>)) {
        const inner = (value as Record<string, unknown>)._id;
        return inner ? String(inner) : "";
      }
      return String(value);
    };

    if (doc.department_id) return stringifyId(doc.department_id);
    if (doc.department) return stringifyId(doc.department);
    return "";
  };

  const getDocumentDepartmentName = (doc: DocumentItem) => {
    if (doc.routed_department) return doc.routed_department;
    if (doc.department && typeof doc.department === "string") return doc.department;
    if (doc.department_id && typeof doc.department_id === "string") {
      const asString = doc.department_id.trim();
      // If this is not an ObjectId-like string, treat it as a department name.
      if (!/^[a-f\d]{24}$/i.test(asString)) return asString;
    }
    if (doc.department && typeof doc.department === "object" && "name" in doc.department && doc.department.name) {
      return String(doc.department.name);
    }
    if (doc.department_id && typeof doc.department_id === "object" && doc.department_id.name) {
      return doc.department_id.name;
    }
    return "";
  };

  const getDocumentRoutedDepartments = (doc: DocumentItem) => {
    const direct = Array.isArray(doc.routed_departments) ? doc.routed_departments : [];
    const seen = new Set<string>();
    const normalized = direct
      .map((d) => String(d || "").trim())
      .filter((d) => d && d.toLowerCase() !== "manual_review")
      .filter((d) => {
        const key = d.toLowerCase();
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
    if (normalized.length > 0) return normalized;
    const single = getDocumentDepartmentName(doc);
    return single && single.toLowerCase() !== "manual_review" ? [single] : [];
  };

  const prettyDepartmentName = (value: string) => {
    const v = canonicalDepartmentSlug(value);
    if (v === "hr") return "HR";
    if (v === "finance") return "Finance";
    if (v === "legal") return "Legal";
    if (v === "operations") return "Operations";
    if (v === "procurement") return "Procurement";
    return value.charAt(0).toUpperCase() + value.slice(1);
  };

  const getPriorityColor = (level?: string) =>
    ({
      Critical: "bg-rose-100 text-rose-800 border-rose-200",
      High: "bg-orange-100 text-orange-800 border-orange-200",
      Medium: "bg-amber-100 text-amber-800 border-amber-200",
      Low: "bg-emerald-100 text-emerald-800 border-emerald-200",
    }[level || ""] || "bg-slate-100 text-slate-700 border-slate-200");
  const getDepartmentBadgeText = (doc: DocumentItem) => {
    const multi = getDocumentRoutedDepartments(doc);
    if (multi.length > 0) return multi.join(" / ");
    if (doc.department && typeof doc.department === "object" && "name" in doc.department && doc.department.name) {
      return String(doc.department.name);
    }
    return "";
  };

  const handleDeleteDocument = async (docId: string) => {
    const confirmed = window.confirm("Delete this document permanently?");
    if (!confirmed) return;

    try {
      const res = await authFetch(`${API_URL}/api/documents/${docId}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(text || "Failed to delete document");
      }

      setDocuments((prev) => prev.filter((d) => d._id !== docId));
    } catch (error) {
      console.error("Delete document error:", error);
      alert(getDeleteDocumentErrorMessage(error));
    }
  };

  useEffect(() => {
    const load = async () => {
      if (!slug) return;
      setLoading(true);
      try {
        const [profileRes, deptRes, docsRes] = await Promise.all([
          authFetch(`${API_URL}/api/profile/me`),
          authFetch(`${API_URL}/api/departments`),
          authFetch(`${API_URL}/api/documents`),
        ]);

        await profileRes.json().catch(() => ({} as MyProfile));
        const deptsJson = deptRes.ok ? await deptRes.json().catch(() => []) : [];
        const docsJson = docsRes.ok ? await docsRes.json().catch(() => []) : [];
        const departments = (Array.isArray(deptsJson) ? deptsJson : deptsJson?.data || []) as Department[];
        const docs = (Array.isArray(docsJson) ? docsJson : docsJson?.data || []) as DocumentItem[];

        const targetSlug = canonicalDepartmentSlug(slug);
        const matchedDepartment = departments.find((d) => {
          const deptSlug = canonicalDepartmentSlug(d.name);
          return slugMatches(deptSlug, targetSlug);
        });
        const matchedDepartmentId = matchedDepartment?._id ? String(matchedDepartment._id) : "";

        const filtered = (Array.isArray(docs) ? docs : []).filter(
          (doc) => {
            const docDeptId = getDocumentDepartmentId(doc);
            const docDeptName = getDocumentDepartmentName(doc);
            const docDeptSlug = canonicalDepartmentSlug(docDeptName || "");
            const routedDeptSlugs = getDocumentRoutedDepartments(doc).map((name) =>
              canonicalDepartmentSlug(name)
            );
            return (
              (matchedDepartmentId !== "" && docDeptId !== "" && docDeptId === matchedDepartmentId) ||
              (docDeptSlug !== "" && slugMatches(docDeptSlug, targetSlug)) ||
              routedDeptSlugs.some((s) => s && slugMatches(s, targetSlug))
            );
          }
        );

        if (filtered.length === 0 && Array.isArray(docs) && docs.length > 0) {
          console.log("Department filter debug:", {
            targetSlug,
            matchedDepartment,
            departmentsCount: departments.length,
            departmentNames: departments.map((d) => d.name),
            sample: docs.slice(0, 5).map((d) => ({
              id: d._id,
              routed_department: d.routed_department,
              routed_departments: d.routed_departments,
              department_id: d.department_id,
              department: d.department,
              extractedDeptId: getDocumentDepartmentId(d),
              extractedDeptName: getDocumentDepartmentName(d),
            })),
          });
        }

        setDepartment(
          matchedDepartment || {
            _id: "",
            name: prettyDepartmentName(targetSlug),
            color: "#3B82F6",
          }
        );
        setDocuments(filtered);
      } catch (error) {
        console.error("Department page load error:", error);
        const fallback = prettyDepartmentName(canonicalDepartmentSlug(slug));
        setDepartment({ _id: "", name: fallback, color: "#3B82F6" });
        setDocuments([]);
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [slug]);

  return (
    <DashboardLayout>
      <div className="min-h-screen bg-slate-50 p-4 sm:p-6 md:p-8">
        {loading ? (
          <div className="py-20 text-center text-gray-500">Loading department documents...</div>
        ) : (
          <>
            <div className="mb-8 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div>
                <h1 className="text-3xl font-bold text-gray-900">{department?.name ?? "Department"} Documents</h1>
                <p className="text-gray-600 mt-1">
                  Routed documents visible only to users in {department?.name ?? "this department"}.
                </p>
              </div>
            </div>

            {documents.length === 0 ? (
              <div className="bg-white rounded-2xl p-12 text-center shadow-sm border border-gray-100">
                <FileText className="w-10 h-10 mx-auto text-gray-300 mb-3" />
                <p className="text-gray-500">No documents available for this department.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                {documents.map((doc) => (
                  <div
                    key={doc._id}
                    onClick={() => navigate(`/document/${doc._id}`)}
                    className="group bg-white rounded-2xl p-6 border border-gray-200 shadow-sm hover:shadow-2xl hover:-translate-y-1 transition-all duration-300 cursor-pointer flex flex-col justify-between"
                  >
                    <div>
                      <div className="flex justify-between mb-4">
                        <h3 className="font-semibold text-gray-800 group-hover:text-blue-600 transition line-clamp-1">
                          {getDocumentDisplayName(doc, "Document")}
                        </h3>
                        <div className="flex items-center gap-2">
                          <span className={`px-3 py-1 rounded-full text-xs border ${getPriorityColor(doc.priority?.priority_level)}`}>
                            {doc.priority?.priority_level || "Unscored"}
                          </span>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDeleteDocument(doc._id);
                            }}
                            className="p-1 text-gray-400 hover:text-red-500 transition"
                            title="Delete document"
                            aria-label="Delete document"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                      <p className="text-sm text-gray-500 line-clamp-3 mb-4">
                        {doc.summary || "No summary available."}
                      </p>
                    </div>

                    <div className="flex justify-between text-xs text-gray-400 items-center">
                      <span>{doc.createdAt ? new Date(doc.createdAt).toLocaleDateString() : ""}</span>
                      {getDepartmentBadgeText(doc) && (
                        <span
                          className="px-3 py-1 rounded-full text-xs"
                          style={{
                            backgroundColor: `${(doc.department && typeof doc.department === "object" ? doc.department.color : "#94A3B8") || "#94A3B8"}15`,
                            color: (doc.department && typeof doc.department === "object" ? doc.department.color : "#475569") || "#475569",
                          }}
                        >
                          {getDepartmentBadgeText(doc)}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </DashboardLayout>
  );
}
