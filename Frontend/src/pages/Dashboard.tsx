// src/pages/Dashboard.tsx
import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import {
  Upload,
  RefreshCw,
  Clock,
  Users,
  DollarSign,
  Scale,
  Briefcase,
  ShoppingCart,
  Mail,
  FileText,
  Search,
  Sparkles,
  Trash2
} from "lucide-react";

import DashboardLayout from "../components/DashboardLayout";
import { useAuth } from "../contexts/AuthContext";
import { triggerTabPulse } from "../utils/tabPulse";

interface Department {
  _id: string;
  name: string;
  color: string;
}

interface DocumentWithDetails {
  _id: string;
  file_url?: string;
  python_file_id?: string;
  title: string;
  summary: string;
  urgency: "high" | "medium" | "low";
  priority?: {
    priority_score?: number;
    priority_level?: "Low" | "Medium" | "High" | "Critical";
    breakdown?: {
      sender_weight?: number;
      deadline_score?: number;
      urgency_score?: number;
      doc_type_weight?: number;
    };
    escalation?: {
      applied?: boolean;
      reason?: string;
    };
    engine_version?: string;
  } | null;
  department_id: string;
  routed_department?: string;
  uploaded_by?: string | { _id?: string };
  department?: Department;
  createdAt: string;
}

interface GmailFile {
  _id: string;
  filename: string;
  length: number;
  uploadDate: string;
  metadata?: {
    userId?: string;
    from?: string;
    subject?: string;
    messageId?: string;
    routedDepartment?: string;
    linkedDocumentId?: string;
  };
  summary?: string;
  urgency?: "high" | "medium" | "low";
  priority?: {
    priority_score?: number;
    priority_level?: "Low" | "Medium" | "High" | "Critical";
  } | null;
  detectedDepartment?: string;
}

interface IngestResponse {
  summary?: string;
  classification?: {
    label: string;
    confidence: number;
  };
  extraction?: {
    sender?: { name?: string | null; category?: string };
    document_type?: string;
    selected_deadline?: string | null;
    urgency_indicators?: string[];
    extraction_model_version?: string;
    extraction_confidence?: number;
  };
  priority?: {
    priority_score?: number;
    priority_level?: "Low" | "Medium" | "High" | "Critical";
    breakdown?: {
      sender_weight?: number;
      deadline_score?: number;
      urgency_score?: number;
      doc_type_weight?: number;
    };
    escalation?: {
      applied?: boolean;
      reason?: string;
    };
    engine_version?: string;
  };
  actions?: {
    email?: { route_to?: string };
    storage?: { route_to?: string; stored_id?: string };
  };
}

const BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:5000";
const API_URL = `${BASE_URL}`.replace(/\/$/, "");
const AI_BASE_URL = "http://127.0.0.1:8000";

export async function authFetch(url: string, options: RequestInit = {}) {
  const token = localStorage.getItem("token");

  const headers: Record<string, string> = {};

  // Only set JSON header if body is NOT FormData
  if (!(options.body instanceof FormData)) {
    headers["Content-Type"] = "application/json";
  }
  headers["Cache-Control"] = "no-cache";
  headers["Pragma"] = "no-cache";

  if (token) headers["Authorization"] = `Bearer ${token}`;

  return fetch(url, {
    ...options,
    credentials: "include",
    cache: "no-store",
    headers: {
      ...headers,
      ...(options.headers || {}),
    },
  });
}

