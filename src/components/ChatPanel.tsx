import { useState, useRef, useEffect, KeyboardEvent } from "react";
import { ChatMessage } from "../lib/llm";
import { SearchContext } from "../hooks/useChat";

interface ChatPanelProps {
    messages: ChatMessage[];
    isLoading: boolean;
    error: string | null;
    onSendMessage: (content: string, context?: SearchContext) => Promise<void>;
    onClearChat: () => void;
    searchContext?: SearchContext;
    isCollapsed: boolean;
    onToggleCollapse: () => void;
}

export function ChatPanel({
    messages,
    isLoading,
    error,
    onSendMessage,
    onClearChat,
    searchContext,
    isCollapsed,
    onToggleCollapse,
}: ChatPanelProps) {
    const [input, setInput] = useState("");
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLTextAreaElement>(null);

    // Auto-scroll to bottom when new messages arrive
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [messages]);

    // Focus input when panel opens
    useEffect(() => {
        if (!isCollapsed) {
            inputRef.current?.focus();
        }
    }, [isCollapsed]);

    const handleSend = async () => {
        if (!input.trim() || isLoading) return;

        const message = input;
        setInput("");
        await onSendMessage(message, searchContext);
    };

    const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            handleSend();
        }
    };

    // Collapsed state - show toggle button only
    if (isCollapsed) {
        return (
            <button
                onClick={onToggleCollapse}
                className="fixed right-4 bottom-4 w-12 h-12 bg-blue-600 hover:bg-blue-700 rounded-full shadow-lg flex items-center justify-center text-white transition-colors"
                title="Open chat"
            >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                </svg>
            </button>
        );
    }

    return (
        <div className="w-80 border-l border-gray-700 flex flex-col bg-gray-850">
            {/* Header */}
            <div className="flex items-center justify-between px-3 py-2 border-b border-gray-700 bg-gray-800">
                <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-gray-200">💬 Chat</span>
                    {searchContext && searchContext.query && (
                        <span className="text-xs text-gray-500 truncate max-w-32" title={`Context: ${searchContext.query}`}>
                            • {searchContext.query}
                        </span>
                    )}
                </div>
                <div className="flex items-center gap-1">
                    {messages.length > 0 && (
                        <button
                            onClick={onClearChat}
                            className="p-1 text-gray-400 hover:text-gray-200 transition-colors"
                            title="Clear conversation"
                        >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                        </button>
                    )}
                    <button
                        onClick={onToggleCollapse}
                        className="p-1 text-gray-400 hover:text-gray-200 transition-colors"
                        title="Close chat"
                    >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-3 space-y-3">
                {messages.length === 0 && (
                    <div className="text-center text-gray-500 text-sm py-8">
                        <p>Ask questions about your search results</p>
                        {searchContext && searchContext.query ? (
                            <p className="mt-2 text-xs">
                                Try: "What are these files about?" or "Summarize the matches"
                            </p>
                        ) : (
                            <p className="mt-2 text-xs">
                                Search for something first, then ask questions here
                            </p>
                        )}
                    </div>
                )}

                {messages.map((message, index) => (
                    <MessageBubble key={index} message={message} />
                ))}

                {isLoading && (
                    <div className="flex items-center gap-2 text-gray-400 text-sm">
                        <div className="animate-pulse">●</div>
                        <span>Thinking...</span>
                    </div>
                )}

                {error && (
                    <div className="bg-red-900/30 border border-red-700 rounded-lg p-2 text-sm text-red-300">
                        {error}
                    </div>
                )}

                <div ref={messagesEndRef} />
            </div>

            {/* Input */}
            <div className="border-t border-gray-700 p-2">
                <div className="flex gap-2">
                    <textarea
                        ref={inputRef}
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        onKeyDown={handleKeyDown}
                        placeholder="Ask about your files..."
                        disabled={isLoading}
                        className="flex-1 bg-gray-700 text-white rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
                        rows={2}
                    />
                    <button
                        onClick={handleSend}
                        disabled={!input.trim() || isLoading}
                        className="px-3 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 disabled:cursor-not-allowed rounded-lg text-white transition-colors"
                        title="Send message"
                    >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                        </svg>
                    </button>
                </div>
                <p className="text-xs text-gray-500 mt-1 px-1">
                    Press Enter to send, Shift+Enter for new line
                </p>
            </div>
        </div>
    );
}

/**
 * Individual message bubble component
 */
function MessageBubble({ message }: { message: ChatMessage }) {
    const isUser = message.role === "user";

    return (
        <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
            <div
                className={`max-w-[85%] rounded-lg px-3 py-2 text-sm ${isUser
                        ? "bg-blue-600 text-white"
                        : "bg-gray-700 text-gray-100"
                    }`}
            >
                <div className="whitespace-pre-wrap break-words">
                    {message.content}
                </div>
            </div>
        </div>
    );
}
