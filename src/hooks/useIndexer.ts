import { useState, useCallback, useRef } from "react";
import { Command } from "@tauri-apps/plugin-shell";
import { readTextFile } from "@tauri-apps/plugin-fs";
import { getEmbedder } from "../lib/embeddings";
import { getVectorStore } from "../lib/vectorstore";

/**
 * Configuration for text chunking
 */
const CHUNK_CONFIG = {
    maxTokens: 500,    // ~500 tokens per chunk
    overlap: 100,      // ~100 token overlap
    charsPerToken: 4,  // Approximate chars per token
};

/**
 * Progress state for indexing
 */
export interface IndexProgress {
    phase: "scanning" | "reading" | "chunking" | "embedding" | "storing" | "complete" | "error";
    current: number;
    total: number;
    currentFile?: string;
    error?: string;
}

/**
 * useIndexer Hook - Manages folder indexing for RAG
 * 
 * Provides:
 * - Folder indexing with chunking and embedding
 * - Progress tracking
 * - Index status queries
 */
export function useIndexer() {
    const [isIndexing, setIsIndexing] = useState(false);
    const [progress, setProgress] = useState<IndexProgress>({
        phase: "complete",
        current: 0,
        total: 0,
    });
    const [indexedChunks, setIndexedChunks] = useState(0);
    const abortRef = useRef(false);

    /**
     * Split text into overlapping chunks
     */
    const chunkText = useCallback((text: string): { content: string; index: number }[] => {
        const maxChars = CHUNK_CONFIG.maxTokens * CHUNK_CONFIG.charsPerToken;
        const overlapChars = CHUNK_CONFIG.overlap * CHUNK_CONFIG.charsPerToken;
        const chunks: { content: string; index: number }[] = [];

        // Handle small files
        if (text.length <= maxChars) {
            return [{ content: text, index: 0 }];
        }

        let start = 0;
        let chunkIndex = 0;

        while (start < text.length) {
            const end = Math.min(start + maxChars, text.length);
            let chunkEnd = end;

            // Try to break at sentence/paragraph boundary if not at end
            if (end < text.length) {
                // Look for paragraph break first
                const paragraphBreak = text.lastIndexOf("\n\n", end);
                if (paragraphBreak > start + maxChars / 2) {
                    chunkEnd = paragraphBreak + 2;
                } else {
                    // Look for sentence break
                    const sentenceBreak = text.lastIndexOf(". ", end);
                    if (sentenceBreak > start + maxChars / 2) {
                        chunkEnd = sentenceBreak + 2;
                    }
                }
            }

            const content = text.slice(start, chunkEnd).trim();
            if (content.length > 0) {
                chunks.push({ content, index: chunkIndex++ });
            }

            // Move start forward, accounting for overlap
            start = chunkEnd - overlapChars;
            if (start <= chunks[chunks.length - 1]?.index || start >= text.length) {
                start = chunkEnd;
            }
        }

        return chunks;
    }, []);

    /**
     * Index a folder: scan, read, chunk, embed, store
     */
    const indexFolder = useCallback(async (folderPath: string): Promise<void> => {
        console.log("[Indexer] Starting indexFolder for:", folderPath);

        if (isIndexing) {
            console.warn("[Indexer] Already indexing");
            return;
        }

        setIsIndexing(true);
        abortRef.current = false;

        try {
            // Initialize vector store
            console.log("[Indexer] Initializing vector store...");
            const vectorStore = getVectorStore();
            await vectorStore.init();
            console.log("[Indexer] Vector store initialized");

            // Initialize embedder
            console.log("[Indexer] Getting embedder...");
            const embedder = getEmbedder();
            console.log("[Indexer] Embedder ready, configured:", embedder.isConfigured());
            setProgress({ phase: "scanning", current: 0, total: 0 });

            // Use fd sidecar to list all files in the folder
            const fdOutput = await new Promise<string>((resolve, reject) => {
                const command = Command.sidecar("binaries/fd", [
                    ".",           // Match all files
                    folderPath,
                    "--type", "f", // Only files
                ]);

                let output = "";

                command.stdout.on("data", (data) => {
                    output += data;
                });

                command.on("close", (data) => {
                    if (data.code === 0) {
                        resolve(output);
                    } else {
                        reject(new Error(`fd exited with code ${data.code}`));
                    }
                });

                command.on("error", (err) => {
                    reject(err);
                });

                command.spawn().catch(reject);
            });

            const files = fdOutput
                .split("\n")
                .filter((f) => f.trim())
                .filter((f) => {
                    // Filter to text-like files
                    const ext = f.split(".").pop()?.toLowerCase();
                    return ["txt", "md", "markdown", "rst", "json", "yaml", "yml", "toml", "csv", "log", "py", "js", "ts", "tsx", "rs", "go", "java", "c", "cpp", "h", "hpp"].includes(ext || "");
                });

            if (files.length === 0) {
                setProgress({ phase: "complete", current: 0, total: 0 });
                setIsIndexing(false);
                return;
            }

            console.log(`[Indexer] Found ${files.length} files to index`);
            setProgress({ phase: "reading", current: 0, total: files.length });

            let totalChunks = 0;

            for (let i = 0; i < files.length; i++) {
                if (abortRef.current) break;

                const filePath = files[i];
                setProgress({
                    phase: "reading",
                    current: i + 1,
                    total: files.length,
                    currentFile: filePath,
                });

                try {
                    // Read file content
                    const content = await readTextFile(filePath);
                    if (!content.trim()) continue;

                    // Chunk the content
                    setProgress((p) => ({ ...p, phase: "chunking" }));
                    const chunks = chunkText(content);
                    console.log(`[Indexer] File ${i + 1}/${files.length}: ${filePath.split("/").pop()} - ${chunks.length} chunks`);

                    // Embed and store each chunk
                    for (const chunk of chunks) {
                        if (abortRef.current) break;

                        setProgress((p) => ({
                            ...p,
                            phase: "embedding",
                            currentFile: `${filePath} (chunk ${chunk.index + 1}/${chunks.length})`,
                        }));

                        // Generate embedding
                        const embedding = await embedder.embed(chunk.content);
                        console.log(`[Indexer] Embedded chunk ${chunk.index + 1}/${chunks.length}, dim=${embedding.length}`);

                        // Store in vector database
                        setProgress((p) => ({ ...p, phase: "storing" }));
                        await vectorStore.addChunk(
                            filePath,
                            chunk.index,
                            chunk.content,
                            embedding
                        );
                        console.log(`[Indexer] Stored chunk ${chunk.index + 1}/${chunks.length}`);

                        totalChunks++;
                    }
                } catch (err) {
                    console.warn(`[Indexer] Failed to index ${filePath}:`, err);
                    // Continue with other files
                }
            }

            // Update final count
            const finalCount = await vectorStore.getChunkCount();
            setIndexedChunks(finalCount);
            setProgress({ phase: "complete", current: files.length, total: files.length });
            console.log(`[Indexer] Complete. ${totalChunks} chunks indexed.`);
        } catch (err) {
            console.error("[Indexer] Error:", err);
            setProgress({
                phase: "error",
                current: 0,
                total: 0,
                error: err instanceof Error ? err.message : String(err),
            });
        } finally {
            setIsIndexing(false);
        }
    }, [isIndexing, chunkText]);

    /**
     * Cancel ongoing indexing
     */
    const cancelIndexing = useCallback(() => {
        abortRef.current = true;
    }, []);

    /**
     * Load initial chunk count on mount
     */
    const loadChunkCount = useCallback(async () => {
        try {
            const vectorStore = getVectorStore();
            await vectorStore.init();
            const count = await vectorStore.getChunkCount();
            setIndexedChunks(count);
        } catch (err) {
            console.warn("[Indexer] Failed to load chunk count:", err);
        }
    }, []);

    return {
        indexFolder,
        cancelIndexing,
        loadChunkCount,
        isIndexing,
        progress,
        indexedChunks,
    };
}
