// src/components/DocumentViewer.tsx
import { useState, useEffect } from "react";
import { FileText, File, Download, ZoomIn, ZoomOut } from "lucide-react";
import mammoth from "mammoth";
import * as XLSX from "xlsx";

interface DocumentViewerProps {
  fileUrl?: string;
  fileId?: string;
  pythonFileId?: string;
  fileName?: string;
  fileType?: string;
  isGmailAttachment?: boolean;
}

const BASE_URL = (import.meta.env.VITE_API_URL || "http://localhost:5000").replace(/\/api\/?$/, "");
const API_URL = `${BASE_URL}/api`;
const AI_BASE_URL = (import.meta.env.VITE_AI_API_URL || "http://127.0.0.1:8000").replace(/\/$/, "");

export async function authFetch(url: string, options: RequestInit = {}) {
  const token = localStorage.getItem("token");
  const baseHeaders: Record<string, string> = {};
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

export default function DocumentViewer({
  fileUrl,
  fileId,
  pythonFileId,
  fileName = "document",
  fileType,
  isGmailAttachment = false,
}: DocumentViewerProps) {
  const [viewUrl, setViewUrl] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>("");
  const [zoom, setZoom] = useState(100);
  const [docHtml, setDocHtml] = useState<string>("");
  const [sheetHtml, setSheetHtml] = useState<string>("");
  const [officeLoading, setOfficeLoading] = useState(false);

  useEffect(() => {
    loadDocument();
    return () => {
      if (viewUrl.startsWith("blob:")) {
        URL.revokeObjectURL(viewUrl);
      }
    };
  }, [fileUrl, fileId, pythonFileId]);

  const getPythonBlobUrl = async (pyId: string) => {
    const res = await fetch(`${AI_BASE_URL}/documents/${pyId}/download`);
    if (!res.ok) throw new Error("Failed to fetch DB-backed file");
    const blob = await res.blob();
    return URL.createObjectURL(blob);
  };

  // Process office files once viewUrl is ready
  useEffect(() => {
    if (!viewUrl) return;
    const ext = getFileExtension();

    if (["doc", "docx"].includes(ext)) {
      setOfficeLoading(true);
      setDocHtml("");
      fetch(viewUrl)
        .then((r) => r.arrayBuffer())
        .then((buf) => mammoth.convertToHtml({ arrayBuffer: buf }))
        .then((result) => setDocHtml(result.value))
        .catch((err) => console.error("Mammoth error:", err))
        .finally(() => setOfficeLoading(false));
    }

    if (["xls", "xlsx", "csv"].includes(ext)) {
      setOfficeLoading(true);
      setSheetHtml("");
      fetch(viewUrl)
        .then((r) => r.arrayBuffer())
        .then((buf) => {
          const wb = XLSX.read(buf, { type: "array" });
          const ws = wb.Sheets[wb.SheetNames[0]];
          setSheetHtml(XLSX.utils.sheet_to_html(ws));
        })
        .catch((err) => console.error("XLSX error:", err))
        .finally(() => setOfficeLoading(false));
    }
  }, [viewUrl]);

  const loadDocument = async () => {
    setLoading(true);
    setError("");
    setDocHtml("");
    setSheetHtml("");

    try {
      if (fileUrl) {
        setViewUrl(fileUrl);
        setLoading(false);
        return;
      }

      if (fileId) {
        if (isGmailAttachment) {
          const res = await authFetch(`${API_URL}/mail/download/${fileId}`);
          if (!res.ok) throw new Error("Failed to load document");
          const blob = await res.blob();
          setViewUrl(URL.createObjectURL(blob));
        } else {
          const res = await authFetch(`${API_URL}/documents/${fileId}`);
          if (!res.ok) throw new Error("Failed to load document");
          const data = await res.json();
          const resolvedPythonId = pythonFileId || data.python_file_id;
          if (resolvedPythonId) {
            const blobUrl = await getPythonBlobUrl(resolvedPythonId);
            setViewUrl(blobUrl);
            return;
          }
          const url = data.file_url;
          if (!url) throw new Error("No file URL returned from server");
          setViewUrl(url.startsWith("http") ? url : `${BASE_URL}${url}`);
        }
      }
    } catch (err) {
      console.error("Document load error:", err);
      setError("Failed to load document preview");
    } finally {
      setLoading(false);
    }
  };

  const handleDownload = async () => {
    try {
      if (fileUrl) {
        window.open(fileUrl, "_blank");
        return;
      }
      if (fileId) {
        let downloadUrl = "";
        if (isGmailAttachment) {
          const res = await authFetch(`${API_URL}/mail/download/${fileId}`);
          const blob = await res.blob();
          downloadUrl = URL.createObjectURL(blob);
        } else {
          const res = await authFetch(`${API_URL}/documents/${fileId}`);
          const data = await res.json();
          const resolvedPythonId = pythonFileId || data.python_file_id;
          if (resolvedPythonId) {
            downloadUrl = await getPythonBlobUrl(resolvedPythonId);
          } else {
            const raw = data.file_url;
            downloadUrl = raw.startsWith("http") ? raw : `${BASE_URL}${raw}`;
          }
        }
        const a = document.createElement("a");
        a.href = downloadUrl;
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
      }
    } catch (err) {
      console.error("Download error:", err);
      alert("Failed to download file");
    }
  };

  const getFileExtension = (): string => {
    if (fileType) return fileType.toLowerCase();
    if (fileName && fileName.includes(".")) {
      const ext = fileName.split(".").pop()?.toLowerCase();
      if (ext) return ext;
    }
    if (viewUrl) {
      const cleanUrl = viewUrl.split("?")[0];
      const ext = cleanUrl.split(".").pop()?.toLowerCase();
      if (ext && ext.length <= 5) return ext;
    }
    return "";
  };

  const renderOfficeLoading = (color: string, label: string) => (
    <div className="flex flex-col items-center justify-center h-full gap-3">
      <div className={`animate-spin rounded-full h-8 w-8 border-b-2 ${color}`} />
      <span className="text-gray-600 text-sm">{label}</span>
    </div>
  );

  const renderPreview = () => {
    const ext = getFileExtension();

    // PDF
    if (ext === "pdf" || fileType?.includes("pdf")) {
      return (
        <iframe
          src={`${viewUrl}#view=FitH`}
          className="w-full h-full border-0"
          title="PDF Viewer"
          style={{ transform: `scale(${zoom / 100})`, transformOrigin: "top left" }}
        />
      );
    }

    // Images
    if (["jpg", "jpeg", "png", "gif", "bmp", "webp", "svg"].includes(ext) || fileType?.includes("image")) {
      return (
        <div className="flex items-center justify-center h-full bg-gray-50 overflow-auto">
          <img
            src={viewUrl}
            alt={fileName}
            className="max-w-full h-auto"
            style={{ transform: `scale(${zoom / 100})` }}
          />
        </div>
      );
    }

    // Video
    if (["mp4", "webm", "ogg", "mov", "mkv", "avi"].includes(ext) || fileType?.includes("video")) {
      return (
        <div className="flex items-center justify-center h-full bg-black">
          <video src={viewUrl} controls className="max-w-full max-h-full">
            Your browser does not support video playback.
          </video>
        </div>
      );
    }

    // Audio
    if (["mp3", "wav", "ogg", "m4a", "aac", "flac"].includes(ext) || fileType?.includes("audio")) {
      return (
        <div className="flex flex-col items-center justify-center h-full bg-gray-50 gap-4">
          <div className="w-24 h-24 rounded-full bg-blue-100 flex items-center justify-center">
            <svg className="w-12 h-12 text-blue-600" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 3v10.55A4 4 0 1 0 14 17V7h4V3h-6z" />
            </svg>
          </div>
          <p className="text-gray-700 font-medium">{fileName}</p>
          <audio src={viewUrl} controls className="w-80">
            Your browser does not support audio playback.
          </audio>
        </div>
      );
    }

    // Text / Code
    if (["txt", "js", "jsx", "ts", "tsx", "json", "xml", "html", "css", "md"].includes(ext)) {
      return <iframe src={viewUrl} className="w-full h-full border-0 bg-white" title="Text Viewer" />;
    }

    // Word Documents — mammoth converts to HTML in browser
    if (["doc", "docx"].includes(ext) || fileType?.includes("word") || fileType?.includes("msword")) {
      if (officeLoading) return renderOfficeLoading("border-blue-600", "Converting Word document...");
      if (docHtml) {
        return (
          <div
            className="w-full h-full overflow-auto p-8 bg-white prose max-w-none"
            dangerouslySetInnerHTML={{ __html: docHtml }}
          />
        );
      }
    }

    // Excel / CSV — SheetJS converts to HTML table in browser
    if (["xls", "xlsx", "csv"].includes(ext) || fileType?.includes("excel") || fileType?.includes("spreadsheet")) {
      if (officeLoading) return renderOfficeLoading("border-green-600", "Loading spreadsheet...");
      if (sheetHtml) {
        return (
          <div
            className="w-full h-full overflow-auto p-4 bg-white"
            style={{ fontSize: "13px" }}
            dangerouslySetInnerHTML={{ __html: sheetHtml }}
          />
        );
      }
    }

    // PPT — no browser-side renderer, use Google Docs for public URLs
    if (["ppt", "pptx"].includes(ext) || fileType?.includes("presentation")) {
      const isPublicUrl = viewUrl.startsWith("http") && !viewUrl.includes("localhost");
      if (isPublicUrl) {
        return (
          <iframe
            src={`https://docs.google.com/gviewer?url=${encodeURIComponent(viewUrl)}&embedded=true`}
            className="w-full h-full border-0"
            title="Presentation Viewer"
          />
        );
      }
      return (
        <div className="flex flex-col items-center justify-center h-full bg-gray-50 p-8 gap-4">
          <FileText className="w-20 h-20 text-orange-500" />
          <p className="text-gray-700 font-semibold">PowerPoint Presentation</p>
          <p className="text-gray-500 text-sm text-center">
            PowerPoint files can't be previewed locally.<br />
            Upload to a public server (S3) to enable preview.
          </p>
          <button
            onClick={handleDownload}
            className="px-6 py-3 bg-blue-600 text-white rounded-lg flex items-center gap-2 hover:bg-blue-700"
          >
            <Download className="w-5 h-5" />
            Download to View
          </button>
        </div>
      );
    }

    // Default fallback
    return (
      <div className="flex flex-col items-center justify-center h-full bg-gray-50 p-8">
        <File className="w-20 h-20 text-gray-400 mb-4" />
        <p className="text-gray-700 font-semibold mb-2">{fileName}</p>
        <p className="text-gray-600 mb-4 text-center">Preview not available for this file type</p>
        <button
          onClick={handleDownload}
          className="px-6 py-3 bg-blue-600 text-white rounded-lg flex items-center gap-2 hover:bg-blue-700"
        >
          <Download className="w-5 h-5" />
          Download File
        </button>
      </div>
    );
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full bg-gray-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading preview...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-full bg-gray-50 p-8">
        <File className="w-20 h-20 text-red-400 mb-4" />
        <p className="text-red-600 font-semibold mb-2">Preview Error</p>
        <p className="text-gray-600 mb-4">{error}</p>
        <button
          onClick={loadDocument}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-white rounded-lg border">
      {/* Zoom Controls — shown for PDF and images */}
      {["pdf", "jpg", "jpeg", "png", "gif", "bmp", "webp"].includes(getFileExtension()) && (
        <div className="flex items-center gap-2 p-3 border-b bg-gray-50">
          <button onClick={() => setZoom(Math.max(50, zoom - 25))} className="p-2 hover:bg-gray-200 rounded" title="Zoom Out">
            <ZoomOut className="w-4 h-4" />
          </button>
          <span className="text-sm font-medium min-w-[60px] text-center">{zoom}%</span>
          <button onClick={() => setZoom(Math.min(200, zoom + 25))} className="p-2 hover:bg-gray-200 rounded" title="Zoom In">
            <ZoomIn className="w-4 h-4" />
          </button>
          <button onClick={() => setZoom(100)} className="ml-2 px-3 py-1 text-sm bg-gray-200 hover:bg-gray-300 rounded">
            Reset
          </button>
          <div className="flex-1" />
          <button onClick={handleDownload} className="px-3 py-1 bg-blue-600 text-white rounded flex items-center gap-2 hover:bg-blue-700">
            <Download className="w-4 h-4" />
            Download
          </button>
        </div>
      )}

      {/* Preview Area */}
      <div className="flex-1 overflow-auto">{renderPreview()}</div>
    </div>
  );
}