export default function Dashboard() {
  const [documents, setDocuments] = useState<DocumentWithDetails[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [selectedDepartment, setSelectedDepartment] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [latestIntegratedSummary, setLatestIntegratedSummary] = useState("");
  const [latestSummaryTitles, setLatestSummaryTitles] = useState<string[]>([]);
  const [latestSummaryLoading, setLatestSummaryLoading] = useState(false);
  const [latestSummaryError, setLatestSummaryError] = useState<string | null>(null);

  const [summarizingId, setSummarizingId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const [gmailSummarizingId, setGmailSummarizingId] = useState<string | null>(null);

  const [gmailFiles, setGmailFiles] = useState<GmailFile[]>([]);
  const [gmailLoading, setGmailLoading] = useState(false);

  const { profile, loading: authLoading } = useAuth();
  const navigate = useNavigate();

  // ✅ Check authentication and redirect if needed
  useEffect(() => {
    if (authLoading) {
      console.log("⏳ Auth still loading...");
      return;
    }

    console.log("🔵 Dashboard - Auth check");
    console.log("🔵 Profile:", profile);
    
    if (!profile) {
      console.log("❌ No profile, redirecting to login in 500ms");
      const timer = setTimeout(() => {
        navigate("/login", { replace: true });
      }, 500);
      return () => clearTimeout(timer);
    } else {
      console.log("✅ User authenticated:", profile.email);
    }
  }, [profile, authLoading, navigate]);

  // ✅ Load data when profile is available
  useEffect(() => {
    if (profile) {
      console.log("✅ Loading dashboard data...");
      loadData();
      loadGmailFiles();
    }
  }, [profile]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [docsRes, deptRes] = await Promise.all([
        authFetch(`${API_URL}/api/documents`),
        authFetch(`${API_URL}/api/departments`),
      ]);

      const docsJson = await docsRes.json();
      const deptsJson = await deptRes.json();

      setDocuments(Array.isArray(docsJson) ? docsJson : docsJson.data || []);
      setDepartments(Array.isArray(deptsJson) ? deptsJson : deptsJson.data || []);
    } catch (error) {
      console.error("Dashboard load error:", error);
      setDocuments([]);
      setDepartments([]);
    }
    setLoading(false);
  };

  const loadLatestIntegratedSummary = async (docs: DocumentWithDetails[]) => {
    const sorted = [...docs].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
    const latestFive = sorted.slice(0, 5);
    const payloadDocuments = latestFive
      .filter((d) => (d.summary || "").trim().length > 0)
      .map((d) => ({
        title: d.title || "Untitled",
        summary: d.summary,
      }));

    setLatestSummaryTitles(latestFive.map((d) => d.title || "Untitled"));

    if (payloadDocuments.length === 0) {
      setLatestIntegratedSummary("");
      setLatestSummaryError("No summaries available in the latest 5 documents.");
      return;
    }

    setLatestSummaryLoading(true);
    setLatestSummaryError(null);
    try {
      const res = await fetch(`${AI_BASE_URL}/summarize-integrated`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ documents: payloadDocuments }),
      });

      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(`Failed to build integrated summary: ${res.status} ${text}`);
      }

      const data = await res.json();
      setLatestIntegratedSummary(data.summary || "");
    } catch (error) {
      console.error("Integrated summary error:", error);
      setLatestIntegratedSummary("");
      setLatestSummaryError("Could not generate the latest 5 documents summary.");
    } finally {
      setLatestSummaryLoading(false);
    }
  };

  useEffect(() => {
    if (!profile) return;

    const currentUserId = profile?.id || (profile as any)?._id;
    const ownedDocs = Array.isArray(documents)
      ? documents.filter((d) => {
          const uploaderId =
            typeof d.uploaded_by === "string" ? d.uploaded_by : d.uploaded_by?._id;
          return !!currentUserId && !!uploaderId && uploaderId === currentUserId;
        })
      : [];

    if (ownedDocs.length === 0) {
      setLatestIntegratedSummary("");
      setLatestSummaryTitles([]);
      setLatestSummaryError(null);
      return;
    }

    loadLatestIntegratedSummary(ownedDocs);
  }, [documents, profile]);

  const runClassifierAndSummarizer = async (file: File): Promise<IngestResponse> => {
    const aiFormData = new FormData();
    aiFormData.append("file", file);

    const aiRes = await fetch(`${AI_BASE_URL}/ingest`, {
      method: "POST",
      body: aiFormData,
    });

    if (!aiRes.ok) {
      const text = await aiRes.text().catch(() => "");
      throw new Error(`AI ingest failed: ${aiRes.status} ${text}`);
    }

    return aiRes.json();
  };

  const runClassifierAndSummarizerNoMail = async (file: File): Promise<IngestResponse> => {
    const aiFormData = new FormData();
    aiFormData.append("file", file);

    const aiRes = await fetch(`${AI_BASE_URL}/classify-summarize`, {
      method: "POST",
      body: aiFormData,
    });

    if (!aiRes.ok) {
      const text = await aiRes.text().catch(() => "");
      throw new Error(`AI classify-summarize failed: ${aiRes.status} ${text}`);
    }

    return aiRes.json();
  };

  const ensureDepartmentsLoaded = async (): Promise<Department[]> => {
    if (departments.length > 0) return departments;
    const deptRes = await authFetch(`${API_URL}/api/departments`);
    if (!deptRes.ok) return departments;
    const deptsJson = await deptRes.json();
    const normalized = Array.isArray(deptsJson) ? deptsJson : deptsJson.data || [];
    setDepartments(normalized);
    return normalized;
  };

  const getRoutedDepartmentName = (aiData: IngestResponse): string | null => {
    const routedName = aiData.actions?.email?.route_to || aiData.actions?.storage?.route_to;
    if (!routedName || routedName.toLowerCase() === "manual_review") return null;
    return routedName;
  };

  const isManualReviewRequired = (aiData: IngestResponse): boolean => {
    const routedName = (aiData.actions?.email?.route_to || aiData.actions?.storage?.route_to || "").toLowerCase();
    return routedName === "manual_review";
  };

  const getSuggestedDepartmentFromLabel = (label?: string): string | null => {
    const key = (label || "").trim().toLowerCase();
    const suggestionMap: Record<string, string> = {
      invoice: "Finance",
      contract: "Legal",
      resume: "HR",
      report: "Operations",
      purchase_order: "Procurement",
      quotation: "Procurement",
      rfq: "Procurement",
    };
    return suggestionMap[key] || null;
  };

  const getDepartmentIdByName = (
    departmentName: string | null,
    departmentList: Department[] = departments
  ): string | undefined => {
    if (!departmentName) return undefined;
    const normalize = (value: string) => {
      const v = value.trim().toLowerCase();
      if (v === "finances") return "finance";
      return v;
    };

    const wanted = normalize(departmentName);
    const exact = departmentList.find((d) => normalize(d.name) === wanted);
    if (exact) return exact._id;

    if (wanted === "operations" || wanted === "operation") {
      const admin = departmentList.find((d) => normalize(d.name) === "admin");
      if (admin) return admin._id;
    }

    return undefined;
  };

  const toDepartmentSlug = (departmentName: string) =>
    departmentName.trim().toLowerCase().replace(/\s+/g, "-");

  const pulseRouteTab = (routeName?: string | null) => {
    if (!routeName) return;
    const normalized = routeName.trim().toLowerCase();
    if (!normalized) return;
    if (normalized === "manual_review") {
      triggerTabPulse("/manual-review");
      return;
    }
    triggerTabPulse(`/department/${toDepartmentSlug(routeName)}`);
  };

  const processGmailFileWithAI = async (file: GmailFile) => {
    try {
      const res = await authFetch(`${API_URL}/api/mail/download/${file._id}`);
      if (!res.ok) throw new Error(`Download failed for ${file.filename}`);

      const blob = await res.blob();
      const uploadFile = new File([blob], file.filename, { type: blob.type });
      const aiData = await runClassifierAndSummarizerNoMail(uploadFile);
      const generatedSummary = aiData.summary || "AI could not generate a summary.";
      const routedDepartment = getRoutedDepartmentName(aiData);
      const needsManualReview = isManualReviewRequired(aiData);
      const suggestedDepartment = getSuggestedDepartmentFromLabel(aiData.classification?.label);
      const priorityLevel = aiData.priority?.priority_level || "Medium";
      const urgencyFromPriority =
        priorityLevel === "Critical" || priorityLevel === "High"
          ? "high"
          : priorityLevel === "Medium"
          ? "medium"
          : "low";
      const deptList = await ensureDepartmentsLoaded();
      const routedDepartmentId = getDepartmentIdByName(routedDepartment, deptList);

      let linkedDocumentId: string | undefined = file.metadata?.linkedDocumentId;

      if (linkedDocumentId) {
        // Keep routed gmail documents up to date when file is re-processed.
        await authFetch(`${API_URL}/api/documents/${linkedDocumentId}`, {
          method: "PUT",
          body: JSON.stringify({
            summary: generatedSummary,
            urgency: urgencyFromPriority,
            ...(needsManualReview ? { routed_department: "manual_review", department_id: null } : {}),
            ...(routedDepartment ? { routed_department: routedDepartment } : {}),
            ...(routedDepartmentId ? { department_id: routedDepartmentId } : {}),
            ...(aiData.extraction ? { extraction: aiData.extraction } : {}),
            ...(aiData.priority ? { priority: aiData.priority } : {}),
            ...(needsManualReview
              ? {
                  metadata: {
                    manual_review: {
                      required: true,
                      status: "pending",
                      suggested_department: suggestedDepartment,
                      predicted_label: aiData.classification?.label || "",
                      confidence: aiData.classification?.confidence ?? 0,
                    },
                  },
                }
              : {}),
          }),
        });
      } else {
        // Create a normal document entry for every gmail attachment so it can appear in department pages.
        const createFormData = new FormData();
        createFormData.append("file", uploadFile);
        const cleanedFilename = getDisplayFilename(file.filename);
        createFormData.append("title", cleanedFilename.replace(/\.[^/.]+$/, ""));
        createFormData.append("summary", generatedSummary);
        if (needsManualReview) createFormData.append("routed_department", "manual_review");
        if (routedDepartmentId) createFormData.append("department_id", routedDepartmentId);
        if (routedDepartment) createFormData.append("routed_department", routedDepartment);

        const createDocRes = await authFetch(`${API_URL}/api/documents`, {
          method: "POST",
          body: createFormData,
        });

        if (createDocRes.ok) {
          const createdDoc = await createDocRes.json();
          linkedDocumentId = createdDoc?._id;
          if (linkedDocumentId) {
            await authFetch(`${API_URL}/api/documents/${linkedDocumentId}`, {
              method: "PUT",
              body: JSON.stringify({
                urgency: urgencyFromPriority,
                ...(aiData.extraction ? { extraction: aiData.extraction } : {}),
                ...(aiData.priority ? { priority: aiData.priority } : {}),
                ...(needsManualReview ? { department_id: null } : {}),
                ...(needsManualReview
                  ? {
                      metadata: {
                        manual_review: {
                          required: true,
                          status: "pending",
                          suggested_department: suggestedDepartment,
                          predicted_label: aiData.classification?.label || "",
                          confidence: aiData.classification?.confidence ?? 0,
                        },
                      },
                    }
                  : {}),
              }),
            });
          }
        }
      }

      const saveRes = await authFetch(
        `${API_URL}/api/mail/generate-summary/${file._id}`,
        {
          method: "POST",
          body: JSON.stringify({
            summary: generatedSummary,
            routedDepartment,
            linkedDocumentId,
          }),
        }
      );

      if (!saveRes.ok) {
        const err = await saveRes.text().catch(() => "");
        throw new Error(`Failed to save Gmail summary: ${err}`);
      }

      pulseRouteTab(needsManualReview ? "manual_review" : routedDepartment);

      setGmailFiles((prev) =>
        prev.map((f) =>
          f._id === file._id
            ? {
                ...f,
                summary: generatedSummary,
                priority: aiData.priority || f.priority || null,
                detectedDepartment: routedDepartment || f.detectedDepartment,
                metadata: {
                  ...(f.metadata || ({} as GmailFile["metadata"])),
                  routedDepartment: routedDepartment || undefined,
                  linkedDocumentId,
                },
              }
            : f
        )
      );
    } catch (error) {
      console.error("Auto AI processing failed for Gmail file:", file._id, error);
    }
  };

