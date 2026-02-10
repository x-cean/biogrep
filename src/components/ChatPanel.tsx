import { useState, useRef, useEffect, KeyboardEvent } from "react";
import { ChatMessage } from "../lib/llm";
import { SearchContext } from "../hooks/useChat";
import { FocusedFile } from "../types";
import { IndexedFolder } from "../lib/vectorstore";

interface ChatPanelProps {
    messages: ChatMessage[];
    isLoading: boolean;
    error: string | null;
    onSendMessage: (content: string, context?: SearchContext) => Promise<void>;
    onClearChat: () => void;
    searchContext?: SearchContext;
    isCollapsed: boolean;
    onToggleCollapse: () => void;
    focusedFile?: FocusedFile | null;
    onClearFocusedFile?: () => void;
    indexedFolders?: IndexedFolder[];
    activeFolderIds?: number[];
    onToggleFolder?: (folderId: number) => void;
    onSelectAllFolders?: () => void;
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
    focusedFile,
    onClearFocusedFile,
    indexedFolders = [],
    activeFolderIds = [],
    onToggleFolder,
    onSelectAllFolders,
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
            const timer = setTimeout(() => {
                inputRef.current?.focus();
            }, 100);
            return () => clearTimeout(timer);
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

    // Collapsed state - just return the floating button (rendered via portal-like approach in parent)
    if (isCollapsed) {
        return (
            <>
                {/* Floating toggle button - fixed to viewport */}
                <button
                    onClick={onToggleCollapse}
                    className="fixed right-4 bottom-4 z-50 w-12 h-12 bg-blue-600 hover:bg-blue-700 rounded-full shadow-lg flex items-center justify-center text-white transition-all duration-200 hover:scale-105"
                    title="Open chat"
                >
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                    </svg>
                </button>
            </>
        );
    }

