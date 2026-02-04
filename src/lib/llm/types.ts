/**
 * LLM Provider abstraction layer for query expansion and chat
 * Supports multiple backends: Gemini, OpenAI, Ollama, etc.
 */

// ============ CHAT TYPES ============

export interface ChatMessage {
    role: "user" | "assistant" | "system";
    content: string;
}

export interface ChatOptions {
    /** System prompt to set assistant behavior */
    systemPrompt?: string;
    /** Additional context (e.g., search results) to include */
    context?: string;
    /** Maximum tokens in response */
    maxTokens?: number;
    /** Temperature for response generation (0-1) */
    temperature?: number;
}

export interface ChatResponse {
    content: string;
    error?: string;
}

// ============ PROVIDER INTERFACE ============

export interface LLMProvider {
    /**
     * Expand a search query into related terms
     * @param query - The original search query
     * @returns Array of related search terms (excluding the original)
     */
    expandQuery(query: string): Promise<string[]>;

    /**
     * Send a chat message and get a response
     * @param messages - Conversation history
     * @param options - Chat configuration options
     * @returns Assistant response
     */
    chat(messages: ChatMessage[], options?: ChatOptions): Promise<ChatResponse>;

    /**
     * Check if the provider is properly configured
     */
    isConfigured(): boolean;
}

// ============ CONFIG TYPES ============

export interface LLMConfig {
    apiKey?: string;
    baseUrl?: string;
    model?: string;
}

export type LLMProviderType = "gemini" | "openai" | "ollama";