// --- NEW: DIRECT UPLOAD HANDLER ---
  const handleDirectUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setLoading(true);
    const formData = new FormData();
    formData.append("file", file);
    formData.append("title", file.name.replace(/\.[^/.]+$/, "")); // Auto-title from filename
    formData.append("summary", "No summary yet. Click the here to generate one!");

    try {
      const res = await authFetch(`${API_URL}/api/documents`, {
        method: "POST",
        body: formData, // Browser sets boundary automatically
      });

      if (res.ok) {
        const uploadedDoc = await res.json();
        let routedDepartmentToNavigate: string | null = null;

        try {
          const aiData = await runClassifierAndSummarizer(file);
          const generatedSummary = aiData.summary || "AI could not generate a summary.";
          const routedDepartment = getRoutedDepartmentName(aiData);
          const needsManualReview = isManualReviewRequired(aiData);
      const suggestedDepartment = getSuggestedDepartmentFromLabel(aiData.classification?.label);
      const pythonFileId = aiData.actions?.storage?.stored_id;
      routedDepartmentToNavigate = routedDepartment;
      const deptList = await ensureDepartmentsLoaded();
      const routedDepartmentId = getDepartmentIdByName(routedDepartment, deptList);
      const priorityLevel = aiData.priority?.priority_level || "Medium";
      const urgencyFromPriority =
        priorityLevel === "Critical" || priorityLevel === "High"
          ? "high"
          : priorityLevel === "Medium"
          ? "medium"
          : "low";

          await authFetch(`${API_URL}/api/documents/${uploadedDoc._id}`, {
        method: "PUT",
        body: JSON.stringify({
          summary: generatedSummary,
          urgency: urgencyFromPriority,
          ...(needsManualReview ? { routed_department: "manual_review", department_id: null } : {}),
          ...(routedDepartmentId ? { department_id: routedDepartmentId } : {}),
          ...(routedDepartment ? { routed_department: routedDepartment } : {}),
          ...(pythonFileId ? { python_file_id: pythonFileId } : {}),
          ...(aiData.extraction ? { extraction: aiData.extraction } : {}),
          ...(aiData.priority ? { priority: aiData.priority } : {}),
          ...(needsManualReview
            ? {
                metadata: {
                  manual_review: {
                    required: true,
                    status: "pending",
                    suggested_department: suggestedDepartment,
                    predicted_label: aiData.classification?.label || "",
                    confidence: aiData.classification?.confidence ?? 0,
                  },
                },
              }
            : {}),
        }),
          });

          pulseRouteTab(needsManualReview ? "manual_review" : routedDepartment);
        } catch (aiErr) {
          console.error("Auto classifier+summarizer failed after upload:", aiErr);
        }

        await loadData(); // Refresh list immediately
        if (routedDepartmentToNavigate) {
          navigate(`/department/${toDepartmentSlug(routedDepartmentToNavigate)}`);
        }
      } else {
        alert("Upload failed");
      }
    } catch (err) {
      console.error("Upload error:", err);
    } finally {
      setLoading(false);
      if (fileInputRef.current) fileInputRef.current.value = ""; // Reset input
    }
  };

  const handleGenerateSummary = async (docId: string, fileUrl: string) => {
    setSummarizingId(docId);
    try {
      const fullUrl = fileUrl.startsWith("http") ? fileUrl : `${BASE_URL}${fileUrl}`;
      const fileRes = await fetch(fullUrl);
      if (!fileRes.ok) throw new Error("File not found on server");
      
      const blob = await fileRes.blob();
      const file = new File([blob], "doc.pdf");

      const aiFormData = new FormData();
      aiFormData.append("file", file);

      const aiRes = await fetch("http://127.0.0.1:8000/summarize", {
        method: "POST",
        body: aiFormData,
      });

      const aiData = await aiRes.json();
      const generatedSummary = aiData.summary || "AI could not generate a summary.";

      const updateRes = await authFetch(`${API_URL}/api/documents/${docId}`, {
        method: "PUT",
        body: JSON.stringify({ summary: generatedSummary }),
      });

      if (updateRes.ok) {
        setDocuments(prev => prev.map(d => d._id === docId ? { ...d, summary: generatedSummary } : d));
      }
    } catch (err) {
      console.error("AI Error:", err);
      alert("Error generating summary.");
    } finally {
      setSummarizingId(null);
    }
  };

  // --- ✅ FIXED: GMAIL AI SUMMARY HANDLER ---
 const handleGenerateGmailSummary = async (fileId: string, filename: string) => {
  setGmailSummarizingId(fileId);

  try {
    // 1️⃣ Download file from backend (GridFS)
    const res = await authFetch(`${API_URL}/api/mail/download/${fileId}`);
    if (!res.ok) throw new Error("Download failed");

    const blob = await res.blob();
    const file = new File([blob], filename, { type: blob.type });

    // 2️⃣ Send to Python AI
    const aiFormData = new FormData();
    aiFormData.append("file", file);

    const aiRes = await fetch("http://127.0.0.1:8000/summarize", {
      method: "POST",
      body: aiFormData,
    });

    if (!aiRes.ok) throw new Error("AI failed");

    const aiData = await aiRes.json();
    const generatedSummary = aiData.summary;

   
    const saveRes = await authFetch(
      `${API_URL}/api/mail/generate-summary/${fileId}`,
      {
        method: "POST",
        body: JSON.stringify({ summary: generatedSummary }),
      }
    );

    if (!saveRes.ok) {
      const err = await saveRes.text();
      throw new Error(err);
    }


    setGmailFiles(prev =>
      prev.map(f =>
        f._id === fileId ? { ...f, summary: generatedSummary } : f
      )
    );

  } catch (err: any) {
    console.error("Gmail AI Error:", err);
    alert(err.message);
  } finally {
    setGmailSummarizingId(null);
  }
};

  const loadGmailFiles = async (): Promise<GmailFile[]> => {
    setGmailLoading(true);
    try {
      const res = await authFetch(`${API_URL}/api/mail/files`, { method: "GET" });
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(`Failed to load Gmail files: ${res.status} ${text}`);
      }
      const files = await res.json();
      console.log("📧 Gmail files loaded:", files);
      const normalizedFiles = Array.isArray(files) ? files : files.data || [];
      const enrichedFiles = await Promise.all(
        normalizedFiles.map(async (file: GmailFile) => {
          const linkedDocumentId = file.metadata?.linkedDocumentId;
          if (!linkedDocumentId) return file;

          try {
            const docRes = await authFetch(`${API_URL}/api/documents/${linkedDocumentId}`);
            if (!docRes.ok) return file;
            const linkedDoc = await docRes.json();

            const detectedDepartment = (
              linkedDoc?.routed_department ||
              linkedDoc?.department?.name ||
              file.metadata?.routedDepartment ||
              ""
            ).trim();

            return {
              ...file,
              priority: linkedDoc?.priority || file.priority || null,
              detectedDepartment: detectedDepartment || file.detectedDepartment,
              metadata: {
                ...(file.metadata || {}),
                routedDepartment:
                  detectedDepartment || file.metadata?.routedDepartment || undefined,
              },
            };
          } catch {
            return file;
          }
        })
      );

      setGmailFiles(enrichedFiles);
      return enrichedFiles;
    } catch (e) {
      console.error("Gmail fetch error:", e);
      setGmailFiles([]);
      return [];
    } finally {
      setGmailLoading(false);
    }
  };

  const handleDownloadGmailFile = async (fileId: string, filename: string) => {
    try {
      const res = await authFetch(`${API_URL}/api/mail/download/${fileId}`);
      if (!res.ok) {
        alert("Failed to download file");
        return;
      }
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error("Download error:", error);
      alert("Error downloading file");
    }
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
      if (summarizingId === docId) setSummarizingId(null);
    } catch (error) {
      console.error("Delete document error:", error);
      alert("Could not delete document.");
    }
  };

  const handleDeleteGmailFile = async (fileId: string) => {
    const confirmed = window.confirm("Delete this Gmail attachment permanently?");
    if (!confirmed) return;

    try {
      const res = await authFetch(`${API_URL}/api/mail/file/${fileId}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(text || "Failed to delete Gmail file");
      }

      setGmailFiles((prev) => prev.filter((f) => f._id !== fileId));
      if (gmailSummarizingId === fileId) setGmailSummarizingId(null);
    } catch (error) {
      console.error("Delete Gmail file error:", error);
      alert("Could not delete Gmail attachment.");
    }
  };

  const getGmailDepartmentLabel = (file: GmailFile): string => {
    const routed = (file.detectedDepartment || file.metadata?.routedDepartment || "").trim();
    return routed || "Unrouted";
  };

  const getGmailPriorityScore = (file: GmailFile): string => {
    const score = file.priority?.priority_score;
    if (typeof score !== "number" || Number.isNaN(score)) return "N/A";
    return score.toFixed(1);
  };

  const getDepartmentBadgeStyle = (departmentName?: string) => {
    const normalized = (departmentName || "").trim().toLowerCase();
    const departmentMatch = departments.find(
      (d) => d.name.trim().toLowerCase() === normalized
    );

    if (departmentMatch?.color) {
      return {
        backgroundColor: `${departmentMatch.color}15`,
        color: departmentMatch.color,
      };
    }

    if (normalized === "manual_review") {
      return { backgroundColor: "#fef3c715", color: "#b45309" };
    }
    if (normalized === "unrouted") {
      return { backgroundColor: "#e2e8f015", color: "#475569" };
    }

    return { backgroundColor: "#e2e8f015", color: "#475569" };
  };

  const getPriorityColor = (level?: string) =>
    ({
      Critical: "bg-rose-100 text-rose-800 border-rose-200",
      High: "bg-orange-100 text-orange-800 border-orange-200",
      Medium: "bg-amber-100 text-amber-800 border-amber-200",
      Low: "bg-emerald-100 text-emerald-800 border-emerald-200",
    }[level || ""] || "bg-slate-100 text-slate-700 border-slate-200");

  const getDepartmentIcon = (name: string) => {
    const icons: any = { HR: Users, Finance: DollarSign, Legal: Scale, Admin: Briefcase, Procurement: ShoppingCart };
    return icons[name] || Briefcase;
  };

  const getDisplayFilename = (name: string) => name.replace(/^\d{10,}[-_]+/, "");

  // Filter documents based on search query and selected department
  const currentUserId = profile?.id || (profile as any)?._id;
  const filteredDocuments = Array.isArray(documents)
    ? documents.filter((d) => {
        const uploaderId =
          typeof d.uploaded_by === "string"
            ? d.uploaded_by
            : d.uploaded_by?._id;
        const isUploadedByCurrentUser =
          !!currentUserId && !!uploaderId && uploaderId === currentUserId;

        if (!isUploadedByCurrentUser) return false;

        const matchesSearch = searchQuery === "" || 
          d.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
          d.summary.toLowerCase().includes(searchQuery.toLowerCase()) ||
          d.department?.name.toLowerCase().includes(searchQuery.toLowerCase());
        
        const matchesDepartment = !selectedDepartment || d.department_id === selectedDepartment;
        
        return matchesSearch && matchesDepartment;
      })
    : [];
  const sortedDocuments = [...filteredDocuments].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );

  // Filter Gmail files based on search query
  const filteredGmailFiles = Array.isArray(gmailFiles)
    ? gmailFiles.filter((file) => {
        if (searchQuery === "") return true;
        const query = searchQuery.toLowerCase();
        return (
          file.filename.toLowerCase().includes(query) ||
          getDisplayFilename(file.filename).toLowerCase().includes(query) ||
          file.metadata?.subject?.toLowerCase().includes(query) ||
          file.metadata?.from?.toLowerCase().includes(query)
        );
      })
    : [];
  const sortedGmailFiles = [...filteredGmailFiles].sort(
    (a, b) => new Date(b.uploadDate).getTime() - new Date(a.uploadDate).getTime()
  );

  // Show loading while auth is initializing
  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <div className="text-xl font-semibold mb-2">Loading...</div>
          <p className="text-gray-600">Please wait</p>
        </div>
      </div>
    );
  }

  // Don't render dashboard if no profile
  if (!profile) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="text-xl font-semibold mb-2">Redirecting...</div>
        </div>
      </div>
    );
  }

  return (
  <DashboardLayout>
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50 p-8">

      {/* ================= HERO HEADER ================= */}
      <div className="mb-12">
        <div className="bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 rounded-3xl p-10 text-white shadow-2xl relative overflow-hidden">
          
          <div className="relative z-10 flex flex-col md:flex-row md:items-center md:justify-between gap-8">
            
            <div>
              <h1 className="text-4xl font-bold tracking-tight">
                Welcome back, {profile.full_name}
              </h1>
              <p className="mt-3 text-blue-100 text-lg">
                Here’s what’s happening with your documents today.
              </p>
            </div>

            {/* Search */}
            <div className="relative w-full md:w-96">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
              <input
                type="text"
                placeholder="Search documents, attachments..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-12 pr-10 py-3 rounded-xl bg-white text-gray-800 shadow-lg focus:ring-2 focus:ring-white outline-none transition"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery("")}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  ✕
                </button>
              )}
            </div>

          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12">

        {/* Total Documents */}
        <div className="bg-white rounded-2xl p-6 shadow-lg hover:shadow-xl transition">
          <div className="flex justify-between items-center">
            <div>
              <p className="text-gray-500 text-sm">Total Documents</p>
              <h2 className="text-3xl font-bold text-gray-800 mt-1">
                {documents.length}
              </h2>
            </div>
            <FileText className="w-10 h-10 text-blue-600" />
          </div>
        </div>

        {/* High Priority */}
        <div className="bg-white rounded-2xl p-6 shadow-lg hover:shadow-xl transition">
          <div className="flex justify-between items-center">
            <div>
              <p className="text-gray-500 text-sm">High Priority</p>
              <h2 className="text-3xl font-bold text-red-600 mt-1">
                {documents.filter((d) => {
                  const level = d.priority?.priority_level;
                  return d.urgency === "high" || level === "High" || level === "Critical";
                }).length}
              </h2>
            </div>
            <Clock className="w-10 h-10 text-red-500" />
          </div>
        </div>

        {/* Gmail Files */}
        <div className="bg-white rounded-2xl p-6 shadow-lg hover:shadow-xl transition">
          <div className="flex justify-between items-center">
            <div>
              <p className="text-gray-500 text-sm">Gmail Attachments</p>
              <h2 className="text-3xl font-bold text-indigo-600 mt-1">
                {gmailFiles.length}
              </h2>
            </div>
            <Mail className="w-10 h-10 text-indigo-500" />
          </div>
        </div>

      </div>

      <div className="mb-8 bg-white/90 backdrop-blur-lg p-6 rounded-2xl shadow-lg border border-white/50">
        <div className="flex items-center gap-2 mb-3">
          <Sparkles className="w-5 h-5 text-indigo-600" />
          <h2 className="text-xl font-bold text-gray-800">Latest 5 Documents Summary</h2>
        </div>
        <p className="text-xs text-gray-500 mb-3">
          {latestSummaryTitles.length > 0
            ? `Based on: ${latestSummaryTitles.join(", ")}`
            : "No recent documents available yet."}
        </p>
        {latestSummaryLoading ? (
          <p className="text-sm text-gray-600">Generating integrated summary...</p>
        ) : latestSummaryError ? (
          <p className="text-sm text-red-600">{latestSummaryError}</p>
        ) : (
          <p className="text-sm text-gray-700 whitespace-pre-line">
            {latestIntegratedSummary || "No integrated summary available."}
          </p>
        )}
      </div>

      
     {/* DOCUMENTS SECTION */}
        <div className="bg-white/80 backdrop-blur-lg p-8 rounded-3xl shadow-xl mb-12 border border-white/40">
          <div className="flex justify-between items-center mb-8">
            <h2 className="text-2xl font-bold text-gray-800 flex items-center gap-3">
              <FileText className="w-6 h-6 text-blue-600" /> Recent Documents
            </h2>
            <div className="flex gap-3">
              <button onClick={loadData} className="px-5 py-2.5 bg-gray-100 rounded-xl hover:bg-gray-200 transition flex items-center gap-2">
                <RefreshCw className="w-4 h-4" /> Refresh
              </button>
              <button 
                onClick={() => fileInputRef.current?.click()}
                className="px-5 py-2.5 bg-blue-600 text-white rounded-xl hover:bg-blue-700 shadow-md transition flex items-center gap-2"
              >
                <Upload className="w-4 h-4" /> Upload
              </button>
              <input
                ref={fileInputRef}
                type="file"
                className="hidden"
                onChange={handleDirectUpload}
              />
            </div>
          </div>

          {loading ? (
            <div className="py-16 text-center text-gray-500">Loading...</div>
          ) : sortedDocuments.length === 0 ? (
            <div className="py-16 text-center"><FileText className="w-12 h-12 mx-auto text-gray-300 mb-4" /><p className="text-gray-500 text-lg">No documents found.</p></div>
          ) : (
            <div className="h-[36.5rem] overflow-y-auto pr-1">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                {sortedDocuments.map((doc) => (
                  <div
                    key={doc._id}
                    onClick={() => navigate(`/document/${doc._id}`)}
                    className="group h-[17.5rem] bg-white rounded-2xl p-6 border border-gray-200 shadow-sm hover:shadow-2xl hover:-translate-y-1 transition-all duration-300 cursor-pointer flex flex-col justify-between"
                  >
                    <div>
                      <div className="flex justify-between mb-4">
                        <h3 className="font-semibold text-gray-800 group-hover:text-blue-600 transition line-clamp-1">{getDisplayFilename(doc.title)}</h3>
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
                      <p className="text-sm text-gray-500 line-clamp-3 mb-4">{doc.summary}</p>
                    </div>

                    <div>
                      <div className="flex justify-between text-xs text-gray-400 items-center mb-4">
                        <span>{new Date(doc.createdAt).toLocaleDateString()}</span>
                        {doc.department && (
                          <span className="px-3 py-1 rounded-full text-xs" style={{ backgroundColor: `${doc.department.color}15`, color: doc.department.color }}>
                            {doc.department.name}
                          </span>
                        )}
                      </div>

                      <div>
                        {/* AI SUMMARY BUTTON */}
                        <button
                          onClick={(e) => {
                            e.stopPropagation(); // Prevents navigating to details page
                            if (doc.file_url) handleGenerateSummary(doc._id, doc.file_url);
                          }}
                          disabled={summarizingId === doc._id}
                          className="w-full py-2 bg-blue-50 text-blue-700 rounded-xl text-xs font-bold hover:bg-blue-100 transition flex items-center justify-center gap-2 border border-blue-100"
                        >
                          {summarizingId === doc._id ? (
                            <RefreshCw className="w-3 h-3 animate-spin" />
                          ) : (
                            <Sparkles className="w-3 h-3" />
                          )}
                          {summarizingId === doc._id ? "Summarizing..." : "AI Summary"}
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      {/* ================= GMAIL SECTION ================= */}
      <div className="bg-white/80 backdrop-blur-lg p-8 rounded-3xl shadow-xl border border-white/40">
        
        <div className="flex justify-between items-center mb-8">
          <h2 className="text-2xl font-bold text-gray-800 flex items-center gap-3">
            <Mail className="w-6 h-6 text-indigo-600" />
            Gmail Attachments
          </h2>

          <div className="flex gap-3">
            <button
              onClick={loadGmailFiles}
              className="px-5 py-2.5 bg-gray-100 rounded-xl hover:bg-gray-200 transition flex items-center gap-2"
            >
              <RefreshCw className="w-4 h-4" /> Reload
            </button>

            <button
              onClick={async () => {
                setGmailLoading(true);
                try {
                  const resp = await authFetch(`${API_URL}/api/mail/fetch`, {
                    method: "POST",
                    body: JSON.stringify({}),
                  })
                  if (resp.ok) {
                    const files = await loadGmailFiles();
                    const filesNeedingSummary = files.filter(
                      (f) => !f.summary || !f.metadata?.linkedDocumentId
                    );
                    await Promise.all(filesNeedingSummary.map(processGmailFileWithAI));
                    await loadData();
                  }
                } finally {
                  setGmailLoading(false);
                }
              }}
              className="px-5 py-2.5 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 shadow-md hover:shadow-lg transition flex items-center gap-2"
            >
              <Upload className="w-4 h-4" /> Pull Mail
            </button>
          </div>
        </div>

        {gmailLoading ? (
          <div className="py-16 text-center text-gray-500">Loading...</div>
        ) : sortedGmailFiles.length === 0 ? (
          <div className="py-16 text-center">
            <Mail className="w-12 h-12 mx-auto text-gray-300 mb-4" />
            <p className="text-gray-500 text-lg">
              No Gmail attachments found.
            </p>
          </div>
        ) : (
          <div className="h-[36.5rem] overflow-y-auto pr-1">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
              {sortedGmailFiles.map((file) => (
                <div
                  key={file._id}
                  onClick={() => navigate(`/gmail-document/${file._id}`)}
                  className="group h-[17.5rem] bg-white rounded-2xl p-6 border border-gray-200 shadow-sm hover:shadow-2xl hover:-translate-y-1 transition-all duration-300 cursor-pointer flex flex-col justify-between"
                >
                  <div>
                      <div className="flex justify-between mb-4">
                        <h3 className="font-semibold text-gray-800 group-hover:text-indigo-600 transition line-clamp-1">{getDisplayFilename(file.filename)}</h3>
                        <div className="flex items-center gap-2">
                          <span className={`px-3 py-1 rounded-full text-xs border ${getPriorityColor(file.priority?.priority_level)}`}>
                            {file.priority?.priority_level || "Unscored"}
                          </span>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDeleteGmailFile(file._id);
                            }}
                            className="p-1 text-gray-400 hover:text-red-500 transition"
                            title="Delete attachment"
                            aria-label="Delete attachment"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                      {/* {file.metadata?.subject && <p className="text-sm text-gray-500 line-clamp-2 mb-4">{file.metadata.subject}</p>} */}
                      
                      {file.summary && (
                        <p className="text-sm text-gray-500 line-clamp-3 mb-4">
                          {/* <Sparkles className="w-3 h-3 inline mr-1 text-purple-500"/>  */}
                          {file.summary}
                        </p>
                      )}
                    </div>

                  <div>
                      <div className="flex justify-between text-xs text-gray-400 items-center mb-4">
                        <span>{new Date(file.uploadDate).toLocaleDateString()}</span>
                        <div className="flex items-center gap-2">
                          <span
                            className="px-3 py-1 rounded-full text-xs"
                            style={getDepartmentBadgeStyle(getGmailDepartmentLabel(file))}
                          >
                            {getGmailDepartmentLabel(file)}
                          </span>
                        </div>
                      </div>

                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleGenerateGmailSummary(file._id, file.filename);
                        }}
                        disabled={gmailSummarizingId === file._id}
                        className="w-full py-2 bg-indigo-50 text-indigo-700 rounded-xl text-xs font-bold hover:bg-indigo-100 transition flex items-center justify-center gap-2 border border-indigo-100"
                      >
                        {gmailSummarizingId === file._id ? (
                          <RefreshCw className="w-3 h-3 animate-spin" />
                        ) : (
                          <Sparkles className="w-3 h-3" />
                        )}
                        {gmailSummarizingId === file._id ? "Summarizing..." : "AI Summary"}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}
