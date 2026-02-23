// frontend/src/api/summarizerAPI.ts

const AI_BASE_URL = "http://127.0.0.1:8000";

export interface SingleSummaryResponse {
    file_name: string;
    summary: string;
    error?: string;
}

export interface BatchSummaryResponse {
    overview: string;
    documents: {
        title: string;
        type: string;
        content: string;
    }[];
    error?: string;
}

// API Call 1
export const fetchSingleSummary = async (file: File): Promise<SingleSummaryResponse> => {
    const formData = new FormData();
    formData.append("file", file);

    const response = await fetch(`${AI_BASE_URL}/summarize`, {
        method: "POST",
        body: formData,
    });

    if (!response.ok) throw new Error("Failed to generate summary");
    return response.json();
};

// API Call 2
export const fetchBatchSummary = async (files: File[]): Promise<BatchSummaryResponse> => {
    const formData = new FormData();
    files.forEach(file => formData.append("files", file));

    const response = await fetch(`${AI_BASE_URL}/summarize-batch`, {
        method: "POST",
        body: formData,
    });

    if (!response.ok) throw new Error("Failed to process batch");
    return response.json();
};