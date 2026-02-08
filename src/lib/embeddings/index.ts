/**
 * Embeddings module - Central registry for embedding providers
 */

import { GeminiEmbedder } from "./GeminiEmbedder";
import { LocalEmbedder } from "./LocalEmbedder";
import type { Embedder, EmbedderConfig, EmbedderType } from "./types";

// Re-export types
export type { Embedder, EmbedderConfig, EmbedderType };
export { GeminiEmbedder, LocalEmbedder };

// Singleton instances
let currentEmbedder: Embedder | null = null;
let currentType: EmbedderType = "gemini";

/**
 * Factory functions for each embedder type
 */
const embedderFactories: Record<EmbedderType, () => Embedder> = {
    gemini: () => new GeminiEmbedder(),
    local: () => new LocalEmbedder(),
};

/**
 * Get or create an embedder of the specified type
 * If type changes, creates a new instance
 */
export function getEmbedder(type: EmbedderType = "gemini"): Embedder {
    if (!currentEmbedder || currentType !== type) {
        currentType = type;
        currentEmbedder = embedderFactories[type]();
        console.log(`[Embeddings] Created ${type} embedder:`, currentEmbedder.config);
    }
    return currentEmbedder;
}

/**
 * Get the currently active embedder (creates default if none)
 */
export function getCurrentEmbedder(): Embedder {
    return getEmbedder(currentType);
}

/**
 * Get list of available embedder types
 */
export function getAvailableEmbedders(): EmbedderType[] {
    return Object.keys(embedderFactories) as EmbedderType[];
}

/**
 * Get config for a specific embedder type without instantiating
 */
export function getEmbedderConfig(type: EmbedderType): EmbedderConfig {
    // Create temporary instance to get config
    const embedder = embedderFactories[type]();
    return embedder.config;
}
