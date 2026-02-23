// src/components/DocumentViewer.tsx
import { useState, useEffect } from "react";
import { FileText, Image as ImageIcon, File, Download, ZoomIn, ZoomOut } from "lucide-react";

interface DocumentViewerProps {
  fileUrl?: string;
  fileId?: string;
  fileName?: string;
  fileType?: string;
  isGmailAttachment?: boolean;
}

const BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:5000";
const API_URL = `${BASE_URL}`.replace(/\/$/, "");

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
  fileName = "document",
  fileType,
  isGmailAttachment = false,
}: DocumentViewerProps) {
  const [viewUrl, setViewUrl] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>("");
  const [zoom, setZoom] = useState(100);

  useEffect(() => {
    loadDocument();
    return () => {
      // Cleanup blob URL
      if (viewUrl.startsWith("blob:")) {
        URL.revokeObjectURL(viewUrl);
      }
    };
  }, [fileUrl, fileId]);

  const loadDocument = async () => {
    setLoading(true);
    setError("");

    try {
      if (fileUrl) {
        // Direct URL provided
        setViewUrl(fileUrl);
        setLoading(false);
        return;
      }

      if (fileId) {
        // Fetch from API
        const endpoint = isGmailAttachment
          ? `${API_URL}/api/mail/download/${fileId}`
          : `${API_URL}/api/documents/${fileId}/download`;

        const res = await authFetch(endpoint);
        
        if (!res.ok) {
          throw new Error("Failed to load document");
        }

        const blob = await res.blob();
        const blobUrl = URL.createObjectURL(blob);
        setViewUrl(blobUrl);
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
        const endpoint = isGmailAttachment
          ? `${API_URL}/api/mail/download/${fileId}`
          : `${API_URL}/api/documents/${fileId}/download`;

        const res = await authFetch(endpoint);
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }
    } catch (err) {
      console.error("Download error:", err);
      alert("Failed to download file");
    }
  };

  const getFileExtension = () => {
    if (fileType) return fileType.toLowerCase();
    if (fileName) {
      const ext = fileName.split(".").pop()?.toLowerCase();
      return ext || "";
    }
    return "";
  };

  const renderPreview = () => {
    const ext = getFileExtension();

    // PDF Preview
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

    // Image Preview
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

    // Text/Code Preview
    if (["txt", "js", "jsx", "ts", "tsx", "json", "xml", "html", "css", "md"].includes(ext)) {
      return (
        <iframe
          src={viewUrl}
          className="w-full h-full border-0 bg-white"
          title="Text Viewer"
        />
      );
    }

    // Word Documents
    if (["doc", "docx"].includes(ext) || fileType?.includes("word") || fileType?.includes("msword")) {
      return (
        <div className="flex flex-col items-center justify-center h-full bg-gray-50 p-8">
          <FileText className="w-20 h-20 text-blue-600 mb-4" />
          <p className="text-gray-700 font-semibold mb-2">Word Document</p>
          <p className="text-gray-600 mb-4 text-center">
            Preview not available for Word documents
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

    // Excel Files
    if (["xls", "xlsx", "csv"].includes(ext) || fileType?.includes("excel") || fileType?.includes("spreadsheet")) {
      return (
        <div className="flex flex-col items-center justify-center h-full bg-gray-50 p-8">
          <File className="w-20 h-20 text-green-600 mb-4" />
          <p className="text-gray-700 font-semibold mb-2">Spreadsheet</p>
          <p className="text-gray-600 mb-4 text-center">
            Preview not available for spreadsheet files
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

    // Default - Unknown File Type
    return (
      <div className="flex flex-col items-center justify-center h-full bg-gray-50 p-8">
        <File className="w-20 h-20 text-gray-400 mb-4" />
        <p className="text-gray-700 font-semibold mb-2">{fileName}</p>
        <p className="text-gray-600 mb-4 text-center">
          Preview not available for this file type
        </p>
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
      {/* Zoom Controls */}
      {(getFileExtension() === "pdf" || ["jpg", "jpeg", "png", "gif", "bmp", "webp"].includes(getFileExtension())) && (
        <div className="flex items-center gap-2 p-3 border-b bg-gray-50">
          <button
            onClick={() => setZoom(Math.max(50, zoom - 25))}
            className="p-2 hover:bg-gray-200 rounded"
            title="Zoom Out"
          >
            <ZoomOut className="w-4 h-4" />
          </button>
          <span className="text-sm font-medium min-w-[60px] text-center">{zoom}%</span>
          <button
            onClick={() => setZoom(Math.min(200, zoom + 25))}
            className="p-2 hover:bg-gray-200 rounded"
            title="Zoom In"
          >
            <ZoomIn className="w-4 h-4" />
          </button>
          <button
            onClick={() => setZoom(100)}
            className="ml-2 px-3 py-1 text-sm bg-gray-200 hover:bg-gray-300 rounded"
          >
            Reset
          </button>
          <div className="flex-1"></div>
          <button
            onClick={handleDownload}
            className="px-3 py-1 bg-blue-600 text-white rounded flex items-center gap-2 hover:bg-blue-700"
          >
            <Download className="w-4 h-4" />
            Download
          </button>
        </div>
      )}

      {/* Preview Area */}
      <div className="flex-1 overflow-auto">
        {renderPreview()}
      </div>
    </div>
  );
}