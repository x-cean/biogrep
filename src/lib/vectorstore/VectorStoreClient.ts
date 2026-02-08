import { invoke } from "@tauri-apps/api/core";

/**
 * Vector search result from the Rust backend
 */
export interface VectorSearchResult {
    id: number;
    path: string;
    chunk_index: number;
    content: string;
    distance: number;
}

/**
 * VectorStore client - TypeScript bindings for Rust vector store commands
 * 
 * Each embedder model gets its own database file to prevent dimension mismatch.
 */
export class VectorStoreClient {
    private initialized = false;
    private dbPath: string | null = null;
    private currentModelId: string | null = null;

    /**
     * Initialize the vector store for a specific embedding model.
     * @param modelId - Unique identifier for the embedding model (used in DB filename)
     * @param dimension - Dimension of the embedding vectors
     * @returns Path to the database file
     */
    async init(modelId: string, dimension: number): Promise<string> {
        // If already initialized with same model, return cached path
        if (this.initialized && this.currentModelId === modelId) {
            return this.dbPath!;
        }

        // Re-initialize if model changed
        if (this.initialized && this.currentModelId !== modelId) {
            console.log(`[VectorStore] Model changed from ${this.currentModelId} to ${modelId}, reinitializing`);
            this.initialized = false;
        }

        this.dbPath = await invoke<string>("init_vectorstore", { modelId, dimension });
        this.currentModelId = modelId;
        this.initialized = true;
        console.log(`[VectorStore] Initialized for model "${modelId}" (${dimension}d) at:`, this.dbPath);
        return this.dbPath;
    }

    /**
     * Get the current model ID this store is initialized for
     */
    getModelId(): string | null {
        return this.currentModelId;
    }

    /**
     * Add a document chunk with its embedding to the store
     */
    async addChunk(
        path: string,
        chunkIndex: number,
        content: string,
        embedding: number[]
    ): Promise<number> {
        this.ensureInitialized();
        return invoke<number>("add_document_chunk", {
            path,
            chunkIndex,
            content,
            embedding,
        });
    }

    /**
     * Search for similar documents using vector similarity
     */
    async search(queryEmbedding: number[], limit: number = 10): Promise<VectorSearchResult[]> {
        this.ensureInitialized();
        return invoke<VectorSearchResult[]>("search_vectors", {
            queryEmbedding,
            limit,
        });
    }

    /**
     * Delete all chunks for a path
     */
    async deletePath(path: string): Promise<number> {
        this.ensureInitialized();
        return invoke<number>("delete_indexed_path", { path });
    }

    /**
     * Check if a path is indexed
     */
    async isIndexed(path: string): Promise<boolean> {
        this.ensureInitialized();
        return invoke<boolean>("is_path_indexed", { path });
    }

    /**
     * Get count of indexed chunks
     */
    async getChunkCount(): Promise<number> {
        this.ensureInitialized();
        return invoke<number>("get_chunk_count");
    }

    /**
     * Clear all indexed data
     */
    async clearAll(): Promise<number> {
        this.ensureInitialized();
        const deleted = await invoke<number>("clear_all_chunks");
        console.log(`[VectorStore] Cleared ${deleted} chunks`);
        return deleted;
    }

    private ensureInitialized(): void {
        if (!this.initialized) {
            throw new Error("VectorStore not initialized. Call init(modelId, dimension) first.");
        }
    }
}

// Singleton instance
let vectorStoreInstance: VectorStoreClient | null = null;

export function getVectorStore(): VectorStoreClient {
    if (!vectorStoreInstance) {
        vectorStoreInstance = new VectorStoreClient();
    }
    return vectorStoreInstance;
}
