// frontend/src/api/ragAPI.ts

export const askDocumentQuestion = async (documentId: string, question: string) => {
    const AI_BASE_URL = (import.meta.env.VITE_AI_API_URL || "http://127.0.0.1:8000").replace(/\/$/, "");
    const url = `${AI_BASE_URL}/documents/${documentId}/chat`;

    const response = await fetch(url, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ question: question }),
    });

    if (!response.ok) {
        throw new Error('Failed to get answer from the AI');
    }

    const data = await response.json();
    return data; // Returns { answer: "..." }
};