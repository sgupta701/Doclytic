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

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:5000/api";

type Urgency = "low" | "medium" | "high";

interface DocumentWithDetails {
  _id: string;
  title: string;
  content?: string;
  summary?: string;
  urgency?: Urgency;
  uploaded_by?: string;
  createdAt?: string;
  department?: { name?: string };
  profile?: { full_name?: string };
  file_url?: string;
  file_type?: string;
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
      // Document
      const doc = (await apiFetch(`/api/documents/${id}`)) as DocumentWithDetails;
      setDocument(doc);

      // comments
      const fetchedComments = (await apiFetch(
        `/api/comments/${id}`
      )) as Comment[];
      setComments(fetchedComments || []);

      // notes
      const fetchedNotes = (await apiFetch(`/api/notes/${id}`)) as Note[];
      setNotes(fetchedNotes || []);

      // highlights
      const fetchedHighlights = (await apiFetch(
        `/api/highlights/${id}`
      )) as Highlight[];
      setHighlights(fetchedHighlights || []);

      // permissions
      const fetchedPerms = (await apiFetch(
        `/api/permissions/${id}`
      )) as DocumentPermission[];
      setPermissions(fetchedPerms || []);

      // all profiles (for granting permission)
      const fetchedProfiles = (await apiFetch(`/api/profiles`)) as Profile[];
      setAllProfiles(fetchedProfiles || []);
    } catch (err) {
      console.error("Error loading document:", err);
      // optionally show toast
    } finally {
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
      const newC = (await apiFetch("/comments", {
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
      const newN = (await apiFetch("/notes", {
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
      const newP = (await apiFetch("/permissions", {
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
      await apiFetch(`/permissions/${permId}`, { method: "DELETE" });
      setPermissions((s) => s.filter((p) => p._id !== permId && p.user_id !== userId));
    } catch (err) {
      console.error("Delete permission failed:", err);
      alert(String(err));
    } finally {
      setProcessing(false);
    }
  };

  // Fetch AI summary (server-side will call model or generate)
  const fetchAISummary = async () => {
    if (!id) return;
    setSummaryLoading(true);
    try {
      const data = (await apiFetch(`/documents/${id}/summary`)) as { summary: string };
      // update document summary
      setDocument((d) => (d ? { ...d, summary: data.summary } : d));
    } catch (err) {
      console.error("AI summary fetch failed:", err);
      alert(String(err));
    } finally {
      setSummaryLoading(false);
    }
  };

  const fileDownloadUrl = (fileUrl?: string) => {
    if (!fileUrl) return null;
    // If backend returns full URL, use it. If relative (e.g. /uploads/...), prefix API host origin.
    if (fileUrl.startsWith("http") || fileUrl.startsWith("https")) return fileUrl;
    // remove leading slash if present when joining
    const cleaned = fileUrl.startsWith("/") ? fileUrl.slice(1) : fileUrl;
    const base = API_URL.replace(/\/api\/?$/, "");
    return `${base}/${cleaned}`;
  };

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
        <div className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
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

          <div className="flex items-center gap-3">
            {document.file_url && (
              <a
                href={fileDownloadUrl(document.file_url) || "#"}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-2 px-3 py-2 border rounded hover:bg-gray-50"
              >
                <Download className="w-4 h-4" />
                <span className="text-sm">Download</span>
              </a>
            )}

            <button
              onClick={() => fetchAISummary()}
              className="px-3 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700 disabled:opacity-60"
              disabled={summaryLoading}
            >
              {summaryLoading ? "Summarizing..." : "Get AI Summary"}
            </button>
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

                  <span className="text-sm text-gray-500">
                    Uploaded by {document.profile?.full_name || "Unknown"}
                  </span>
                </div>

                {document.summary ? (
                  <div className="bg-blue-50 border-l-4 border-blue-600 p-4 mb-4">
                    <p className="text-sm text-gray-700">{document.summary}</p>
                  </div>
                ) : (
                  <div className="text-sm text-gray-500 mb-4">No summary available</div>
                )}
              </div>

             <div className="bg-white rounded-xl shadow-sm border" style={{ height: "600px" }}>
  <DocumentViewer
    fileId={document._id}
    fileName={document.title}
    fileType={document.file_type}
    isGmailAttachment={false}
  />
</div>
            </div>
          </div>

          {/* Right panel */}
          <div className="w-96 bg-white border-l border-gray-200 overflow-y-auto">
            <div className="border-b border-gray-200">
              <div className="flex">
                {(["permissions", "notes", "highlights", "comments"] as const).map(
                  (tab) => (
                    <button
                      key={tab}
                      onClick={() => setActiveTab(tab)}
                      className={`flex-1 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                        activeTab === tab
                          ? "border-blue-600 text-blue-600"
                          : "border-transparent text-gray-600 hover:text-gray-900"
                      }`}
                    >
                      {tab.toUpperCase()}
                    </button>
                  )
                )}
              </div>
            </div>

            <div className="p-4">
              {activeTab === "comments" && (
                <div>
                  <textarea
                    value={newComment}
                    onChange={(e) => setNewComment(e.target.value)}
                    placeholder="Add a comment..."
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg resize-none"
                    rows={3}
                  />
                  <button
                    onClick={handleAddComment}
                    disabled={processing}
                    className="mt-2 w-full flex items-center justify-center space-x-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                  >
                    <Send className="w-4 h-4" />
                    <span>Post Comment</span>
                  </button>

                  <div className="space-y-4 mt-4">
                    {comments.length === 0 && (
                      <div className="text-sm text-gray-500">No comments yet</div>
                    )}
                    {comments.map((c) => (
                      <div key={c._id || c.id} className="border-b border-gray-200 pb-4">
                        <p className="text-sm font-medium">
                          {c.profile?.full_name || (c.user_id === profile?.id ? profile.full_name : "User")}
                        </p>
                        <p className="text-sm text-gray-700">{c.content}</p>
                        <p className="text-xs text-gray-400 mt-1">
                          {new Date(c.createdAt || c.created_at || "").toLocaleString()}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {activeTab === "notes" && (
                <div>
                  <textarea
                    value={newNote}
                    onChange={(e) => setNewNote(e.target.value)}
                    placeholder="Add a note..."
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg resize-none"
                    rows={3}
                  />
                  <button
                    onClick={handleAddNote}
                    disabled={processing}
                    className="mt-2 w-full bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700"
                  >
                    Add Note
                  </button>

                  <div className="space-y-3 mt-4">
                    {notes.length === 0 && <div className="text-sm text-gray-500">No notes</div>}
                    {notes.map((n) => (
                      <div key={n._id} className="p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                        <div className="text-sm text-gray-700">{n.content}</div>
                        <div className="text-xs text-gray-400 mt-1">
                          {new Date(n.createdAt || "").toLocaleString()}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {activeTab === "highlights" && (
                <div>
                  <div className="space-y-3">
                    {highlights.length === 0 && (
                      <div className="text-sm text-gray-500">No highlights</div>
                    )}
                    {highlights.map((h) => (
                      <div key={h._id} className="p-2 border rounded">
                        <div className="text-sm">{h.text}</div>
                        <div className="text-xs text-gray-400 mt-1">
                          {new Date(h.createdAt || "").toLocaleString()}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {activeTab === "permissions" && (
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-sm font-medium">Permissions</h3>
                    <button
                      onClick={() => setShowAddPermission((s) => !s)}
                      className="text-sm text-blue-600 hover:underline"
                    >
                      {showAddPermission ? "Close" : "Add"}
                    </button>
                  </div>

                  {showAddPermission && (
                    <div className="space-y-2 mb-4">
                      <select
                        value={selectedUser}
                        onChange={(e) => setSelectedUser(e.target.value)}
                        className="w-full px-3 py-2 border rounded"
                      >
                        <option value="">Select user</option>
                        {allProfiles
                          .filter((p) => p._id !== profile?.id)
                          .map((p) => (
                            <option key={p._id} value={p._id}>
                              {p.full_name} ({p.email})
                            </option>
                          ))}
                      </select>

                      <select
                        value={permissionLevel}
                        onChange={(e) =>
                          setPermissionLevel(e.target.value as "view" | "edit" | "admin")
                        }
                        className="w-full px-3 py-2 border rounded"
                      >
                        <option value="view">View</option>
                        <option value="edit">Edit</option>
                        <option value="admin">Admin</option>
                      </select>

                      <div className="flex gap-2">
                        <button
                          onClick={handleAddPermission}
                          disabled={processing}
                          className="flex-1 px-3 py-2 bg-green-600 text-white rounded"
                        >
                          Add
                        </button>
                        <button
                          onClick={() => setShowAddPermission(false)}
                          className="flex-1 px-3 py-2 border rounded"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}

                  <div className="space-y-2">
                    {permissions.length === 0 && (
                      <div className="text-sm text-gray-500">No permissions granted</div>
                    )}
                    {permissions.map((p) => (
                      <div
                        key={p._id || p.user_id}
                        className="p-3 border rounded flex items-center justify-between"
                      >
                        <div>
                          <div className="text-sm font-medium">{p.profile?.full_name || p.user_id}</div>
                          <div className="text-xs text-gray-500">{p.permission_level}</div>
                        </div>
                        <div className="flex items-center gap-2">
                          {/* Only show delete if current user is admin or uploaded_by - server should enforce */}
                          <button
                            title="Remove permission"
                            onClick={() => handleDeletePermission(p._id, p.user_id)}
                            className="p-2 rounded hover:bg-gray-100"
                          >
                            <Trash2 className="w-4 h-4 text-red-600" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
