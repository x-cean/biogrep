/**
 * LLM Provider abstraction layer for query expansion
 * Supports multiple backends: Gemini, OpenAI, Ollama, etc.
 */

export interface LLMProvider {
    /**
     * Expand a search query into related terms
     * @param query - The original search query
     * @returns Array of related search terms (excluding the original)
     */
    expandQuery(query: string): Promise<string[]>;

    /**
     * Check if the provider is properly configured
     */
    isConfigured(): boolean;
}

export interface LLMConfig {
    apiKey?: string;
    baseUrl?: string;
    model?: string;
}

export type LLMProviderType = "gemini" | "openai" | "ollama";
