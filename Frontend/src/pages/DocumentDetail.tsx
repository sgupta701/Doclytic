// src/pages/DocumentDetail.tsx
import { useEffect, useState, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  Send,
  ArrowLeft,
  Trash2,
  MessageSquare,
  X,
  ChevronDown,
  ChevronUp,
  Building2,
  FileText,
  ShieldCheck,
} from "lucide-react";
import DashboardLayout from "../components/DashboardLayout";
import { useAuth } from "../contexts/AuthContext";
import DocumentViewer from "../components/DocumentViewer";
import DocumentChat from "../components/DocumentChat";
import { getDocumentDisplayName } from "../utils/documentName";

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
  original_filename?: string;
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
  user_id: string | { _id?: string; full_name?: string; email?: string; avatar_url?: string };
  parent_comment_id?: string | null;
  content: string;
  created_at?: string;
  createdAt?: string;
  profile?: { full_name?: string; email?: string; avatar_url?: string };
}

export default function DocumentDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { profile } = useAuth();

  const [document, setDocument] = useState<DocumentWithDetails | null>(null);
  const [comments, setComments] = useState<Comment[]>([]);
  const [showCommentDialog, setShowCommentDialog] = useState(false);
  const [loading, setLoading] = useState(true);
  const [newComment, setNewComment] = useState("");
  const [replyDrafts, setReplyDrafts] = useState<Record<string, string>>({});
  const [openReplyFor, setOpenReplyFor] = useState<string | null>(null);
  const [processing, setProcessing] = useState(false);

  const [detailedSummary, setDetailedSummary] = useState<string | null>(null);
  const [isGeneratingSummary, setIsGeneratingSummary] = useState(false);
  
  const [isSummaryExpanded, setIsSummaryExpanded] = useState(false);

  const getCommentAuthorName = (comment: Comment) => {
    if (comment.profile?.full_name) {
      return comment.profile.full_name;
    }
    if (typeof comment.user_id === "object" && comment.user_id?.full_name) {
      return comment.user_id.full_name;
    }
    return comment.profile?.full_name || "Unknown User";
  };

  const getCommentAuthorAvatar = (comment: Comment) => {
    if (comment.profile?.avatar_url) {
      return comment.profile.avatar_url;
    }
    if (typeof comment.user_id === "object" && comment.user_id?.avatar_url) {
      return comment.user_id.avatar_url;
    }
    return "";
  };

  const getCommentAuthorId = (comment: Comment) => {
    if (typeof comment.user_id === "object") {
      return comment.user_id?._id || "";
    }
    return comment.user_id || "";
  };

  const rootComments = comments.filter((comment) => !comment.parent_comment_id);

  const getReplies = (commentId: string) =>
    comments.filter((comment) => comment.parent_comment_id === commentId);

  useEffect(() => {
    if (!profile) navigate("/login");
  }, [profile, navigate]);

  const apiFetch = useCallback(
    async (path: string, opts: RequestInit = {}) => {
      const token = localStorage.getItem("token");
      const headers: Record<string, string> = opts.headers
        ? (opts.headers as Record<string, string>)
        : {};
      if (token) headers["Authorization"] = `Bearer ${token}`;

      const res = await fetch(`${API_URL}${path}`, { ...opts, headers });
      if (!res.ok) {
        let errText = `Request failed: ${res.status}`;
        try {
          const j = await res.json();
          errText = j.message || JSON.stringify(j);
        } catch {}
        throw new Error(errText);
      }
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
      
      const [commentsRes] = await Promise.allSettled([
        apiFetch(`/api/comments/${id}`)
      ]);

      if (commentsRes.status === "fulfilled") {
        setComments((commentsRes.value as Comment[]) || []);
      }
    } catch (err) {
      console.error("Error loading page data:", err);
    } finally {
      setLoading(false);
    }
  }, [id, profile, apiFetch]);

  useEffect(() => {
    loadAll();
  }, [id, profile, loadAll]);

  useEffect(() => {
    if (document && !detailedSummary && !isGeneratingSummary) {
      if (!document.python_file_id) {
        setDetailedSummary(document.summary || "No summary available yet.");
        return;
      }

      const generateDetailedSummary = async () => {
        setIsGeneratingSummary(true);
        try {
          const docId = document.python_file_id || document._id;
          
          // FIXED: Call the dedicated Python endpoint directly
          const AI_BASE_URL = import.meta.env.VITE_AI_API_URL || "http://localhost:8000";
          const response = await fetch(`${AI_BASE_URL}/documents/${docId}/detailed-summary`);
          
          if (!response.ok) {
            if (response.status === 404) {
              setDetailedSummary(document.summary || "No summary available yet.");
              return;
            }
            throw new Error("Failed to fetch detailed summary");
          }
          
          const data = await response.json();
          setDetailedSummary(data.summary);
          
        } catch (error) {
          console.error("Failed to generate detailed summary:", error);
          setDetailedSummary(document.summary || "Summary generation failed.");
        } finally {
          setIsGeneratingSummary(false);
        }
      };

      generateDetailedSummary();
    }
  }, [document?._id]); 

  const submitComment = async (content: string, parentCommentId?: string) => {
    if (!content.trim() || !id) return;
    setProcessing(true);
    try {
      const payload = {
        document_id: id,
        content: content.trim(),
        ...(parentCommentId ? { parent_comment_id: parentCommentId } : {}),
      };
      const newC = (await apiFetch("/api/comments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })) as Comment;

      setComments((s) => [...s, newC]);
      if (parentCommentId) {
        setReplyDrafts((prev) => ({ ...prev, [parentCommentId]: "" }));
        setOpenReplyFor(null);
      } else {
        setNewComment("");
      }
    } catch (err) {
      console.error("Add comment failed:", err);
      alert(String(err));
    } finally {
      setProcessing(false);
    }
  };

  const handleAddComment = async () => submitComment(newComment);

  const handleReply = async (commentId: string) => {
    await submitComment(replyDrafts[commentId] || "", commentId);
  };

  const handleDeleteComment = async (commentId: string) => {
    if (!window.confirm("Are you sure you want to delete this comment?")) return;
    
    try {
      await apiFetch(`/api/comments/${commentId}`, { method: "DELETE" });
      setComments((prev) => prev.filter((c) => (c._id || c.id) !== commentId));
    } catch (err) {
      console.error("Delete failed:", err);
      alert("Failed to delete comment.");
    }
  };

  const urgencyTone =
    document?.urgency === "high"
      ? "bg-rose-100 text-rose-700 border-rose-200"
      : document?.urgency === "low"
        ? "bg-emerald-100 text-emerald-700 border-emerald-200"
        : "bg-amber-100 text-amber-700 border-amber-200";

  const priorityLabel = document?.priority?.priority_level || "Unscored";
  const createdDate = document?.createdAt
    ? new Date(document.createdAt).toLocaleDateString()
    : "Not available";
  const commentCount = comments.length;
  const displayFilename = getDocumentDisplayName(document || undefined, "Document");
  const directPreviewUrl =
    document?.file_url && /^(https?:|blob:|data:)/i.test(document.file_url)
      ? document.file_url
      : undefined;

  if (loading || !profile) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-screen">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
        </div>
      </DashboardLayout>
    );
  }

  if (!document) return <DashboardLayout><div className="p-8 text-center">Document not found</div></DashboardLayout>;

  return (
    <DashboardLayout>
      <div className="relative min-h-[calc(100vh-73px)] xl:h-[calc(100vh-73px)] xl:overflow-hidden">
        <div className="absolute inset-x-0 top-0 h-24 rounded-[2rem] bg-[radial-gradient(circle_at_top_left,_rgba(59,130,246,0.16),_transparent_38%),radial-gradient(circle_at_top_right,_rgba(16,185,129,0.12),_transparent_34%),linear-gradient(180deg,_#ffffff_0%,_#f8fbff_58%,_#f4f7fb_100%)] sm:h-28" />
        <div className="relative z-10 rounded-[1.25rem] border border-slate-200/80 bg-white/94 px-4 py-3 shadow-[0_16px_40px_-30px_rgba(15,23,42,0.24)] backdrop-blur sm:px-5 sm:py-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-start gap-4">
              <button onClick={() => navigate("/dashboard")} className="mt-0.5 rounded-xl border border-slate-200 bg-white p-2 text-slate-600 shadow-sm transition hover:-translate-y-0.5 hover:bg-slate-50">
                <ArrowLeft className="h-4 w-4" />
              </button>
              <div className="min-w-0">
                <div className="mb-1.5 flex flex-wrap items-center gap-2">
                  <span className={`rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] ${urgencyTone}`}>
                    {(document.urgency || "medium").toUpperCase()} Priority
                  </span>
                </div>
                <h1 className="max-w-4xl text-[1.35rem] font-semibold leading-tight tracking-tight text-gray-900 sm:text-[1.65rem] lg:text-[1.9rem]">{document.title}</h1>
              </div>
            </div>
            <button onClick={() => setShowCommentDialog(true)} className="inline-flex w-full items-center justify-center gap-2 self-start rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white shadow-lg shadow-slate-900/15 transition hover:-translate-y-0.5 hover:bg-slate-800 sm:w-auto lg:self-auto">
              <MessageSquare className="h-4 w-4" />
              Open Discussion
              <span className="rounded-full bg-white/15 px-2 py-0.5 text-xs">{commentCount}</span>
            </button>
          </div>
        </div>

        <div className="mt-4 grid gap-6 xl:h-[calc(100%-6.5rem)] xl:grid-cols-[minmax(0,1.45fr)_minmax(300px,0.72fr)]">
          <div className="min-h-0 xl:overflow-y-auto xl:pr-1">
            <div className="flex min-h-full flex-col gap-6">
            <div className="overflow-hidden rounded-[1.75rem] border border-blue-100 bg-white shadow-[0_22px_50px_-30px_rgba(37,99,235,0.4)]">
              <div className="border-b border-blue-100 bg-[linear-gradient(135deg,_rgba(239,246,255,1)_0%,_rgba(248,250,252,1)_58%,_rgba(255,255,255,1)_100%)] p-5 sm:p-6">
                <div className="mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  <div className="rounded-2xl border border-slate-200 bg-white/80 p-4">
                    <div className="mb-3 flex items-center gap-2 text-slate-500">
                      <Building2 className="h-4 w-4" />
                      <span className="text-xs font-semibold uppercase tracking-[0.16em]">Department</span>
                    </div>
                    <p className="text-sm font-semibold text-slate-900 sm:text-base">{document.department?.name || "Unassigned"}</p>
                  </div>
                  <div className="rounded-2xl border border-slate-200 bg-white/80 p-4">
                    <div className="mb-3 flex items-center gap-2 text-slate-500">
                      <ShieldCheck className="h-4 w-4" />
                      <span className="text-xs font-semibold uppercase tracking-[0.16em]">Priority</span>
                    </div>
                    <p className="text-sm font-semibold text-slate-900 sm:text-base">{priorityLabel}</p>
                  </div>
                  <div className="rounded-2xl border border-slate-200 bg-white/80 p-4">
                    <div className="mb-3 flex items-center gap-2 text-slate-500">
                      <MessageSquare className="h-4 w-4" />
                      <span className="text-xs font-semibold uppercase tracking-[0.16em]">Comments</span>
                    </div>
                    <p className="text-sm font-semibold text-slate-900 sm:text-base">{commentCount} {commentCount === 1 ? "comment" : "comments"}</p>
                  </div>
                </div>

                <div className="rounded-2xl border border-blue-100 bg-white/90 p-4 sm:p-5">
                  <p className="mb-3 text-xs font-bold uppercase tracking-widest text-blue-800">Detailed Analysis</p>
                  {isGeneratingSummary ? (
                    <div className="flex flex-col items-center justify-center gap-2 py-6 text-center">
                      <div className="h-6 w-6 animate-spin rounded-full border-2 border-blue-600 border-t-transparent"></div>
                      <p className="text-sm text-blue-700">Preparing a readable summary for this document...</p>
                    </div>
                  ) : (
                    <div className="relative">
                      <p className={`whitespace-pre-wrap text-sm leading-7 text-slate-700 transition-all duration-300 sm:text-[15px] ${isSummaryExpanded ? "" : "line-clamp-4"}`}>
                        {detailedSummary || document.summary || "No summary available yet."}
                      </p>

                      {((detailedSummary || document.summary)?.length || 0) > 250 && (
                        <button
                          onClick={() => setIsSummaryExpanded(!isSummaryExpanded)}
                          className="mt-4 inline-flex items-center gap-1 rounded-full bg-blue-50 px-3 py-1.5 text-xs font-semibold text-blue-700 transition hover:bg-blue-100"
                        >
                          {isSummaryExpanded ? (
                            <>Show Less <ChevronUp className="h-3.5 w-3.5" /></>
                          ) : (
                            <>Read Full Summary <ChevronDown className="h-3.5 w-3.5" /></>
                          )}
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>

              <div className="overflow-hidden rounded-[1.75rem] border border-slate-200 bg-white shadow-[0_28px_70px_-38px_rgba(15,23,42,0.35)]">
                <div className="border-b border-slate-200 bg-slate-50/90 px-5 py-4 sm:px-6">
                  <div className="flex items-center gap-3">
                    <div className="rounded-2xl bg-slate-900/5 p-3 text-slate-700">
                      <FileText className="h-5 w-5" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Preview</p>
                      <h2 className="truncate text-lg font-semibold text-slate-900">Interactive document viewer</h2>
                    </div>
                  </div>
                </div>
                <div className="h-[48vh] min-h-[280px] bg-white sm:h-[54vh] lg:h-[58vh] xl:h-[calc(100vh-22rem)]">
                  <DocumentViewer
                    fileId={document._id}
                    pythonFileId={document.python_file_id}
                    fileUrl={directPreviewUrl}
                    fileName={displayFilename}
                    fileType={document.file_type}
                    isGmailAttachment={false}
                  />
                </div>
              </div>
            </div>
          </div>
          </div>

          <div className="min-h-0">
            <div className="overflow-hidden rounded-[1.75rem] border border-slate-200 bg-white shadow-[0_28px_70px_-40px_rgba(15,23,42,0.3)] xl:sticky xl:top-4 xl:h-[calc(100vh-12rem)]">
              <div className="h-[420px] sm:h-[480px] lg:h-[520px] xl:h-full">
                <DocumentChat documentId={document.python_file_id || document._id} />
              </div>
            </div>
          </div>
        </div>

        {showCommentDialog && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm">
            <div className="flex max-h-[88vh] w-full max-w-2xl flex-col overflow-hidden rounded-[1.5rem] border border-slate-200 bg-white shadow-2xl">
              <div className="flex items-center justify-between border-b bg-slate-50 px-5 py-4">
                <h3 className="text-lg font-semibold flex items-center gap-2">
                  <MessageSquare className="w-5 h-5 text-blue-600" /> Team Discussion
                </h3>
                <button onClick={() => setShowCommentDialog(false)} className="p-1 hover:bg-slate-200 rounded-full text-slate-500 transition-colors">
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="flex-1 overflow-y-auto bg-slate-50/60 p-4 space-y-4 sm:p-6">
                {comments.length === 0 ? (
                    <p className="text-center text-gray-400 py-10">No comments yet.</p>
                ) : (
                    rootComments.map((comment) => (
                    <div key={comment._id || comment.id} className="group rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                        <div className="flex items-start gap-3">
                          <div className="w-8 h-8 bg-blue-600 rounded-full flex items-center justify-center text-white font-semibold text-sm shrink-0 uppercase">
                              {getCommentAuthorAvatar(comment) ? (
                                <img
                                  src={getCommentAuthorAvatar(comment)}
                                  alt={getCommentAuthorName(comment)}
                                  className="w-8 h-8 rounded-full object-cover"
                                />
                              ) : (
                                getCommentAuthorName(comment)?.[0] || "U"
                              )}
                          </div>
                          <div className="flex-1">
                              <div className="flex items-center justify-between mb-1">
                                <div className="flex items-center gap-2">
                                  <span className="font-semibold text-sm">{getCommentAuthorName(comment)}</span>
                                  <span className="text-xs text-gray-400">{new Date(comment.createdAt || "").toLocaleDateString()}</span>
                                </div>
                                
                                {getCommentAuthorId(comment) === profile.id && (
                                  <button 
                                    onClick={() => handleDeleteComment(comment._id || comment.id || "")}
                                    className="text-gray-400 hover:text-red-500 transition-colors opacity-0 group-hover:opacity-100 p-1"
                                    title="Delete comment"
                                  >
                                    <Trash2 className="w-4 h-4" />
                                  </button>
                                )}
                              </div>
                              <p className="text-sm text-gray-700 whitespace-pre-wrap">{comment.content}</p>
                              <div className="mt-3">
                                <button
                                  onClick={() => setOpenReplyFor(openReplyFor === (comment._id || comment.id || "") ? null : (comment._id || comment.id || ""))}
                                  className="text-xs font-medium text-blue-600 hover:text-blue-800"
                                >
                                  Reply
                                </button>
                              </div>

                              {getReplies(comment._id || comment.id || "").length > 0 && (
                                <div className="mt-4 space-y-3 border-l-2 border-slate-200 pl-4">
                                  {getReplies(comment._id || comment.id || "").map((reply) => (
                                    <div key={reply._id || reply.id} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                                      <div className="flex items-start gap-3">
                                        <div className="w-7 h-7 bg-slate-700 rounded-full flex items-center justify-center text-white font-semibold text-xs shrink-0 uppercase overflow-hidden">
                                          {getCommentAuthorAvatar(reply) ? (
                                            <img
                                              src={getCommentAuthorAvatar(reply)}
                                              alt={getCommentAuthorName(reply)}
                                              className="w-7 h-7 rounded-full object-cover"
                                            />
                                          ) : (
                                            getCommentAuthorName(reply)?.[0] || "U"
                                          )}
                                        </div>
                                        <div className="flex-1">
                                          <div className="flex items-center gap-2 mb-1">
                                            <span className="font-semibold text-xs">{getCommentAuthorName(reply)}</span>
                                            <span className="text-xs text-gray-400">{new Date(reply.createdAt || "").toLocaleDateString()}</span>
                                          </div>
                                          <p className="text-sm text-gray-700 whitespace-pre-wrap">{reply.content}</p>
                                        </div>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              )}

                              {openReplyFor === (comment._id || comment.id || "") && (
                                <div className="mt-4">
                                  <textarea
                                    value={replyDrafts[comment._id || comment.id || ""] || ""}
                                    onChange={(e) =>
                                      setReplyDrafts((prev) => ({
                                        ...prev,
                                        [comment._id || comment.id || ""]: e.target.value,
                                      }))
                                    }
                                    placeholder="Write a reply..."
                                    className="w-full p-3 border border-slate-200 rounded-lg resize-none focus:ring-2 focus:ring-blue-500 bg-white text-sm"
                                    rows={2}
                                  />
                                  <div className="flex justify-end mt-2">
                                    <button
                                      onClick={() => handleReply(comment._id || comment.id || "")}
                                      disabled={processing || !(replyDrafts[comment._id || comment.id || ""] || "").trim()}
                                      className="px-4 py-2 bg-slate-800 text-white rounded-lg hover:bg-slate-900 transition disabled:opacity-50 text-sm font-semibold"
                                    >
                                      {processing ? "Posting..." : "Reply"}
                                    </button>
                                  </div>
                                </div>
                              )}
                          </div>
                        </div>
                    </div>
                    ))
                )}
              </div>
              <div className="border-t bg-white p-4">
                <textarea
                  value={newComment}
                  onChange={(e) => setNewComment(e.target.value)}
                  placeholder="Share your thoughts..."
                  className="w-full resize-none rounded-xl border border-slate-200 bg-white p-3 text-sm focus:ring-2 focus:ring-blue-500"
                  rows={3}
                />
                <div className="flex justify-end mt-3">
                  <button onClick={handleAddComment} disabled={processing || !newComment.trim()} className="flex items-center gap-2 rounded-xl bg-blue-600 px-6 py-2 text-sm font-semibold text-white shadow-md transition hover:bg-blue-700 disabled:opacity-50">
                    {processing ? "Posting..." : "Post Comment"} <Send className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
