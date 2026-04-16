// src/pages/Dashboard.tsx
import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import {
  Upload,
  RefreshCw,
  Clock,
  Mail,
  FileText,
  Search,
  Sparkles,
  Trash2
} from "lucide-react";

import DashboardLayout from "../components/DashboardLayout";
import { useAuth } from "../contexts/AuthContext";
import { getAttachmentDisplayName, getDocumentDisplayName, getSearchableDisplayName } from "../utils/documentName";
import { getDeleteDocumentErrorMessage } from "../utils/deleteError";
import { triggerTabPulse } from "../utils/tabPulse";
import { fetchIntegratedSummary } from "../api/summarizerAPI";

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
  original_filename?: string;
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
  routed_departments?: string[];
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
    originalFilename?: string;
    priorityScore?: number;
    priorityLevel?: "Low" | "Medium" | "High" | "Critical";
  };
  summary?: string;
  urgency?: "high" | "medium" | "low";
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
  const [selectedDepartment] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [latestIntegratedSummary, setLatestIntegratedSummary] = useState("");
  const [, setLatestSummaryTitles] = useState<string[]>([]);
  const [latestSummaryDocs, setLatestSummaryDocs] = useState<{_id: string, title: string, displayName: string}[]>([]);
  const [latestSummaryLoading, setLatestSummaryLoading] = useState(false);
  const [latestSummaryError, setLatestSummaryError] = useState<string | null>(null);

  const [summarizingId, setSummarizingId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const [gmailSummarizingId, setGmailSummarizingId] = useState<string | null>(null);

  const [gmailFiles, setGmailFiles] = useState<GmailFile[]>([]);
  const [gmailLoading, setGmailLoading] = useState(false);

  const { profile, loading: authLoading } = useAuth();
  const navigate = useNavigate();

  const [summaryMode, setSummaryMode] = useState<"recent" | "priority">("recent");
  const lastSummarizedIdsRef = useRef<string>("");

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

  useEffect(() => {
    if (profile) {
      console.log("✅ Loading dashboard data...");
      loadData();
      loadGmailFiles();
    }
  }, [profile]);

  useEffect(() => {
    if (!loading && documents.length > 0) {
      const docMissingSummary = documents.find(
        (d) => (!d.summary || d.summary.trim() === "" || d.summary.includes("No summary available")) && d.file_url
      );

      if (docMissingSummary && !summarizingId) {
        handleGenerateSummary(docMissingSummary._id, docMissingSummary.file_url!);
      }
    }
  }, [documents, loading, summarizingId]);

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

    const currentIds = docs.map(d => d._id).join(",");
    if (currentIds === lastSummarizedIdsRef.current) {
      return; 
    }

    const sorted = [...docs].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );

    const latestFour = sorted.slice(0, 4);

    setLatestSummaryTitles(latestFour.map((d) => getDocumentDisplayName(d, "Untitled")));
    setLatestSummaryDocs(
      latestFour.map((d) => ({
        _id: d._id,
        title: d.title || "Untitled",
        displayName: getDocumentDisplayName(d, "Untitled"),
      }))
    );

    const payloadDocuments = latestFour
      .filter((d) => (d.summary || "").trim().length > 0)
      .map((d) => ({
        _id: d._id,
        title: getDocumentDisplayName(d, "Untitled"),
        summary: d.summary,
      }));

    if (payloadDocuments.length === 0) {
      setLatestIntegratedSummary("");
      setLatestSummaryError("No summaries available in the latest 4 documents.");
      return;
    }

    setLatestSummaryLoading(true);
    setLatestSummaryError(null);
    try {
      const data = await fetchIntegratedSummary(payloadDocuments);
      setLatestIntegratedSummary(data.summary || "");
    } catch (error) {
      console.error("Integrated summary error:", error);
      setLatestIntegratedSummary("");
      setLatestSummaryError("Could not generate the latest 4 documents summary.");
    } finally {
      setLatestSummaryLoading(false);
    }
  };

  useEffect(() => {
  if (!profile || documents.length === 0) return;

  const currentUserId = profile?.id || (profile as any)?._id;
  const ownedDocs = documents.filter((d) => {
    const uploaderId = typeof d.uploaded_by === "string" ? d.uploaded_by : d.uploaded_by?._id;
    return uploaderId === currentUserId;
  });

  let docsToProcess = [...ownedDocs];

  if (summaryMode === "priority") {
    docsToProcess.sort((a, b) => (b.priority?.priority_score || 0) - (a.priority?.priority_score || 0));
  } else {
    // Default: Sort by newest date
    docsToProcess.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  const targetDocs = docsToProcess.slice(0, 4);

  const currentIds = targetDocs.map(d => d._id).join(",") + summaryMode;
    if (currentIds === lastSummarizedIdsRef.current) {
      return; 
    }
    
    lastSummarizedIdsRef.current = currentIds;

  loadLatestIntegratedSummary(targetDocs);
}, [documents, profile, summaryMode]);

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

      const attachmentName = getAttachmentDisplayName(file, "Attachment");
      const attachmentStem = attachmentName.replace(/\.[^/.]+$/, "");
      const blob = await res.blob();
      const uploadFile = new File([blob], file.filename, { type: blob.type });
      const aiData = await runClassifierAndSummarizerNoMail(uploadFile);
      const generatedSummary = aiData.summary || "AI could not generate a summary.";
      const routedDepartment = getRoutedDepartmentName(aiData);
      const needsManualReview = isManualReviewRequired(aiData);
      const suggestedDepartment = getSuggestedDepartmentFromLabel(aiData.classification?.label);
      const priorityLevel = aiData.priority?.priority_level || "Medium";
      const priorityScore = aiData.priority?.priority_score;
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
            original_filename: attachmentName,
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
        createFormData.append("title", attachmentStem);
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
                original_filename: attachmentName,
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
            priorityScore,
            priorityLevel,
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
                metadata: {
                  ...(f.metadata || ({} as GmailFile["metadata"])),
                  routedDepartment: routedDepartment || undefined,
                  linkedDocumentId,
                  priorityScore,
                  priorityLevel,
                },
              }
            : f
        )
      );
    } catch (error) {
      console.error("Auto AI processing failed for Gmail file:", file._id, error);
    }
  };

  const handleDirectUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setLoading(true);
    const formData = new FormData();
    formData.append("file", file);
    formData.append("title", file.name.replace(/\.[^/.]+$/, "")); 

    formData.append("summary", "Processing your document..."); 

    try {
      const res = await authFetch(`${API_URL}/api/documents`, {
        method: "POST",
        body: formData, 
      });

      if (res.ok) {
        const uploadedDoc = await res.json();

        await loadData(); 

        (async () => {
          try {
            const aiData = await runClassifierAndSummarizer(file);
            const generatedSummary = aiData.summary || "AI could not generate a summary.";
            const routedDepartment = getRoutedDepartmentName(aiData);
            const needsManualReview = isManualReviewRequired(aiData);
            const suggestedDepartment = getSuggestedDepartmentFromLabel(aiData.classification?.label);
            const pythonFileId = aiData.actions?.storage?.stored_id;
            
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
            
            await loadData(); 
          } catch (aiErr) {
            console.error("Auto classifier+summarizer failed after upload:", aiErr);
          }
        })();

      } else {
        alert("Upload failed");
      }
    } catch (err) {
      console.error("Upload error:", err);
    } finally {
      // 4. INSTANT UNLOCK: Drop the loading state before the AI finishes
      setLoading(false);
      if (fileInputRef.current) fileInputRef.current.value = ""; 
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
      setGmailFiles(normalizedFiles);
      return normalizedFiles;
    } catch (e) {
      console.error("Gmail fetch error:", e);
      setGmailFiles([]);
      return [];
    } finally {
      setGmailLoading(false);
    }
  };

  const handleGenerateSummary = async (docId: string, fileUrl: string) => {
    if (summarizingId === docId) return;
    setSummarizingId(docId);
    try {
      const fullUrl = fileUrl.startsWith("http") ? fileUrl : `${BASE_URL}${fileUrl}`;
      const fileRes = await fetch(fullUrl);
      if (!fileRes.ok) throw new Error("File not found on server");
      
      const blob = await fileRes.blob();
      const file = new File([blob], "doc.pdf");

      const aiFormData = new FormData();
      aiFormData.append("file", file);

      const aiRes = await fetch(`${AI_BASE_URL}/summarize`, {
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
      console.error("AI Auto-Summary Error:", err);
    } finally {
      setSummarizingId(null);
    }
  };

  const handleDeleteDocument = async (docId: string) => {
    const confirmed = window.confirm("Delete this document permanently?");
    if (!confirmed) return;

    // Grab the document BEFORE we delete it from state so we can get its Python ID
    const docToDelete = documents.find((d) => d._id === docId);

    try {
      const res = await authFetch(`${API_URL}/api/documents/${docId}`, {
        method: "DELETE",
      });

      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(text || "Failed to delete document");
      }

      // --- NEW FEATURE 1: Sync Delete to Python Calendar ---
      if (docToDelete?.python_file_id) {
        fetch(`http://127.0.0.1:8000/documents/${docToDelete.python_file_id}`, {
          method: "DELETE",
        }).catch(err => console.error("Failed to sync delete with Calendar:", err));
      }
      // ----------------------------------------------------

      setDocuments((prev) => prev.filter((d) => d._id !== docId));
      if (summarizingId === docId) setSummarizingId(null);
    } catch (error) {
      console.error("Delete document error:", error);
      alert(getDeleteDocumentErrorMessage(error));
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

  const getUrgencyColor = (u: string) =>
    ({
      critical: "bg-rose-100 text-rose-800 border-rose-200",
      high: "bg-red-100 text-red-800 border-red-200",
      medium: "bg-yellow-100 text-yellow-800 border-yellow-200",
      low: "bg-green-100 text-green-800 border-green-200",
      pending: "bg-slate-100 text-slate-700 border-slate-200",
    }[u] || "");

  const getPriorityLevelFromScore = (score?: number): "Low" | "Medium" | "High" | "Critical" | null => {
    if (typeof score !== "number" || Number.isNaN(score)) return null;
    if (score >= 80) return "Critical";
    if (score >= 60) return "High";
    if (score >= 35) return "Medium";
    return "Low";
  };

  const getGmailPriorityInfo = (file: GmailFile) => {
    const linkedDocumentId = file.metadata?.linkedDocumentId;
    const linkedDocument = linkedDocumentId
      ? documents.find((doc) => doc._id === linkedDocumentId)
      : undefined;
    const linkedPriority = linkedDocument?.priority;
    const score = file.metadata?.priorityScore ?? linkedPriority?.priority_score;
    const level = file.metadata?.priorityLevel ?? linkedPriority?.priority_level ?? getPriorityLevelFromScore(score);

    return {
      level,
      score,
      displayLabel: level || "Pending",
    };
  };

  const getGmailDepartmentLabel = (file: GmailFile): string => {
    const routed = (file.metadata?.routedDepartment || "").trim();
    return routed || "Unrouted";
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

  const getDocumentDepartmentNames = (doc: DocumentWithDetails): string[] => {
    const seen = new Set<string>();
    const names: string[] = [];

    const push = (value?: string | null) => {
      const trimmed = String(value || "").trim();
      if (!trimmed) return;
      const key = trimmed.toLowerCase();
      if (key === "manual_review") return;
      if (seen.has(key)) return;
      seen.add(key);
      names.push(trimmed);
    };

    if (Array.isArray(doc.routed_departments)) {
      doc.routed_departments.forEach(push);
    }

    push(doc.routed_department);
    push(doc.department?.name);

    return names;
  };

  const getDocumentDepartmentLabel = (doc: DocumentWithDetails): string => {
    const departmentNames = getDocumentDepartmentNames(doc);
    if (departmentNames.length > 0) return departmentNames.join(" / ");
    return "Unrouted";
  };

  const getPriorityColor = (level?: string) =>
    ({
      Critical: "bg-rose-100 text-rose-800 border-rose-200",
      High: "bg-orange-100 text-orange-800 border-orange-200",
      Medium: "bg-amber-100 text-amber-800 border-amber-200",
      Low: "bg-emerald-100 text-emerald-800 border-emerald-200",
    }[level || ""] || "bg-slate-100 text-slate-700 border-slate-200");

  const normalizedSearchQuery = searchQuery.trim().toLowerCase();

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

        const searchableTitle = (d.title || "").toLowerCase();
        const searchableSummary = (d.summary || "").toLowerCase();
        const searchableDepartment = getDocumentDepartmentLabel(d).toLowerCase();

        const matchesSearch =
          normalizedSearchQuery === "" ||
          searchableTitle.includes(normalizedSearchQuery) ||
          searchableSummary.includes(normalizedSearchQuery) ||
          searchableDepartment.includes(normalizedSearchQuery);
        
        const matchesDepartment = !selectedDepartment || d.department_id === selectedDepartment;

        if (normalizedSearchQuery === "") {
          return isUploadedByCurrentUser && matchesDepartment;
        }

        return matchesSearch && matchesDepartment;
      })
    : [];

  // Filter Gmail files based on search query
  const filteredGmailFiles = Array.isArray(gmailFiles)
    ? gmailFiles.filter((file) => {
        if (normalizedSearchQuery === "") return true;

        const searchableFilename = getSearchableDisplayName(
          file.metadata?.originalFilename || file.filename || ""
        ).toLowerCase();
        const searchableSubject = (file.metadata?.subject || "").toLowerCase();
        const searchableSender = (file.metadata?.from || "").toLowerCase();
        const searchableSummary = (file.summary || "").toLowerCase();

        return (
          searchableFilename.includes(normalizedSearchQuery) ||
          searchableSubject.includes(normalizedSearchQuery) ||
          searchableSender.includes(normalizedSearchQuery) ||
          searchableSummary.includes(normalizedSearchQuery)
        );
      })
    : [];

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
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(59,130,246,0.12),_transparent_30%),radial-gradient(circle_at_top_right,_rgba(16,185,129,0.08),_transparent_24%),linear-gradient(180deg,_#f8fbff_0%,_#f8fafc_42%,_#eef4ff_100%)] dark:bg-[radial-gradient(circle_at_top_left,_rgba(59,130,246,0.15),_transparent_35%),radial-gradient(circle_at_top_right,_rgba(16,185,129,0.1),_transparent_30%),linear-gradient(180deg,_#0f172a_0%,_#0a0f1e_42%,_#020617_100%)] px-2 py-3 sm:px-3 sm:py-4 lg:px-4">

      {/* ================= HERO HEADER ================= */}
      <div className="mb-6 sm:mb-8">
        <div className="relative overflow-hidden rounded-[1.75rem] border border-blue-200/60 dark:border-blue-800/60 bg-[linear-gradient(135deg,_#0f4c81_0%,_#1d6fa5_45%,_#59a5d8_100%)] dark:bg-[linear-gradient(135deg,_#082f49_0%,_#0c4a6e_45%,_#075985_100%)] p-5 text-white dark:text-gray-950 shadow-[0_24px_60px_-28px_rgba(15,76,129,0.45)] sm:p-7 lg:p-8">
          <div className="absolute -right-12 top-0 h-40 w-40 rounded-full bg-white/10  blur-2xl sm:h-56 sm:w-56" />
          <div className="absolute -left-8 bottom-0 h-28 w-28 rounded-full bg-cyan-300/10 blur-2xl sm:h-40 sm:w-40" />
          
          <div className="relative z-10 flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-blue-100/90 dark:text-slate-900">
                Document Command Center
              </p>
              <h1 className="mt-2 text-2xl font-bold tracking-tight sm:text-3xl lg:text-4xl">
                Welcome back, {profile.full_name}
              </h1>
              <p className="mt-3 max-w-2xl text-sm text-blue-100 dark:text-slate-900 sm:text-base lg:text-lg">
                Here&apos;s what&apos;s happening with your documents, priorities, and Gmail attachments today.
              </p>
            </div>

            {/* Search */}
            <div className="relative w-full lg:max-w-md">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400 dark:text-slate-500" />
              <input
                type="text"
                placeholder="Search documents, attachments..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full rounded-2xl border border-white/40 dark:border-slate-900/40 bg-white/95 dark:bg-gray-900 py-3 pl-12 pr-10 text-sm text-slate-800 dark:text-slate-300 shadow-lg outline-none transition focus:border-white dark:focus:border-slate-800 focus:ring-2 focus:ring-white/70 sm:text-base"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery("")}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                >
                  ✕
                </button>
              )}
            </div>

          </div>
        </div>
      </div>

      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3 sm:mb-8">

        {/* Total Documents */}
        <div className="rounded-[1.5rem] border border-white/60 dark:border-gray-950/60 bg-white/90 dark:bg-gray-950/90 p-5 shadow-[0_18px_40px_-28px_rgba(15,23,42,0.35)] transition hover:-translate-y-0.5 hover:shadow-[0_24px_48px_-28px_rgba(37,99,235,0.25)]">
          <div className="flex justify-between items-center">
            <div>
              <p className="text-sm text-slate-500">Total Documents</p>
              <h2 className="mt-1 text-3xl font-bold text-slate-800 dark:text-slate-200">
                {documents.length}
              </h2>
            </div>
            <div className="rounded-2xl bg-blue-50 dark:bg-blue-950/50 p-3 text-blue-600 dark:text-blue-400">
              <FileText className="h-7 w-7" />
            </div>
          </div>
        </div>

        {/* High Priority */}
        <div className="rounded-[1.5rem] border border-white/60 dark:border-gray-950/60 bg-white/90 dark:bg-gray-950/90 p-5 shadow-[0_18px_40px_-28px_rgba(15,23,42,0.35)] transition hover:-translate-y-0.5 hover:shadow-[0_24px_48px_-28px_rgba(239,68,68,0.25)]">
          <div className="flex justify-between items-center">
            <div>
              <p className="text-sm text-slate-500">High Priority</p>
              <h2 className="mt-1 text-3xl font-bold text-red-600 dark:text-red-400">
                {documents.filter((d) => {
                  const level = d.priority?.priority_level;
                  return d.urgency === "high" || level === "High" || level === "Critical";
                }).length}
              </h2>
            </div>
            <div className="rounded-2xl bg-red-50 dark:bg-red-950/50 p-3 text-red-500 dark:text-red-400">
              <Clock className="h-7 w-7" />
            </div>
          </div>
        </div>

        {/* Gmail Files */}
        <div className="rounded-[1.5rem] border border-white/60 dark:border-gray-950/60 bg-white/90 dark:bg-gray-950/90 p-5 shadow-[0_18px_40px_-28px_rgba(15,23,42,0.35)] transition hover:-translate-y-0.5 hover:shadow-[0_24px_48px_-28px_rgba(79,70,229,0.25)] sm:col-span-2 xl:col-span-1">
          <div className="flex justify-between items-center">
            <div>
              <p className="text-sm text-slate-500">Gmail Attachments</p>
              <h2 className="mt-1 text-3xl font-bold text-indigo-600 dark:text-indigo-400">
                {gmailFiles.length}
              </h2>
            </div>
            <div className="rounded-2xl bg-indigo-50 dark:bg-indigo-950/50 p-3 text-indigo-500 dark:text-indigo-400">
              <Mail className="h-7 w-7" />
            </div>
          </div>
        </div>

      </div>

      <div className="mb-6 rounded-[1.5rem] border border-white/60 dark:border-gray-950/60 bg-white/90 dark:bg-gray-950/90 p-5 shadow-[0_18px_40px_-28px_rgba(15,23,42,0.35)] backdrop-blur-lg sm:mb-8 sm:p-6">
  <div className="flex items-center justify-between mb-3">
    <div className="flex items-center gap-2">
      <Sparkles className="w-5 h-5 text-indigo-600" />
      <h2 className="text-lg font-bold text-gray-800 dark:text-gray-200 sm:text-xl">
        {summaryMode === "recent" ? "Latest Document Insights" : "High Priority Insights"}
      </h2>
    </div>
    
    {/* NEW TOGGLE BUTTON */}
    <button 
      onClick={() => setSummaryMode(summaryMode === "recent" ? "priority" : "recent")}
      className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-indigo-50 dark:bg-indigo-950 dark:text-indigo-400 text-indigo-600 hover:bg-indigo-100 transition-colors border border-indigo-100 dark:border-indigo-900"
    >
      {summaryMode === "recent" ? "Switch to High Priority" : "Switch to Most Recent"}
    </button>
  </div>
  
  <p className="text-xs text-gray-500 mb-3">
    {summaryMode === "recent" 
      ? "Synthesized from your 4 most recent documents" 
      : "Synthesized from your 4 highest priority documents"}
  </p>


        {latestSummaryLoading ? (
          <div className="flex items-center gap-2">
            <RefreshCw className="w-3 h-3 animate-spin text-gray-400" />
            <p className="text-sm text-gray-600">Analyzing latest activity...</p>
          </div>
        ) : latestSummaryError ? (
          <p className="text-sm text-red-600">{latestSummaryError}</p>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-line">
              {latestIntegratedSummary || "No integrated summary available."}
            </p>
            
            {/* THIS ADDS THE LINKS AT THE BOTTOM */}
            {latestIntegratedSummary && latestSummaryDocs.length > 0 && (
              <div className="flex items-center gap-3 pt-3 mt-2 border-t border-indigo-50/50 dark:border-indigo-950/50">
                <span className="text-xs text-gray-500 font-medium">Sources:</span>
                {latestSummaryDocs.map((doc) => (
                  <button
                    key={doc._id}
                    onClick={() => navigate(`/document/${doc._id}`)}
                    title={`Open: ${doc.displayName}`}
                    className="rounded-lg bg-indigo-50 px-2 py-1 text-sm text-indigo-600 transition hover:scale-105 hover:bg-indigo-100"
                  >
                    🔗
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      
     {/* DOCUMENTS SECTION */}
        <div className="mb-8 rounded-[1.75rem] border border-white/40 dark:border-gray-950/60 bg-white/85 dark:bg-gray-950/85 p-5 shadow-[0_20px_48px_-30px_rgba(15,23,42,0.35)] backdrop-blur-lg sm:p-6 lg:p-8">
          <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <h2 className="flex items-center gap-3 text-xl font-bold text-gray-800 dark:text-gray-200 sm:text-2xl">
              <FileText className="w-6 h-6 text-blue-600" /> Recent Documents
            </h2>
            <div className="flex flex-col sm:flex-row gap-3">
              <button onClick={loadData} className="flex w-full items-center justify-center gap-2 rounded-xl bg-gray-100 dark:bg-gray-900 px-5 py-2.5 transition hover:bg-gray-200 dark:hover:bg-gray-800 dark:text-white sm:w-auto">
                <RefreshCw className="w-4 h-4" /> Refresh
              </button>
              <button 
                onClick={() => fileInputRef.current?.click()}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-slate-900 dark:bg-slate-400 px-5 py-2.5 text-white dark:text-gray-800 shadow-md transition hover:bg-slate-800 dark:hover:bg-slate-700 sm:w-auto"
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
          ) : filteredDocuments.length === 0 ? (
            <div className="py-16 text-center">
              <FileText className="w-12 h-12 mx-auto text-gray-300 dark:text-gray-700 mb-4" />
              <p className="text-gray-500 text-lg">No documents found.</p>
            </div>
          ) : (
            <div className="max-h-[calc(220px*2+1.25rem)] overflow-y-auto pr-2">
              <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
              {filteredDocuments.map((doc) => (
              <div key={doc._id} className="relative h-[220px] w-full"> 
                <div
                  onClick={() => navigate(`/document/${doc._id}`)}
                  className="group absolute top-0 left-0 w-full h-full bg-white rounded-2xl p-5 border border-gray-200 shadow-sm 
                            transition-all duration-300 ease-in-out cursor-pointer flex flex-col
                            hover:w-[120%] hover:-left-[10%] hover:h-fit hover:min-h-[110%] 
                            hover:scale-105 hover:z-[100] hover:shadow-2xl hover:border-blue-200"
                >
                  <div className="flex flex-col h-full">
                    <div className="flex justify-between items-start mb-3">
                      <h3 className="font-bold text-gray-800 group-hover:text-blue-600 transition line-clamp-1 pr-2">
                          {getDocumentDisplayName(doc, "Document")}
                      </h3>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold border uppercase ${getPriorityColor(doc.priority?.priority_level)}`}>
                          {doc.priority?.priority_level || "Low"}
                        </span>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteDocument(doc._id);
                          }}
                          className="p-1 text-gray-400 hover:text-red-500 transition-colors"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>

                    <div className="flex-grow overflow-hidden group-hover:overflow-visible">
                      <div className="flex items-center gap-1 mb-1.5">
                        <Sparkles className="w-3 h-3 text-blue-500" />
                        <span className="text-[9px] font-bold text-gray-400 uppercase tracking-widest">Quick Extract</span>
                      </div>

                      <p className="text-sm text-gray-500 line-clamp-3 group-hover:line-clamp-none group-hover:text-xs transition-all duration-300 leading-relaxed">
                        {doc.summary}
                      </p>
                    </div>

                    <div className="mt-2 pt-3 border-t border-gray-50 flex justify-between items-center text-[10px] text-gray-400 shrink-0">
                      <span className="flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {new Date(doc.createdAt).toLocaleDateString()}
                      </span>
                      {(doc.department || doc.routed_department || (doc.routed_departments?.length ?? 0) > 0) && (
                        <span
                          className="px-2 py-0.5 rounded-md font-medium"
                          style={{
                            backgroundColor: `${doc.department?.color || "#475569"}15`,
                            color: doc.department?.color || "#475569",
                          }}
                        >
                          {getDocumentDepartmentLabel(doc)}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ))}
              </div>
            </div>
          )}
        </div>
      {/* ================= GMAIL SECTION ================= */}
      <div className="rounded-[1.75rem] border border-white/40 dark:border-gray-950/40 dark:bg-gray-950/85 bg-white/85 p-5 shadow-[0_20px_48px_-30px_rgba(15,23,42,0.35)] backdrop-blur-lg sm:p-6 lg:p-8">
        
        <div className="flex flex-col gap-4 lg:flex-row lg:justify-between lg:items-center mb-8">
          <h2 className="text-2xl font-bold text-gray-800 dark:text-gray-200 flex items-center gap-3">
            <Mail className="w-6 h-6 text-indigo-600" />
            Gmail Attachments
          </h2>

          <div className="flex flex-col sm:flex-row gap-3">
            <button
              onClick={loadGmailFiles}
              className="flex w-full items-center justify-center gap-2 rounded-xl dark:text-white bg-gray-100 dark:bg-gray-900 px-5 py-2.5 transition hover:bg-gray-200 dark:hover:bg-gray-800 sm:w-auto"
            >
              <RefreshCw className="w-4 h-4 dark:text-white" /> Reload
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
                  } else if (resp.status === 401) {
                    const data = await resp.json().catch(() => ({}));
                    if (data?.code === "GMAIL_REAUTH_REQUIRED") {
                      alert("Your Gmail connection expired. Please sign in with Google again.");
                      const authRes = await fetch(`${API_URL}/api/mail/google`, {
                        credentials: "include",
                      });
                      const authData = await authRes.json().catch(() => ({}));
                      if (authData?.authUrl) {
                        window.location.href = authData.authUrl;
                        return;
                      }
                    }
                  } else {
                    const data = await resp.json().catch(() => ({}));
                    alert(data?.error || data?.message || "Failed to fetch Gmail attachments.");
                  }
                } finally {
                  setGmailLoading(false);
                }
              }}
              className="flex items-center gap-2 rounded-xl bg-slate-900 dark:bg-slate-400 px-5 py-2.5 text-white dark:text-gray-800 shadow-md transition hover:bg-slate-800 dark:hover:bg-slate-700 hover:shadow-lg"
            >
              <Upload className="w-4 h-4" /> Pull Mail
            </button>
          </div>
        </div>

        {gmailLoading ? (
          <div className="py-16 text-center text-gray-500">Loading...</div>
        ) : filteredGmailFiles.length === 0 ? (
          <div className="py-16 text-center">
            <Mail className="w-12 h-12 mx-auto text-gray-300 dark:text-gray-700 mb-4" />
            <p className="text-gray-500 text-lg">
              No Gmail attachments found.
            </p>
          </div>
        ) : (
          <div className="max-h-[calc(220px*2+1.25rem)] overflow-y-auto pr-2">
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
            {filteredGmailFiles.map((file) => {
              const priority = getGmailPriorityInfo(file);
              const routedDepartment = getGmailDepartmentLabel(file);
              const badgeStyle = getDepartmentBadgeStyle(routedDepartment);

              return (
                <div key={file._id} className="relative h-[220px] w-full">
                  <div
                    onClick={() => navigate(`/gmail-document/${file._id}`)}
                    className="group absolute top-0 left-0 w-full h-full bg-white rounded-2xl p-5 border border-gray-200 shadow-sm 
                              transition-all duration-300 ease-in-out cursor-pointer flex flex-col
                              hover:w-[120%] hover:-left-[10%] hover:h-fit hover:min-h-[110%] 
                              hover:scale-105 hover:z-[100] hover:border-indigo-200 hover:shadow-2xl"
                  >
                    <div className="flex flex-col h-full">
                      <div className="flex justify-between items-start mb-3">
                        <h3 className="font-bold text-gray-800 group-hover:text-indigo-600 transition line-clamp-1 pr-2">
                          {getAttachmentDisplayName(file, "Attachment")}
                        </h3>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold border uppercase ${getUrgencyColor(priority.level ? priority.level.toLowerCase() : "pending")}`}>
                            {priority.displayLabel}
                          </span>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDeleteGmailFile(file._id);
                            }}
                            className="p-1 text-gray-400 hover:text-red-500 transition-colors"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>

                      <div className="flex-grow overflow-hidden group-hover:overflow-visible">
                        <div className="flex items-center gap-1 mb-1.5">
                          <Mail className="w-3 h-3 text-indigo-500" />
                          <span className="text-[9px] font-bold text-gray-400 uppercase tracking-widest">Mail Summary</span>
                        </div>

                        <p className="text-sm text-gray-500 line-clamp-3 group-hover:line-clamp-none group-hover:text-xs transition-all duration-300 leading-relaxed">
                          {file.summary || file.metadata?.subject || "No summary available yet."}
                        </p>
                      </div>

                      <div className="mt-2 pt-3 border-t border-gray-50 flex justify-between items-center text-[10px] text-gray-400 shrink-0">
                        <span className="flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {new Date(file.uploadDate).toLocaleDateString()}
                        </span>
                        <span
                          className="px-2 py-0.5 rounded-md font-medium"
                          style={badgeStyle}
                        >
                          {routedDepartment}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
            </div>
          </div>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}
