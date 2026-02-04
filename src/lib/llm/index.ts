export { GeminiProvider } from "./gemini";
export type { LLMProvider, LLMConfig, LLMProviderType, ChatMessage, ChatOptions, ChatResponse } from "./types";

import { LLMProvider, LLMConfig, LLMProviderType } from "./types";
import { GeminiProvider } from "./gemini";

/**
 * Factory function to create an LLM provider
 * Extend this to add new providers (OpenAI, Ollama, etc.)
 */
export function createLLMProvider(
    type: LLMProviderType = "gemini",
    config: LLMConfig = {}
): LLMProvider {
    switch (type) {
        case "gemini":
            return new GeminiProvider(config);
        case "openai":
            // TODO: Implement OpenAI provider
            throw new Error("OpenAI provider not yet implemented");
        case "ollama":
            // TODO: Implement Ollama provider for local LLMs
            throw new Error("Ollama provider not yet implemented");
        default:
            throw new Error(`Unknown LLM provider: ${type}`);
    }
}

// Default singleton instance for convenience
let defaultProvider: LLMProvider | null = null;

export function getDefaultProvider(): LLMProvider {
    if (!defaultProvider) {
        const providerType = (import.meta.env.VITE_LLM_PROVIDER || "gemini") as LLMProviderType;
        defaultProvider = createLLMProvider(providerType);
    }
    return defaultProvider;
}
