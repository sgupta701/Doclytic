// src/pages/DocumentDetail.tsx
import { useEffect, useState, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  Download,
  Send,
  ArrowLeft,
  Trash2,
  Users,
  Clock,
  Edit,
} from "lucide-react";
import DashboardLayout from "../components/DashboardLayout";
import { useAuth } from "../contexts/AuthContext";
import DocumentViewer from "../components/DocumentViewer";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:5000";

type Urgency = "low" | "medium" | "high";

interface DocumentWithDetails {
  _id: string;
  title: string;
  content?: string;
  summary?: string;
  urgency?: Urgency;
  priority?: {
    priority_score?: number;
    priority_level?: "Low" | "Medium" | "High" | "Critical";
  } | null;
  uploaded_by?: { _id: string; full_name: string; email: string } | string;
  createdAt?: string;
  department?: { name?: string };
  file_url?: string;
  file_type?: string;
  python_file_id?: string;
  routed_departments?: string[];
  metadata?: {
    department_predictions?: Array<{ department?: string; score?: number }>;
    manual_review?: {
      confidence_by_department?: Record<string, number>;
    };
  };
}

interface Comment {
  _id?: string;
  id?: string;
  document_id?: string;
  user_id: string;
  content: string;
  created_at?: string;
  createdAt?: string;
  profile?: { full_name?: string };
}

interface Note {
  _id?: string;
  user_id: string;
  content: string;
  createdAt?: string;
  position?: any;
}

interface Highlight {
  _id?: string;
  user_id: string;
  text: string;
  color?: string;
  createdAt?: string;
}

interface DocumentPermission {
  _id?: string;
  user_id: string;
  permission_level: "view" | "edit" | "admin";
  profile?: { full_name?: string };
}

interface Profile {
  _id: string;
  full_name: string;
  email?: string;
}

