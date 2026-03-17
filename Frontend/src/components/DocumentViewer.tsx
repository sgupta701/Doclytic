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
  const [resolvedFileName, setResolvedFileName] = useState<string>(fileName);
  const [resolvedFileType, setResolvedFileType] = useState<string>(fileType || "");

  useEffect(() => {
    loadDocument();
    return () => {
      if (viewUrl.startsWith("blob:")) {
        URL.revokeObjectURL(viewUrl);
      }
    };
  }, [fileUrl, fileId, pythonFileId, fileName, fileType]);

  const getFilenameFromContentDisposition = (contentDisposition: string | null) => {
    if (!contentDisposition) return "";
    const utf8Match = contentDisposition.match(/filename\*=UTF-8''([^;]+)/i);
    if (utf8Match?.[1]) {
      try {
        return decodeURIComponent(utf8Match[1]).replace(/^["']|["']$/g, "");
      } catch {
        return utf8Match[1].replace(/^["']|["']$/g, "");
      }
    }
    const asciiMatch = contentDisposition.match(/filename="?([^";]+)"?/i);
    return asciiMatch?.[1] || "";
  };

  const getPythonBlobData = async (pyId: string) => {
    let metadataFilename = "";
    let metadataType = "";
    try {
      const metadataRes = await fetch(`${AI_BASE_URL}/documents/${pyId}`);
      if (metadataRes.ok) {
        const metadata = await metadataRes.json();
        metadataFilename = metadata?.filename || "";
        metadataType = metadata?.metadata?.content_type || "";
      }
    } catch {
      // Metadata endpoint is optional for preview and can be skipped on failure.
    }

    const res = await fetch(`${AI_BASE_URL}/documents/${pyId}/download`);
    if (!res.ok) throw new Error("Failed to fetch DB-backed file");

    const blob = await res.blob();
    const headerFilename = getFilenameFromContentDisposition(res.headers.get("content-disposition"));
    const filename = headerFilename || metadataFilename || fileName || "document";
    const contentType =
      res.headers.get("content-type") || blob.type || metadataType || "application/octet-stream";

    return {
      blobUrl: URL.createObjectURL(blob),
      filename,
      contentType,
    };
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
    setResolvedFileName(fileName);
    setResolvedFileType(fileType || "");

    try {
      if (fileUrl) {
        setViewUrl(fileUrl);
        setResolvedFileName(fileName);
        setResolvedFileType(fileType || "");
        setLoading(false);
        return;
      }

      if (fileId) {
        if (isGmailAttachment) {
          const res = await authFetch(`${API_URL}/mail/download/${fileId}`);
          if (!res.ok) throw new Error("Failed to load document");
          const blob = await res.blob();
          const contentType = res.headers.get("content-type") || blob.type || fileType || "";
          const resolvedName =
            getFilenameFromContentDisposition(res.headers.get("content-disposition")) ||
            fileName;
          setResolvedFileName(resolvedName);
          setResolvedFileType(contentType);
          setViewUrl(URL.createObjectURL(blob));
        } else {
          const res = await authFetch(`${API_URL}/documents/${fileId}`);
          if (!res.ok) throw new Error("Failed to load document");
          const data = await res.json();
          const resolvedPythonId = pythonFileId || data.python_file_id;
          if (resolvedPythonId) {
            const blobData = await getPythonBlobData(resolvedPythonId);
            setViewUrl(blobData.blobUrl);
            setResolvedFileName(blobData.filename || data.title || fileName);
            setResolvedFileType(blobData.contentType || data.file_type || fileType || "");
            return;
          }
          const fileRes = await authFetch(`${API_URL}/documents/${fileId}/download`);
          if (!fileRes.ok) throw new Error("Failed to fetch document bytes");
          const blob = await fileRes.blob();
          const contentType = fileRes.headers.get("content-type") || blob.type || data.file_type || fileType || "";
          const resolvedName =
            getFilenameFromContentDisposition(fileRes.headers.get("content-disposition")) ||
            data.title ||
            fileName;
          setResolvedFileName(resolvedName);
          setResolvedFileType(contentType);
          setViewUrl(URL.createObjectURL(blob));
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
        let downloadName = resolvedFileName || fileName;
        if (isGmailAttachment) {
          const res = await authFetch(`${API_URL}/mail/download/${fileId}`);
          if (!res.ok) throw new Error("Failed to download file");
          const blob = await res.blob();
          downloadUrl = URL.createObjectURL(blob);
          downloadName =
            getFilenameFromContentDisposition(res.headers.get("content-disposition")) ||
            downloadName;
        } else {
          const res = await authFetch(`${API_URL}/documents/${fileId}`);
          if (!res.ok) throw new Error("Failed to load document metadata");
          const data = await res.json();
          const resolvedPythonId = pythonFileId || data.python_file_id;
          if (resolvedPythonId) {
            const blobData = await getPythonBlobData(resolvedPythonId);
            downloadUrl = blobData.blobUrl;
            downloadName = blobData.filename || downloadName;
          } else {
            const fileRes = await authFetch(`${API_URL}/documents/${fileId}/download`);
            if (!fileRes.ok) throw new Error("Failed to download file");
            const blob = await fileRes.blob();
            downloadUrl = URL.createObjectURL(blob);
            downloadName =
              getFilenameFromContentDisposition(fileRes.headers.get("content-disposition")) ||
              data.title ||
              downloadName;
          }
        }
        const a = document.createElement("a");
        a.href = downloadUrl;
        a.download = downloadName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
      }
    } catch (err) {
      console.error("Download error:", err);
      alert("Failed to download file");
    }
  };

  const mimeTypeToExtension: Record<string, string> = {
    "application/pdf": "pdf",
    "application/msword": "doc",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
    "application/vnd.ms-excel": "xls",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
    "text/csv": "csv",
    "application/vnd.ms-powerpoint": "ppt",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation": "pptx",
    "text/plain": "txt",
    "application/json": "json",
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/gif": "gif",
    "image/webp": "webp",
    "audio/mpeg": "mp3",
    "audio/wav": "wav",
    "video/mp4": "mp4",
  };

  const getFileExtension = (): string => {
    const effectiveType = (resolvedFileType || fileType || "").toLowerCase().trim();
    if (effectiveType) {
      if (mimeTypeToExtension[effectiveType]) return mimeTypeToExtension[effectiveType];
      if (!effectiveType.includes("/")) return effectiveType;
    }

    const effectiveFileName = resolvedFileName || fileName;
    if (effectiveFileName && effectiveFileName.includes(".")) {
      const ext = effectiveFileName.split(".").pop()?.toLowerCase();
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
    const effectiveType = (resolvedFileType || fileType || "").toLowerCase();

    // PDF
    if (ext === "pdf" || effectiveType.includes("pdf")) {
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
    if (["jpg", "jpeg", "png", "gif", "bmp", "webp", "svg"].includes(ext) || effectiveType.includes("image")) {
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
    if (["mp4", "webm", "ogg", "mov", "mkv", "avi"].includes(ext) || effectiveType.includes("video")) {
      return (
        <div className="flex items-center justify-center h-full bg-black">
          <video src={viewUrl} controls className="max-w-full max-h-full">
            Your browser does not support video playback.
          </video>
        </div>
      );
    }

    // Audio
    if (["mp3", "wav", "ogg", "m4a", "aac", "flac"].includes(ext) || effectiveType.includes("audio")) {
      return (
        <div className="flex flex-col items-center justify-center h-full bg-gray-50 gap-4">
          <div className="w-24 h-24 rounded-full bg-blue-100 flex items-center justify-center">
            <svg className="w-12 h-12 text-blue-600" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 3v10.55A4 4 0 1 0 14 17V7h4V3h-6z" />
            </svg>
          </div>
          <p className="text-gray-700 font-medium">{resolvedFileName || fileName}</p>
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
    if (["doc", "docx"].includes(ext) || effectiveType.includes("word") || effectiveType.includes("msword")) {
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
    if (["xls", "xlsx", "csv"].includes(ext) || effectiveType.includes("excel") || effectiveType.includes("spreadsheet")) {
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
    if (["ppt", "pptx"].includes(ext) || effectiveType.includes("presentation")) {
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
        <p className="text-gray-700 font-semibold mb-2">{resolvedFileName || fileName}</p>
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
