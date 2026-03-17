import { useState } from "react";
import { useNavigate } from "react-router-dom";
import DashboardLayout from "../components/DashboardLayout";
import { Upload } from "lucide-react";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:5000";
const AI_BASE_URL = import.meta.env.VITE_AI_API_URL || "http://127.0.0.1:8000";

interface IngestResponse {
  summary?: string;
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
    escalation?: { applied?: boolean; reason?: string };
    engine_version?: string;
  };
}

// --- UNIVERSAL AUTH FETCH (fixes 401 for Google + email login) ---
async function authFetch(url: string, options: RequestInit = {}) {
  const token = localStorage.getItem("token");

  const headers: any = {
    ...(options.headers || {}),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };

  return fetch(url, {
    ...options,
    headers,
    credentials: "include",
  });
}

export default function DocumentUpload() {
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [summary, setSummary] = useState("");
  const [loading, setLoading] = useState(false);

  const navigate = useNavigate();

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.[0]) setFile(e.target.files[0]);
  };

  const handleUpload = async () => {
    if (!file || !title) {
      alert("Please select a file and enter a title.");
      return;
    }

    setLoading(true);

    const formData = new FormData();
    formData.append("file", file);
    formData.append("title", title);
    formData.append("summary", summary);

    try {
      const res = await authFetch(`${API_URL}/api/documents`, {
        method: "POST",
        body: formData, // IMPORTANT: do NOT add content-type manually
      });

      if (res.ok) {
        const uploadedDoc = await res.json();

        try {
          const aiFormData = new FormData();
          aiFormData.append("file", file);
          const aiRes = await fetch(`${AI_BASE_URL}/ingest`, {
            method: "POST",
            body: aiFormData,
          });

          if (aiRes.ok) {
            const aiData = (await aiRes.json()) as IngestResponse;
            const priorityLevel = aiData.priority?.priority_level || "Medium";
            const urgencyFromPriority =
              priorityLevel === "Critical" || priorityLevel === "High"
                ? "high"
                : priorityLevel === "Medium"
                ? "medium"
                : "low";

            await authFetch(`${API_URL}/api/documents/${uploadedDoc._id}`, {
              method: "PUT",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                summary: aiData.summary || summary,
                urgency: urgencyFromPriority,
                ...(aiData.extraction ? { extraction: aiData.extraction } : {}),
                ...(aiData.priority ? { priority: aiData.priority } : {}),
              }),
            });
          }
        } catch (aiErr) {
          console.error("Post-upload priority processing failed:", aiErr);
        }

        alert("Document uploaded successfully!");
        navigate("/dashboard");
      } else {
        const data = await res.json();
        alert(`Upload failed: ${data.message}`);
      }

    } catch (err) {
      console.error("Upload error:", err);
      alert("Error uploading document.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <DashboardLayout>
      <div className="p-8 max-w-xl mx-auto">
        <h1 className="text-2xl font-bold mb-4">Upload Document</h1>

        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-1">Title</label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="w-full border border-gray-300 rounded-lg p-2"
          />
        </div>

        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-1">Summary</label>
          <textarea
            value={summary}
            onChange={(e) => setSummary(e.target.value)}
            className="w-full border border-gray-300 rounded-lg p-2"
            rows={3}
          />
        </div>

        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-1">Select File</label>
          <input type="file" onChange={handleFileChange} />
        </div>

        <button
          onClick={handleUpload}
          className="flex items-center space-x-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          disabled={loading}
        >
          <Upload className="w-4 h-4" />
          <span>{loading ? "Uploading..." : "Upload Document"}</span>
        </button>
      </div>
    </DashboardLayout>
  );
}
