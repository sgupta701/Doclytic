import React, { useState } from 'react';
import { SendHorizontal, Sparkles } from 'lucide-react';
import { askDocumentQuestion } from '../api/ragAPI';

interface DocumentChatProps {
    documentId: string;
}

const DocumentChat: React.FC<DocumentChatProps> = ({ documentId }) => {
    const [messages, setMessages] = useState<{ sender: 'user' | 'ai', text: string }[]>([]);
    const [inputValue, setInputValue] = useState('');
    const [isLoading, setIsLoading] = useState(false);

    const handleSend = async () => {
        if (!inputValue.trim()) return;

        const userMessage = inputValue;

        setMessages(prev => [...prev, { sender: 'user', text: userMessage }]);
        setInputValue('');
        setIsLoading(true);

        try {
            const response = await askDocumentQuestion(documentId, userMessage);
            const answer = response?.answer || response?.message || "I couldn't get a reply from the assistant.";
            setMessages(prev => [...prev, { sender: 'ai', text: answer }]);
        } catch (error) {
            console.error("Chat error:", error);
            setMessages(prev => [...prev, { sender: 'ai', text: "Sorry, I encountered an error connecting to the AI server." }]);
        } finally {
            setIsLoading(false);
        }
    };

    const handleKeyPress = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter') {
            handleSend();
        }
    };

    return (
        <div className="flex h-full w-full flex-col bg-[linear-gradient(180deg,_#ffffff_0%,_#f8fbff_100%)] dark:bg-[linear-gradient(180deg,_#1e293b_0%,_#0f172a_100%)]">
            <div className="border-b border-slate-200 dark:border-slate-800 dark:bg-slate-950/90 bg-white/90 px-5 py-4 backdrop-blur">
                <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-blue-100 dark:bg-blue-900 dark:text-blue-300 text-blue-700">
                        <Sparkles className="h-5 w-5" />
                    </div>
                    <div>
                        <p className="text-xs font-semibold uppercase tracking-[0.18em] dark:text-emerald-400 text-emerald-600">Assistant Ready</p>
                        <div className="font-semibold text-gray-800 dark:text-gray-200 flex items-center gap-2">
                            <span className="h-2 w-2 rounded-full bg-green-500"></span>
                            AI Document Assistant
                        </div>
                    </div>
                </div>
            </div>
            
            <div className="flex-1 min-h-0 overflow-y-auto px-4 py-5 sm:px-5">
                {messages.length === 0 ? (
                    <div className="mt-8 rounded-3xl border border-dashed border-slate-200 dark:border-slate-800 dark:bg-slate-950/60 bg-white/90 p-6 text-center shadow-sm">
                        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-50 dark:bg-blue-900 dark:text-blue-400 text-blue-600">
                            <Sparkles className="h-5 w-5" />
                        </div>
                        <p className="text-sm font-medium text-slate-700 dark:text-slate-300">Ask me anything about this document</p>
                        <p className="mt-2 text-sm text-slate-400 dark:text-slate-600">
                            Try asking for a summary, important dates, risks, or action items.
                        </p>
                    </div>
                ) : (
                    <div className="flex flex-col gap-4">
                    {messages.map((msg, idx) => (
                        <div key={idx} className={`flex ${msg.sender === 'user' ? 'justify-end' : 'justify-start'}`}>
                            <div className={`max-w-[88%] rounded-2xl p-3 text-sm shadow-sm ${
                                msg.sender === 'user' 
                                ? 'rounded-br-none bg-blue-600 dark:bg-blue-400 dark:text-gray-950 text-white' 
                                : 'rounded-bl-none border border-slate-200 dark:border-slate-800 dark:bg-slate-950 bg-white dark:text-slate-200 text-slate-800'
                            }`}>
                                {msg.text}
                            </div>
                        </div>
                    ))}
                    </div>
                )}
                {isLoading && (
                    <div className="mt-4 flex justify-start">
                        <div className="animate-pulse rounded-2xl rounded-bl-none border border-slate-200 dark:border-slate-800 dark:bg-gray-950 bg-white p-3 text-sm text-slate-500 dark:text-slate-400 shadow-sm">
                            Thinking...
                        </div>
                    </div>
                )}
            </div>

            <div className="border-t border-slate-200 dark:border-slate-800 dark:bg-gray-950/90 bg-white/95 p-4 backdrop-blur">
                <div className="flex gap-2 rounded-2xl border border-slate-200 dark:border-slate-800 dark:bg-gray-950 bg-slate-50 p-2 shadow-inner">
                <input
                    type="text"
                    value={inputValue}
                    onChange={(e) => setInputValue(e.target.value)}
                    onKeyDown={handleKeyPress}
                    placeholder="Ask a question..."
                    className="flex-1 rounded-xl bg-transparent px-3 py-2 text-sm text-slate-700 dark:text-slate-300 outline-none placeholder:text-slate-400 dark:placeholder:text-slate-600"
                    disabled={isLoading}
                />
                <button
                    onClick={handleSend}
                    disabled={isLoading || !inputValue.trim()}
                    className="inline-flex items-center gap-2 rounded-xl bg-blue-600 dark:bg-blue-400 px-4 py-2 text-sm font-medium text-white dark:text-gray-950 transition-colors hover:bg-blue-700 dark:hover:bg-blue-300 disabled:opacity-50"
                >
                    <SendHorizontal className="h-4 w-4" />
                    Send
                </button>
                </div>
            </div>
        </div>
    );
};

export default DocumentChat;
