/**
 * Embedding system types and interfaces
 */

/**
 * Configuration for an embedding model
 */
export interface EmbedderConfig {
    /** Unique identifier for the model (used in DB filename) */
    id: string;
    /** Dimension of the embedding vectors */
    dimension: number;
    /** Human-readable display name */
    name: string;
}

/**
 * Common interface for all embedders
 */
export interface Embedder {
    /** Model configuration including id, dimension, and name */
    readonly config: EmbedderConfig;

    /** Check if the embedder is properly configured (e.g., API key set) */
    isConfigured(): boolean;

    /** Generate embedding for a single text */
    embed(text: string): Promise<number[]>;

    /** Generate embeddings for multiple texts in a single batch call */
    embedBatch(texts: string[]): Promise<number[][]>;
}

/**
 * Available embedder types
 * Add new types here when implementing additional embedders
 */
export type EmbedderType = "gemini" | "local";
