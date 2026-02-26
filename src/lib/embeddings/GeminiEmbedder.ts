/**
 * GeminiEmbedder - Generates embeddings using Gemini API
 * 
 * Uses the gemini-embedding-001 model which produces 3072-dimensional embeddings.
 * Falls back to a simpler approach if API is not configured.
 */

import { Embedder, EmbedderConfig } from "./types";

const GEMINI_API_URL = "https://generativelanguage.googleapis.com/v1beta/models";
const EMBEDDING_MODEL = "gemini-embedding-001";

export class GeminiEmbedder implements Embedder {
    readonly config: EmbedderConfig = {
        id: EMBEDDING_MODEL,
        dimension: 3072,
        name: "Gemini",
    };

    private apiKey: string;

    constructor() {
        this.apiKey = import.meta.env.VITE_GEMINI_API_KEY || "";
    }

    /**
     * Check if the embedder is configured
     */
    isConfigured(): boolean {
        return Boolean(this.apiKey);
    }

    /**
     * Generate embedding for a single text
     */
    async embed(text: string): Promise<number[]> {
        if (!this.isConfigured()) {
            console.warn("[GeminiEmbedder] API key not configured, using fallback");
            return this.fallbackEmbed(text);
        }

        try {
            const response = await fetch(
                `${GEMINI_API_URL}/${EMBEDDING_MODEL}:embedContent?key=${this.apiKey}`,
                {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        model: `models/${EMBEDDING_MODEL}`,
                        content: {
                            parts: [{ text }]
                        }
                    }),
                }
            );

            if (!response.ok) {
                const errorText = await response.text();
                console.error("[GeminiEmbedder] API error:", response.status, errorText);
                return this.fallbackEmbed(text);
            }

            const data = await response.json();
            const embedding = data.embedding?.values;

            if (!embedding || !Array.isArray(embedding)) {
                console.error("[GeminiEmbedder] Invalid response:", data);
                return this.fallbackEmbed(text);
            }

            return embedding;
        } catch (err) {
            console.error("[GeminiEmbedder] Error:", err);
            return this.fallbackEmbed(text);
        }
    }

    /**
     * Simple fallback embedding using character-based hashing
     * This is NOT semantic, just for testing when API is unavailable
     */
    private fallbackEmbed(text: string): number[] {
        // Create a simple 3072-dim vector based on text characteristics
        // This is for fallback only - not semantically meaningful
        const dim = 3072;  // Match Gemini gemini-embedding-001 dimension
        const embedding = new Array(dim).fill(0);

        const normalized = text.toLowerCase().trim();
        for (let i = 0; i < normalized.length; i++) {
            const charCode = normalized.charCodeAt(i);
            const idx = (charCode * (i + 1)) % dim;
            embedding[idx] += 1 / (normalized.length || 1);
        }

        // Normalize
        const magnitude = Math.sqrt(embedding.reduce((sum, v) => sum + v * v, 0)) || 1;
        return embedding.map(v => v / magnitude);
    }

    /**
     * Generate embeddings for multiple texts using the batch API.
     * Processes in sub-batches of up to BATCH_SIZE texts per API call.
     * Falls back to individual embed() calls if the batch API fails.
     */
    async embedBatch(texts: string[]): Promise<number[][]> {
        if (texts.length === 0) return [];
        if (texts.length === 1) return [await this.embed(texts[0])];

        if (!this.isConfigured()) {
            console.warn("[GeminiEmbedder] API key not configured, using fallback for batch");
            return texts.map(t => this.fallbackEmbed(t));
        }

        const BATCH_SIZE = 100; // Gemini batch limit
        const allEmbeddings: number[][] = [];

        for (let i = 0; i < texts.length; i += BATCH_SIZE) {
            const batch = texts.slice(i, i + BATCH_SIZE);

            try {
                const batchEmbeddings = await this.batchEmbedAPI(batch);
                allEmbeddings.push(...batchEmbeddings);
            } catch (err) {
                console.warn(`[GeminiEmbedder] Batch API failed for sub-batch ${i}-${i + batch.length}, falling back to individual calls:`, err);
                // Fallback: embed individually
                for (const text of batch) {
                    const embedding = await this.embed(text);
                    allEmbeddings.push(embedding);
                }
            }
        }

        return allEmbeddings;
    }

    /**
     * Call the Gemini batchEmbedContents REST endpoint.
     * Sends up to 100 texts in a single API call.
     */
    private async batchEmbedAPI(texts: string[]): Promise<number[][]> {
        const requests = texts.map(text => ({
            model: `models/${EMBEDDING_MODEL}`,
            content: {
                parts: [{ text }]
            }
        }));

        const response = await fetch(
            `${GEMINI_API_URL}/${EMBEDDING_MODEL}:batchEmbedContents?key=${this.apiKey}`,
            {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ requests }),
            }
        );

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Batch embed API error ${response.status}: ${errorText}`);
        }

        const data = await response.json();
        const embeddings: number[][] = data.embeddings?.map(
            (e: { values: number[] }) => e.values
        );

        if (!embeddings || embeddings.length !== texts.length) {
            throw new Error(
                `Batch embed returned ${embeddings?.length ?? 0} embeddings for ${texts.length} texts`
            );
        }

        console.log(`[GeminiEmbedder] Batch embedded ${texts.length} texts in one API call`);
        return embeddings;
    }
}

// Singleton instance
let embedderInstance: GeminiEmbedder | null = null;

export function getEmbedder(): GeminiEmbedder {
    if (!embedderInstance) {
        embedderInstance = new GeminiEmbedder();
    }
    return embedderInstance;
}
