import { pipeline, env } from "@xenova/transformers";
import { Embedder, EmbedderConfig } from "./types";

// Configure transformers.js to use local cache
env.allowLocalModels = true;
env.useBrowserCache = true;

const MODEL_NAME = "Supabase/gte-small";

/**
 * LocalEmbedder - Generates embeddings using a local ONNX model
 * 
 * Uses the gte-small model (~30MB) which produces 384-dimensional embeddings.
 * The model is downloaded on first use and cached locally.
 */
export class LocalEmbedder implements Embedder {
    readonly config: EmbedderConfig = {
        id: "gte-small",
        dimension: 384,
        name: "Local (gte-small)",
    };

    // Using 'any' due to complex transformers.js pipeline types
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    private embedder: any = null;
    private isLoading = false;
    private loadPromise: Promise<void> | null = null;

    /**
     * Initialize the embedder by loading the model
     * This is called automatically on first embed() call
     */
    async init(): Promise<void> {
        if (this.embedder) return;

        if (this.loadPromise) {
            await this.loadPromise;
            return;
        }

        this.isLoading = true;
        console.log("[LocalEmbedder] Loading model:", MODEL_NAME);

        this.loadPromise = (async () => {
            try {
                // Use feature-extraction pipeline for embeddings
                this.embedder = await pipeline("feature-extraction", MODEL_NAME, {
                    quantized: true, // Use quantized model for faster inference
                });
                console.log("[LocalEmbedder] Model loaded successfully");
            } catch (err) {
                console.error("[LocalEmbedder] Failed to load model:", err);
                throw err;
            } finally {
                this.isLoading = false;
            }
        })();

        await this.loadPromise;
    }

    /**
     * Generate embedding for a single text
     */
    async embed(text: string): Promise<number[]> {
        await this.init();

        if (!this.embedder) {
            throw new Error("Embedder not initialized");
        }

        // Generate embedding
        const result = await this.embedder(text, {
            pooling: "mean",
            normalize: true,
        });

        // Convert tensor to array
        return Array.from(result.data as Float32Array);
    }

    /**
     * Generate embeddings for multiple texts
     */
    async embedBatch(texts: string[]): Promise<number[][]> {
        const embeddings: number[][] = [];

        // Process in small batches to avoid memory issues
        for (const text of texts) {
            const embedding = await this.embed(text);
            embeddings.push(embedding);
        }

        return embeddings;
    }

    /**
     * LocalEmbedder is always configured (no API key needed)
     */
    isConfigured(): boolean {
        return true;
    }

    /**
     * Check if the embedder is ready
     */
    isReady(): boolean {
        return this.embedder !== null;
    }

    /**
     * Check if the model is currently loading
     */
    isModelLoading(): boolean {
        return this.isLoading;
    }
}

// Singleton instance
let embedderInstance: LocalEmbedder | null = null;

export function getEmbedder(): LocalEmbedder {
    if (!embedderInstance) {
        embedderInstance = new LocalEmbedder();
    }
    return embedderInstance;
}
