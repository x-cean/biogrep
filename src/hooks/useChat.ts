import { useState, useCallback } from "react";
import { getDefaultProvider, ChatMessage, ChatResponse } from "../lib/llm";
import { SearchResult, FileResult, DocResult } from "../types";

/**
 * Search context passed to the LLM for answering questions
 */
export interface SearchContext {
    query: string;
    results: SearchResult[];
    fileResults: FileResult[];
    docResults: DocResult[];
}

/**
 * useChat Hook - Manages chat conversation state with LLM
 * 
 * Provides:
 * - Message history management
 * - Sending messages with search context
 * - Loading and error states
 * - Conversation clearing
 */
export function useChat() {
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    /**
     * Build context string from search results to pass to LLM
     */
    const buildContextString = useCallback((context?: SearchContext): string => {
        if (!context || !context.query) {
            return "";
        }

        const parts: string[] = [];
        parts.push(`User searched for: "${context.query}"`);

        // Add file results (top 10)
        if (context.fileResults.length > 0) {
            parts.push("\n📁 Files found:");
            context.fileResults.slice(0, 10).forEach((f, i) => {
                parts.push(`  ${i + 1}. ${f.path}`);
            });
            if (context.fileResults.length > 10) {
                parts.push(`  ... and ${context.fileResults.length - 10} more files`);
            }
        }

        // Add content results (top 10 with snippets)
        if (context.results.length > 0) {
            parts.push("\n📝 Content matches:");
            context.results.slice(0, 10).forEach((r, i) => {
                // Truncate content to ~150 chars
                const snippet = r.lineContent.length > 150
                    ? r.lineContent.slice(0, 150) + "..."
                    : r.lineContent;
                parts.push(`  ${i + 1}. ${r.path}:${r.lineNumber}`);
                parts.push(`     "${snippet}"`);
            });
            if (context.results.length > 10) {
                parts.push(`  ... and ${context.results.length - 10} more matches`);
            }
        }

        // Add doc results (top 10)
        if (context.docResults.length > 0) {
            parts.push("\n📄 Document matches:");
            context.docResults.slice(0, 10).forEach((d, i) => {
                const snippet = d.lineContent.length > 150
                    ? d.lineContent.slice(0, 150) + "..."
                    : d.lineContent;
                parts.push(`  ${i + 1}. ${d.path} (line ${d.lineNumber})`);
                parts.push(`     "${snippet}"`);
            });
            if (context.docResults.length > 10) {
                parts.push(`  ... and ${context.docResults.length - 10} more documents`);
            }
        }

        return parts.join("\n");
    }, []);

    /**
     * Send a message and get a response from the LLM
     */
    const sendMessage = useCallback(async (
        content: string,
        context?: SearchContext
    ): Promise<void> => {
        if (!content.trim()) return;

        setError(null);
        setIsLoading(true);

        // Add user message to history
        const userMessage: ChatMessage = { role: "user", content };
        const updatedMessages = [...messages, userMessage];
        setMessages(updatedMessages);

        try {
            const provider = getDefaultProvider();

            if (!provider.isConfigured()) {
                setError("LLM not configured. Please set your API key.");
                setIsLoading(false);
                return;
            }

            // Build context string from search results
            const contextString = buildContextString(context);

            const response: ChatResponse = await provider.chat(updatedMessages, {
                context: contextString || undefined,
            });

            if (response.error) {
                setError(response.error);
            } else {
                // Add assistant response to history
                const assistantMessage: ChatMessage = {
                    role: "assistant",
                    content: response.content
                };
                setMessages([...updatedMessages, assistantMessage]);
            }
        } catch (err) {
            console.error("Chat error:", err);
            setError(err instanceof Error ? err.message : "Unknown error");
        } finally {
            setIsLoading(false);
        }
    }, [messages, buildContextString]);

    /**
     * Clear the conversation history
     */
    const clearChat = useCallback(() => {
        setMessages([]);
        setError(null);
    }, []);

    return {
        messages,
        isLoading,
        error,
        sendMessage,
        clearChat,
    };
}
