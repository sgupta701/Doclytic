// src/pages/GmailDocument.tsx
import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, Download, Mail, Clock, User, FileText } from "lucide-react";
import DashboardLayout from "../components/DashboardLayout";
import DocumentViewer from "../components/DocumentViewer"; // ✅ Import the viewer

interface GmailFile {
  _id: string;
  filename: string;
  length: number;
  uploadDate: string;
  metadata?: {
    userId: string;
    from: string;
    subject: string;
    messageId: string;
  };
}

const BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:5000";
const API_URL = `${BASE_URL}`.replace(/\/$/, "");

export async function authFetch(url: string, options: RequestInit = {}) {
  const token = localStorage.getItem("token");

  const baseHeaders: Record<string, string> = {
    "Content-Type": "application/json",
  };

  if (token) baseHeaders.Authorization = `Bearer ${token}`;

  return fetch(url, {
    ...options,
    credentials: "include",
    headers: {
      ...baseHeaders,
      ...(options.headers || {}),
    },
  });
}

export default function GmailDocument() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [file, setFile] = useState<GmailFile | null>(null);
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState(false);
  const [comments, setComments] = useState<any[]>([]);
  const [newComment, setNewComment] = useState("");

  useEffect(() => {
    loadFileDetails();
  }, [id]);

  const loadFileDetails = async () => {
    setLoading(true);
    try {
      // ✅ Fetch single file instead of all files
      const res = await authFetch(`${API_URL}/api/mail/file/${id}`);
      if (!res.ok) {
        if (res.status === 404) {
          alert("File not found");
        } else if (res.status === 403) {
          alert("Access denied. This file does not belong to you.");
        } else {
          alert("Failed to load file");
        }
        navigate("/dashboard");
        return;
      }
      
      const fileData = await res.json();
      setFile(fileData);
    } catch (error) {
      console.error("Load error:", error);
      alert("Error loading file details");
      navigate("/dashboard");
    } finally {
      setLoading(false);
    }
  };

  const handleDownload = async () => {
    if (!file) return;
    
    setDownloading(true);
    try {
      const res = await authFetch(`${API_URL}/api/mail/download/${file._id}`);
      if (!res.ok) {
        alert("Failed to download file");
        return;
      }
      
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = file.filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error("Download error:", error);
      alert("Error downloading file");
    } finally {
      setDownloading(false);
    }
  };

  const handlePostComment = () => {
    if (!newComment.trim()) return;
    
    const comment = {
      id: Date.now().toString(),
      text: newComment,
      author: "Current User",
      timestamp: new Date().toISOString(),
    };
    
    setComments([...comments, comment]);
    setNewComment("");
  };

  if (loading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-screen">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
            <p className="text-gray-600">Loading...</p>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  if (!file) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-screen">
          <div className="text-center">
            <p className="text-gray-600">File not found</p>
            <button
              onClick={() => navigate("/dashboard")}
              className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-lg"
            >
              Go to Dashboard
            </button>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="p-8 max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-6">
          <button
            onClick={() => navigate("/dashboard")}
            className="flex items-center gap-2 text-gray-600 hover:text-gray-900 mb-4"
          >
            <ArrowLeft className="w-5 h-5" />
            Back
          </button>

          <div className="flex items-start justify-between">
            <div className="flex-1">
              <h1 className="text-3xl font-bold mb-2">{file.filename}</h1>
              <p className="text-gray-600">
                <Clock className="w-4 h-4 inline mr-1" />
                {new Date(file.uploadDate).toLocaleDateString("en-US", {
                  year: "numeric",
                  month: "long",
                  day: "numeric",
                })}
              </p>
            </div>

            <button
              onClick={handleDownload}
              disabled={downloading}
              className="px-6 py-3 bg-blue-600 text-white rounded-lg flex items-center gap-2 hover:bg-blue-700 transition disabled:opacity-50"
            >
              <Download className="w-5 h-5" />
              {downloading ? "Downloading..." : "Download"}
            </button>
          </div>
        </div>

        {/* Main Content */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left Column - File Details */}
          <div className="lg:col-span-2 space-y-6">
            {/* Priority Badge */}
            <div className="bg-white p-6 rounded-xl shadow-sm border">
              <span className="inline-block px-4 py-2 bg-blue-100 text-blue-800 rounded-lg font-semibold">
                GMAIL ATTACHMENT
              </span>

              {/* Email Subject */}
              {file.metadata?.subject && (
                <div className="mt-6">
                  <h3 className="text-sm font-semibold text-gray-500 mb-2">EMAIL SUBJECT</h3>
                  <p className="text-gray-900 border-l-4 border-blue-500 pl-4 py-2">
                    {file.metadata.subject}
                  </p>
                </div>
              )}

              {/* File Info */}
              <div className="mt-6 grid grid-cols-2 gap-4">
                <div>
                  <h3 className="text-sm font-semibold text-gray-500 mb-2">FILE SIZE</h3>
                  <p className="text-gray-900">{(file.length / 1024).toFixed(2)} KB</p>
                </div>
                
                <div>
                  <h3 className="text-sm font-semibold text-gray-500 mb-2">UPLOAD DATE</h3>
                  <p className="text-gray-900">
                    {new Date(file.uploadDate).toLocaleString()}
                  </p>
                </div>
              </div>

              {/* Sender Info */}
              {file.metadata?.from && (
                <div className="mt-6">
                  <h3 className="text-sm font-semibold text-gray-500 mb-2">FROM</h3>
                  <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
                    <Mail className="w-5 h-5 text-blue-600" />
                    <span className="text-gray-900">{file.metadata.from}</span>
                  </div>
                </div>
              )}

              {/* Message ID */}
              {file.metadata?.messageId && (
                <div className="mt-6">
                  <h3 className="text-sm font-semibold text-gray-500 mb-2">MESSAGE ID</h3>
                  <p className="text-gray-600 text-sm font-mono bg-gray-50 p-3 rounded-lg break-all">
                    {file.metadata.messageId}
                  </p>
                </div>
              )}
            </div>

            {/* Preview Section */}
            <div className="bg-white rounded-xl shadow-sm border" style={{ height: "600px" }}>
              <DocumentViewer
                fileId={file._id}
                fileName={file.filename}
                isGmailAttachment={true}
              />
            </div>
          </div>

          {/* Right Column - Comments */}
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
                  onClick={handlePostComment}
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
                  comments.map((comment) => (
                    <div key={comment.id} className="border-b pb-4">
                      <div className="flex items-start gap-3">
                        <div className="w-8 h-8 bg-blue-600 rounded-full flex items-center justify-center text-white font-semibold text-sm">
                          {comment.author[0]}
                        </div>
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="font-semibold text-sm">{comment.author}</span>
                            <span className="text-xs text-gray-500">
                              {new Date(comment.timestamp).toLocaleDateString()}
                            </span>
                          </div>
                          <p className="text-sm text-gray-700">{comment.text}</p>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}