export default function DocumentDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { profile } = useAuth();

  const [document, setDocument] = useState<DocumentWithDetails | null>(null);
  const [comments, setComments] = useState<Comment[]>([]);
  const [notes, setNotes] = useState<Note[]>([]);
  const [highlights, setHighlights] = useState<Highlight[]>([]);
  const [permissions, setPermissions] = useState<DocumentPermission[]>([]);
  const [allProfiles, setAllProfiles] = useState<Profile[]>([]);

  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<
    "permissions" | "notes" | "highlights" | "comments"
  >("comments");

  const [newComment, setNewComment] = useState("");
  const [newNote, setNewNote] = useState("");
  const [showAddPermission, setShowAddPermission] = useState(false);
  const [selectedUser, setSelectedUser] = useState<string>("");
  const [permissionLevel, setPermissionLevel] = useState<
    "view" | "edit" | "admin"
  >("view");
  const [processing, setProcessing] = useState(false);
  const [summaryLoading, setSummaryLoading] = useState(false);

  const predictedDepartments = (() => {
    if (!document) return [] as Array<{ department: string; score: number }>;

    const scoreMap = new Map<string, number>();

    const confidenceByDepartment =
      document.metadata?.manual_review?.confidence_by_department || {};
    Object.entries(confidenceByDepartment).forEach(([department, score]) => {
      const name = String(department || "").trim();
      const numericScore = Number(score);
      if (!name || Number.isNaN(numericScore)) return;
      scoreMap.set(name, Math.max(scoreMap.get(name) || 0, numericScore));
    });

    (document.metadata?.department_predictions || []).forEach((item) => {
      const name = String(item?.department || "").trim();
      const numericScore = Number(item?.score);
      if (!name || Number.isNaN(numericScore)) return;
      scoreMap.set(name, Math.max(scoreMap.get(name) || 0, numericScore));
    });

    return Array.from(scoreMap.entries())
      .map(([department, score]) => ({ department, score }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 2);
  })();

  // redirect to login if not authenticated
  useEffect(() => {
    if (!profile) {
      navigate("/login");
    }
  }, [profile]);

  // helper for API calls
  const apiFetch = useCallback(
    async (path: string, opts: RequestInit = {}) => {
      const token = localStorage.getItem("token");
      const headers: Record<string, string> = opts.headers
        ? (opts.headers as Record<string, string>)
        : {};
      if (token) headers["Authorization"] = `Bearer ${token}`;

      const res = await fetch(`${API_URL}${path}`, {
        ...opts,
        headers,
      });
      if (!res.ok) {
        // try to parse error message
        let errText = `Request failed: ${res.status}`;
        try {
          const j = await res.json();
          errText = j.message || JSON.stringify(j);
        } catch {}
        throw new Error(errText);
      }
      // if no content
      if (res.status === 204) return null;
      const contentType = res.headers.get("content-type") || "";
      if (contentType.includes("application/json")) return res.json();
      return res.text();
    },
    []
  );

  const loadAll = useCallback(async () => {
    if (!id || !profile) return;
    setLoading(true);
    try {
      const doc = (await apiFetch(`/api/documents/${id}`)) as DocumentWithDetails;
      setDocument(doc);
    } catch (err) {
      console.error("Error loading document:", err);
    } finally {
      const [
        commentsRes,
        notesRes,
        highlightsRes,
        permissionsRes,
        profilesRes,
      ] = await Promise.allSettled([
        apiFetch(`/api/comments/${id}`),
        apiFetch(`/api/notes/${id}`),
        apiFetch(`/api/highlights/${id}`),
        apiFetch(`/api/permissions/${id}`),
        apiFetch(`/api/auth/users`),
      ]);

      if (commentsRes.status === "fulfilled") setComments((commentsRes.value as Comment[]) || []);
      if (notesRes.status === "fulfilled") setNotes((notesRes.value as Note[]) || []);
      if (highlightsRes.status === "fulfilled") setHighlights((highlightsRes.value as Highlight[]) || []);
      if (permissionsRes.status === "fulfilled") setPermissions((permissionsRes.value as DocumentPermission[]) || []);
      if (profilesRes.status === "fulfilled") setAllProfiles((profilesRes.value as Profile[]) || []);

      if (commentsRes.status === "rejected") console.error("Comments load failed:", commentsRes.reason);
      if (notesRes.status === "rejected") console.error("Notes load failed:", notesRes.reason);
      if (highlightsRes.status === "rejected") console.error("Highlights load failed:", highlightsRes.reason);
      if (permissionsRes.status === "rejected") console.error("Permissions load failed:", permissionsRes.reason);
      if (profilesRes.status === "rejected") console.error("Users load failed:", profilesRes.reason);

      setLoading(false);
    }
  }, [id, profile, apiFetch]);

  useEffect(() => {
    loadAll();
  }, [id, profile, loadAll]);

  // Add comment
  const handleAddComment = async () => {
    if (!newComment.trim() || !id) return;
    setProcessing(true);
    try {
      const payload = {
        document_id: id,
        content: newComment.trim(),
      };
      const newC = (await apiFetch("/api/comments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })) as Comment;

      setComments((s) => [newC, ...s]);
      setNewComment("");
    } catch (err) {
      console.error("Add comment failed:", err);
      alert(String(err));
    } finally {
      setProcessing(false);
    }
  };

  // Add note
  const handleAddNote = async () => {
    if (!newNote.trim() || !id) return;
    setProcessing(true);
    try {
      const payload = {
        document_id: id,
        content: newNote.trim(),
      };
      const newN = (await apiFetch("/api/notes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })) as Note;

      setNotes((s) => [newN, ...s]);
      setNewNote("");
    } catch (err) {
      console.error("Add note failed:", err);
      alert(String(err));
    } finally {
      setProcessing(false);
    }
  };

  // Add permission
  const handleAddPermission = async () => {
    if (!selectedUser || !id) return;
    setProcessing(true);
    try {
      const payload = {
        document_id: id,
        user_id: selectedUser,
        permission_level: permissionLevel,
      };
      const newP = (await apiFetch("/api/permissions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })) as DocumentPermission;

      setPermissions((s) => [...s, newP]);
      setShowAddPermission(false);
      setSelectedUser("");
      setPermissionLevel("view");
    } catch (err) {
      console.error("Add permission failed:", err);
      alert(String(err));
    } finally {
      setProcessing(false);
    }
  };

  // Remove permission (only for admins)
  const handleDeletePermission = async (permId?: string, userId?: string) => {
    if (!permId || !id) return;
    if (!confirm("Remove this permission?")) return;
    setProcessing(true);
    try {
      await apiFetch(`/api/permissions/${permId}`, { method: "DELETE" });
      setPermissions((s) => s.filter((p) => p._id !== permId && p.user_id !== userId));
    } catch (err) {
      console.error("Delete permission failed:", err);
      alert(String(err));
    } finally {
      setProcessing(false);
    }
  };

  // Fetch AI summary (server-side will call model or generate)

  if (loading || !profile) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-screen">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
        </div>
      </DashboardLayout>
    );
  }

  if (!document) {
    return (
      <DashboardLayout>
        <div className="p-8 text-center">
          <p className="text-gray-600">Document not found</p>
          <button
            onClick={() => navigate("/dashboard")}
            className="mt-4 text-blue-600 hover:text-blue-700"
          >
            Back to Dashboard
          </button>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="h-[calc(100vh-73px)] flex flex-col">
        {/* Header */}
        <div className="bg-white  px-6 py-4 flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <button
              onClick={() => navigate("/dashboard")}
              className="p-2 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">{document.title}</h1>
              <p className="text-sm text-gray-600">
                {document.department?.name} •{" "}
                {new Date(document.createdAt || "").toLocaleDateString()}
              </p>
            </div>
          </div>
        </div>

        {/* Main */}
        <div className="flex-1 flex overflow-hidden">
          <div className="flex-1 bg-gray-50 overflow-y-auto p-8">
            <div className="max-w-4xl mx-auto bg-white shadow-lg rounded-lg p-12">
              <div className="mb-6 pb-6 border-b border-gray-200">
                <div className="flex items-center justify-between mb-4">
                  <span
                    className={`px-3 py-1 rounded-full text-sm font-medium ${
                      document.urgency === "high"
                        ? "bg-red-100 text-red-800"
                        : document.urgency === "medium"
                        ? "bg-yellow-100 text-yellow-800"
                        : "bg-green-100 text-green-800"
                    }`}
                  >
                    {(document.urgency || "medium").toUpperCase()} PRIORITY
                  </span>
                  <span className="px-3 py-1 rounded-full text-sm font-medium bg-slate-100 text-slate-700">
                    SCORE: {document.priority?.priority_score ?? "N/A"} | LEVEL: {document.priority?.priority_level || "Unscored"}
                  </span>

                  <span className="text-sm text-gray-500">
                   Uploaded by {(document.uploaded_by as any)?.full_name || "Unknown"}
                  </span>
                </div>

                {document.summary ? (
                  <div className="bg-blue-50 border-l-4 border-blue-600 p-4 mb-4">
                    <p className="text-sm text-gray-700">{document.summary}</p>
                  </div>
                ) : (
                  <div className="text-sm text-gray-500 mb-4">No summary available</div>
                )}

                {predictedDepartments.length > 0 && (
                  <div className="mb-4">
                    <p className="text-sm font-medium text-gray-700 mb-2">Predicted Departments</p>
                    <div className="flex flex-wrap gap-2">
                      {predictedDepartments.map((item) => (
                        <span
                          key={item.department}
                          className="px-3 py-1 rounded-full text-xs font-medium bg-indigo-50 text-indigo-700 border border-indigo-200"
                        >
                          {item.department} ({(item.score * 100).toFixed(1)}%)
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>

             <div className="bg-white rounded-xl shadow-sm border" style={{ height: "600px" }}>
  <DocumentViewer
    fileId={document._id}
    pythonFileId={document.python_file_id}
    fileName={document.title}
    fileType={document.file_type}
    isGmailAttachment={false}
  />
</div>
            </div>
          </div>

          {/* Right panel */}
         <div className="lg:col-span-1">
            <div className="bg-white p-6 rounded-xl shadow-sm border sticky top-6">
              <h3 className="text-lg font-semibold mb-4">Comments</h3>

              {/* Comment Input */}
              <div className="mb-6">
                <textarea
                  value={newComment}
                  onChange={(e) => setNewComment(e.target.value)}
                  placeholder="Add a comment..."
                  className="w-full p-3 border rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
                  rows={4}
                />
                <button
                  onClick={handleAddComment}
                  className="mt-3 w-full px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition"
                >
                  Post Comment
                </button>
              </div>

              {/* Comments List */}
              <div className="space-y-4">
                {comments.length === 0 ? (
                  <p className="text-gray-500 text-sm text-center py-4">No comments yet</p>
                ) : (
                  comments.map((comment) => {
                    const authorName = comment.profile?.full_name || "Unknown";
                    const timestamp = comment.createdAt || comment.created_at || new Date().toISOString();
                    return (
                      <div key={comment._id || comment.id} className="border-b pb-4">
                        <div className="flex items-start gap-3">
                          <div className="w-8 h-8 bg-blue-600 rounded-full flex items-center justify-center text-white font-semibold text-sm">
                            {authorName[0]}
                          </div>
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-1">
                              <span className="font-semibold text-sm">{authorName}</span>
                              <span className="text-xs text-gray-500">
                                {new Date(timestamp).toLocaleDateString()}
                              </span>
                            </div>
                            <p className="text-sm text-gray-700">{comment.content}</p>
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