    // Expanded state - full chat panel that takes layout space
    return (
        <div className="flex-shrink-0 w-80 h-full flex flex-col bg-gray-800 border-l border-gray-700 relative">
            {/* Header */}
            <div className="flex items-center justify-between px-3 py-2 border-b border-gray-700 flex-shrink-0">
                <div className="flex items-center gap-2 min-w-0 flex-1">
                    <span className="text-sm font-medium text-gray-200 flex-shrink-0">💬 Chat</span>
                    {focusedFile && (
                        <span
                            className="flex items-center gap-1 text-xs bg-blue-900/50 text-blue-300 px-2 py-0.5 rounded truncate"
                            title={focusedFile.path}
                        >
                            📎 {focusedFile.filename}
                            {focusedFile.truncated && (
                                <span className="text-yellow-400" title="File was truncated">⚠️</span>
                            )}
                            {onClearFocusedFile && (
                                <button
                                    onClick={onClearFocusedFile}
                                    className="ml-1 hover:text-white"
                                    title="Clear file context"
                                >
                                    ×
                                </button>
                            )}
                        </span>
                    )}
                    {!focusedFile && searchContext && searchContext.query && (
                        <span
                            className="text-xs text-gray-500 truncate"
                            title={`Context: ${searchContext.query}`}
                        >
                            • {searchContext.query}
                        </span>
                    )}
                </div>
                <div className="flex items-center gap-1 flex-shrink-0 ml-2">
                    {messages.length > 0 && (
                        <button
                            onClick={onClearChat}
                            className="p-1.5 text-gray-400 hover:text-gray-200 hover:bg-gray-700 rounded transition-colors"
                            title="Clear conversation"
                        >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                        </button>
                    )}
                    <button
                        onClick={onToggleCollapse}
                        className="p-1.5 text-gray-400 hover:text-gray-200 hover:bg-gray-700 rounded transition-colors"
                        title="Close chat"
                    >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>
            </div>

            {/* Folder selector - only show when >1 folder is indexed */}
            {indexedFolders.length > 1 && (
                <div className="px-3 py-1.5 border-b border-gray-700 flex-shrink-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                        <button
                            onClick={onSelectAllFolders}
                            className={`px-2 py-0.5 rounded-full text-xs transition-colors ${activeFolderIds.length === 0
                                    ? "bg-blue-600 text-white"
                                    : "bg-gray-700 text-gray-400 hover:bg-gray-600"
                                }`}
                        >
                            All
                        </button>
                        {indexedFolders.map((folder) => {
                            const isActive = activeFolderIds.includes(folder.id);
                            const label = folder.label || folder.path.split("/").pop() || folder.path;
                            return (
                                <button
                                    key={folder.id}
                                    onClick={() => onToggleFolder?.(folder.id)}
                                    className={`px-2 py-0.5 rounded-full text-xs transition-colors truncate max-w-[120px] ${isActive
                                            ? "bg-blue-600 text-white"
                                            : "bg-gray-700 text-gray-400 hover:bg-gray-600"
                                        }`}
                                    title={folder.path}
                                >
                                    📁 {label}
                                </button>
                            );
                        })}
                    </div>
                </div>
            )}

            {/* Messages area */}
            <div className="flex-1 overflow-y-auto p-3 space-y-3 min-h-0">
                {messages.length === 0 && (
                    <div className="text-center text-gray-500 text-sm py-8">
                        <div className="w-12 h-12 mx-auto mb-3 rounded-full bg-gray-700 flex items-center justify-center">
                            <svg className="w-6 h-6 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                            </svg>
                        </div>
                        <p className="font-medium text-gray-400">Ask about your files</p>
                        {searchContext && searchContext.query ? (
                            <p className="mt-2 text-xs text-gray-600">
                                Try: "Summarize these results" or<br />"Which file is most relevant?"
                            </p>
                        ) : (
                            <p className="mt-2 text-xs text-gray-600">
                                Search for something first,<br />then ask questions here
                            </p>
                        )}
                    </div>
                )}

                {messages.map((message, index) => (
                    <MessageBubble key={index} message={message} />
                ))}

                {isLoading && (
                    <div className="flex items-center gap-2 text-gray-400 text-sm py-2">
                        <div className="flex gap-1">
                            <span className="w-2 h-2 bg-blue-500 rounded-full animate-bounce" style={{ animationDelay: "0ms" }}></span>
                            <span className="w-2 h-2 bg-blue-500 rounded-full animate-bounce" style={{ animationDelay: "150ms" }}></span>
                            <span className="w-2 h-2 bg-blue-500 rounded-full animate-bounce" style={{ animationDelay: "300ms" }}></span>
                        </div>
                        <span>Thinking...</span>
                    </div>
                )}

                {error && (
                    <div className="bg-red-900/30 border border-red-700 rounded-lg p-3 text-sm text-red-300">
                        <div className="flex items-start gap-2">
                            <svg className="w-4 h-4 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                            <span>{error}</span>
                        </div>
                    </div>
                )}

                <div ref={messagesEndRef} />
            </div>

            {/* Input area */}
            <div className="border-t border-gray-700 p-3 flex-shrink-0">
                <div className="flex gap-2">
                    <textarea
                        ref={inputRef}
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        onKeyDown={handleKeyDown}
                        placeholder="Ask about your files..."
                        disabled={isLoading}
                        className="flex-1 bg-gray-700 text-white rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 placeholder-gray-500"
                        rows={2}
                    />
                    <button
                        onClick={handleSend}
                        disabled={!input.trim() || isLoading}
                        className="px-3 self-end bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 disabled:cursor-not-allowed rounded-lg text-white transition-colors h-10"
                        title="Send message (Enter)"
                    >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                        </svg>
                    </button>
                </div>
                <p className="text-xs text-gray-600 mt-1.5 px-1">
                    Enter to send • Shift+Enter for new line
                </p>
            </div>

            {/* Floating close button at bottom-right of panel */}
            <button
                onClick={onToggleCollapse}
                className="absolute right-4 bottom-20 z-10 w-10 h-10 bg-gray-600 hover:bg-gray-500 rounded-full shadow-lg flex items-center justify-center text-white transition-all duration-200 hover:scale-105"
                title="Close chat"
            >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
            </button>
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
                className={`max-w-[90%] rounded-lg px-3 py-2 text-sm shadow-sm ${isUser
                    ? "bg-blue-600 text-white rounded-br-sm"
                    : "bg-gray-700 text-gray-100 rounded-bl-sm"
                    }`}
            >
                <div className="whitespace-pre-wrap break-words leading-relaxed">
                    {message.content}
                </div>
            </div>
        </div>
    );
}
