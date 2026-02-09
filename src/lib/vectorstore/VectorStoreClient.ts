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
 * Indexed folder info from the Rust backend
 */
export interface IndexedFolder {
    id: number;
    path: string;
    label: string | null;
    indexed_at: string;
    file_count: number;
    chunk_count: number;
}

/**
 * Indexed file info from the Rust backend
 */
export interface IndexedFile {
    id: number;
    folder_id: number;
    path: string;
    last_modified: number;
    file_hash: string | null;
    chunk_count: number;
    indexed_at: string;
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
     * @param fileId - Optional file_id for linking to indexed_files table
     */
    async addChunk(
        path: string,
        chunkIndex: number,
        content: string,
        embedding: number[],
        fileId?: number
    ): Promise<number> {
        this.ensureInitialized();
        return invoke<number>("add_document_chunk", {
            fileId: fileId ?? null,
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
     * Clear all indexed data (including folders and files)
     */
    async clearAll(): Promise<number> {
        this.ensureInitialized();
        const deleted = await invoke<number>("clear_all_chunks");
        console.log(`[VectorStore] Cleared ${deleted} chunks`);
        return deleted;
    }

    // ============ FOLDER MANAGEMENT ============

    /**
     * Add or update an indexed folder
     */
    async addFolder(path: string, label?: string): Promise<number> {
        this.ensureInitialized();
        return invoke<number>("add_indexed_folder", { path, label: label ?? null });
    }

    /**
     * Get all indexed folders with their stats
     */
    async getFolders(): Promise<IndexedFolder[]> {
        this.ensureInitialized();
        return invoke<IndexedFolder[]>("get_indexed_folders");
    }

    /**
     * Delete an indexed folder and all its chunks
     */
    async deleteFolder(folderId: number): Promise<number> {
        this.ensureInitialized();
        const deleted = await invoke<number>("delete_indexed_folder", { folderId });
        console.log(`[VectorStore] Deleted folder ${folderId} with ${deleted} chunks`);
        return deleted;
    }

    /**
     * Update folder stats after indexing
     */
    async updateFolderStats(folderId: number, fileCount: number, chunkCount: number): Promise<void> {
        this.ensureInitialized();
        await invoke<void>("update_folder_stats", { folderId, fileCount, chunkCount });
    }

    // ============ FILE MANAGEMENT ============

    /**
     * Add or update an indexed file record
     */
    async addFile(folderId: number, path: string, lastModified: number, fileHash?: string): Promise<number> {
        this.ensureInitialized();
        return invoke<number>("add_indexed_file", {
            folderId,
            path,
            lastModified,
            fileHash: fileHash ?? null,
        });
    }

    /**
     * Get indexed file info by path
     */
    async getFile(path: string): Promise<IndexedFile | null> {
        this.ensureInitialized();
        return invoke<IndexedFile | null>("get_indexed_file", { path });
    }

    /**
     * Check if a file needs re-indexing based on mtime
     */
    async isFileStale(path: string, currentMtime: number): Promise<boolean> {
        this.ensureInitialized();
        return invoke<boolean>("is_file_stale", { path, currentMtime });
    }

    /**
     * Delete all chunks for a file before re-indexing
     */
    async deleteFileChunks(fileId: number): Promise<number> {
        this.ensureInitialized();
        return invoke<number>("delete_file_chunks", { fileId });
    }

    /**
     * Update file chunk count after indexing
     */
    async updateFileChunkCount(fileId: number, chunkCount: number): Promise<void> {
        this.ensureInitialized();
        await invoke<void>("update_file_chunk_count", { fileId, chunkCount });
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
