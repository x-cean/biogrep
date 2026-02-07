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
 */
export class VectorStoreClient {
    private initialized = false;
    private dbPath: string | null = null;

    /**
     * Initialize the vector store. Must be called before any other operations.
     * @returns Path to the database file
     */
    async init(): Promise<string> {
        if (this.initialized) {
            return this.dbPath!;
        }

        this.dbPath = await invoke<string>("init_vectorstore");
        this.initialized = true;
        console.log("[VectorStore] Initialized at:", this.dbPath);
        return this.dbPath;
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
            throw new Error("VectorStore not initialized. Call init() first.");
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
