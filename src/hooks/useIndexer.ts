import { useState, useCallback, useRef } from "react";
import { Command } from "@tauri-apps/plugin-shell";
import { readTextFile, stat } from "@tauri-apps/plugin-fs";
import { getEmbedder } from "../lib/embeddings";
import { getVectorStore, IndexedFolder } from "../lib/vectorstore";
import { CONFIG } from "../config";
import { LineBuffer } from "../utils/stream";

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
    /** Current file being processed */
    currentFile?: string;
    /** File progress */
    fileIndex: number;
    fileTotal: number;
    /** Chunk progress within current file */
    chunkIndex: number;
    chunkTotal: number;
    /** Total chunks processed so far */
    totalChunksProcessed: number;
    /** Files skipped (unchanged) */
    filesSkipped: number;
    /** Files updated (changed) */
    filesUpdated: number;
    error?: string;
}

/**
 * useIndexer Hook - Manages folder indexing for RAG
 * 
 * Provides:
 * - Folder indexing with chunking and embedding
 * - Incremental indexing (skip unchanged files)
 * - Folder management (list, delete folders)
 * - Progress tracking
 * - Index status queries
 */
export function useIndexer() {
    const [isIndexing, setIsIndexing] = useState(false);
    const [progress, setProgress] = useState<IndexProgress>({
        phase: "complete",
        fileIndex: 0,
        fileTotal: 0,
        chunkIndex: 0,
        chunkTotal: 0,
        totalChunksProcessed: 0,
        filesSkipped: 0,
        filesUpdated: 0,
    });
    const [indexedChunks, setIndexedChunks] = useState(0);
    const [indexedFolders, setIndexedFolders] = useState<IndexedFolder[]>([]);
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
            // Ensure we always make forward progress to prevent infinite loop
            const nextStart = chunkEnd - overlapChars;
            if (nextStart <= start) {
                // Overlap is larger than chunk, just move to end
                start = chunkEnd;
            } else {
                start = nextStart;
            }
        }

        return chunks;
    }, []);

    /**
     * Check if a file is a document that needs rga extraction (PDF, DOCX, etc.)
     */
    const isDocumentFile = useCallback((path: string): boolean => {
        const ext = path.toLowerCase().slice(path.lastIndexOf('.'));
        return (CONFIG.FILE_READER.DOCUMENT_EXTENSIONS as readonly string[]).includes(ext);
    }, []);

    /**
     * Supported text file extensions (read directly)
     */
    const TEXT_EXTENSIONS = [
        "txt", "md", "markdown", "rst", "json", "yaml", "yml", "toml", "csv", "log",
        "py", "js", "ts", "tsx", "jsx", "rs", "go", "java", "c", "cpp", "h", "hpp",
        "html", "htm", "xml", "css", "scss", "sass", "sql", "sh", "bash", "zsh"
    ];

    /**
     * Extract text from document using rga (ripgrep-all)
     * Works with PDF, DOCX, PPTX, XLSX, etc.
     */
    const extractDocumentText = useCallback(async (path: string): Promise<string> => {
        return new Promise((resolve, reject) => {
            try {
                const command = Command.sidecar(
                    "binaries/rga",
                    ["--no-filename", "--no-line-number", ".", path],
                    {
                        env: {
                            PATH: CONFIG.PATHS.RGA_ENV_PATH,
                        },
                    }
                );

                const lineBuffer = new LineBuffer();
                const lines: string[] = [];

                command.stdout.on("data", (data) => {
                    const newLines = lineBuffer.append(data);
                    lines.push(...newLines);
                });

                command.stderr.on("data", (_data) => {
                    // Ignore stderr - rga often outputs warnings
                });

                command.on("close", () => {
                    const remaining = lineBuffer.flush();
                    lines.push(...remaining);
                    resolve(lines.join("\n"));
                });

                command.spawn().catch(reject);
            } catch (err) {
                reject(err);
            }
        });
    }, []);

    /**
     * Read file content - handles both text files and documents
     */
    const readFileContent = useCallback(async (path: string): Promise<string> => {
        if (isDocumentFile(path)) {
            return extractDocumentText(path);
        } else {
            return readTextFile(path);
        }
    }, [isDocumentFile, extractDocumentText]);

    /**
     * Get file modification time (mtime) as Unix timestamp in seconds
     */
    const getFileMtime = useCallback(async (path: string): Promise<number> => {
        try {
            const fileStat = await stat(path);
            // mtime can be Date or undefined
            if (fileStat.mtime) {
                return Math.floor(fileStat.mtime.getTime() / 1000);
            }
            return 0;
        } catch {
            return 0;
        }
    }, []);

    /**
     * Index a folder: scan, read, chunk, embed, store
     * Now with incremental indexing - skips unchanged files
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
            // Initialize embedder first (needed for config)
            console.log("[Indexer] Getting embedder...");
            const embedder = getEmbedder();
            console.log("[Indexer] Embedder ready:", embedder.config.name, "configured:", embedder.isConfigured());

            // Initialize vector store with embedder config
            console.log("[Indexer] Initializing vector store...");
            const vectorStore = getVectorStore();
            await vectorStore.init(embedder.config.id, embedder.config.dimension);
            console.log("[Indexer] Vector store initialized for model:", embedder.config.id);

            // Register folder in database (or update if exists)
            const folderId = await vectorStore.addFolder(folderPath);
            console.log("[Indexer] Folder registered with ID:", folderId);

            setProgress({
                phase: "scanning",
                fileIndex: 0,
                fileTotal: 0,
                chunkIndex: 0,
                chunkTotal: 0,
                totalChunksProcessed: 0,
                filesSkipped: 0,
                filesUpdated: 0,
            });

            // Use fd sidecar to list all files in the folder
            console.log("[Indexer] Starting fd scan for:", folderPath);
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

                command.stderr.on("data", (data) => {
                    console.error("[Indexer] fd stderr:", data);
                });

                command.on("close", (data) => {
                    console.log("[Indexer] fd closed with code:", data.code);
                    if (data.code === 0) {
                        resolve(output);
                    } else {
                        reject(new Error(`fd exited with code ${data.code}`));
                    }
                });

                command.on("error", (err) => {
                    console.error("[Indexer] fd error event:", err);
                    reject(err);
                });

                command.spawn()
                    .then(() => console.log("[Indexer] fd spawned successfully"))
                    .catch((err) => {
                        console.error("[Indexer] fd spawn failed:", err);
                        reject(err);
                    });
            });

            const files = fdOutput
                .split("\n")
                .filter((f) => f.trim())
                .filter((f) => {
                    // Filter to text-like files OR documents (PDF, DOCX, etc.)
                    const ext = f.split(".").pop()?.toLowerCase() || "";
                    const extWithDot = "." + ext;

                    // Check if it's a text file
                    const isTextFile = TEXT_EXTENSIONS.includes(ext);

                    // Check if it's a document file
                    const isDocument = (CONFIG.FILE_READER.DOCUMENT_EXTENSIONS as readonly string[]).includes(extWithDot);

                    return isTextFile || isDocument;
                });

            if (files.length === 0) {
                await vectorStore.updateFolderStats(folderId, 0, 0);
                setProgress({
                    phase: "complete",
                    fileIndex: 0,
                    fileTotal: 0,
                    chunkIndex: 0,
                    chunkTotal: 0,
                    totalChunksProcessed: 0,
                    filesSkipped: 0,
                    filesUpdated: 0,
                });
                setIsIndexing(false);
                await refreshFolders();
                return;
            }

            console.log(`[Indexer] Found ${files.length} files to check`);
            setProgress({
                phase: "reading",
                fileIndex: 0,
                fileTotal: files.length,
                chunkIndex: 0,
                chunkTotal: 0,
                totalChunksProcessed: 0,
                filesSkipped: 0,
                filesUpdated: 0,
            });

            let totalChunks = 0;
            let filesSkipped = 0;
            let filesUpdated = 0;
            let filesIndexed = 0;

            for (let i = 0; i < files.length; i++) {
                if (abortRef.current) break;

                const filePath = files[i];

                // Get file mtime
                const currentMtime = await getFileMtime(filePath);

                // Check if file needs re-indexing
                const isStale = await vectorStore.isFileStale(filePath, currentMtime);

                if (!isStale) {
                    // File unchanged, skip
                    filesSkipped++;
                    setProgress((p) => ({
                        ...p,
                        fileIndex: i + 1,
                        filesSkipped,
                    }));
                    console.log(`[Indexer] Skipping unchanged file: ${filePath.split("/").pop()}`);
                    continue;
                }

                setProgress((p) => ({
                    ...p,
                    phase: "reading",
                    fileIndex: i + 1,
                    fileTotal: files.length,
                    currentFile: filePath,
                    filesSkipped,
                    filesUpdated,
                }));

                try {
                    // Check if file was previously indexed - delete old chunks
                    const existingFile = await vectorStore.getFile(filePath);
                    if (existingFile) {
                        console.log(`[Indexer] File changed, deleting ${existingFile.chunk_count} old chunks`);
                        await vectorStore.deleteFileChunks(existingFile.id);
                    }

                    // Register file in database
                    const fileId = await vectorStore.addFile(folderId, filePath, currentMtime);

                    // Read file content (handles both text and document files)
                    const content = await readFileContent(filePath);
                    if (!content.trim()) {
                        await vectorStore.updateFileChunkCount(fileId, 0);
                        continue;
                    }

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
                            chunkIndex: chunk.index + 1,
                            chunkTotal: chunks.length,
                            currentFile: filePath,
                        }));

                        // Generate embedding
                        const embedding = await embedder.embed(chunk.content);

                        // Store in vector database with file_id
                        setProgress((p) => ({ ...p, phase: "storing", totalChunksProcessed: totalChunks + 1 }));
                        await vectorStore.addChunk(
                            filePath,
                            chunk.index,
                            chunk.content,
                            embedding,
                            fileId
                        );

                        totalChunks++;
                    }

                    // Update file chunk count
                    await vectorStore.updateFileChunkCount(fileId, chunks.length);
                    filesUpdated++;
                    filesIndexed++;

                    setProgress((p) => ({
                        ...p,
                        filesUpdated,
                    }));

                } catch (err) {
                    console.warn(`[Indexer] Failed to index ${filePath}:`, err);
                    // Continue with other files
                }
            }

            // Update folder stats
            await vectorStore.updateFolderStats(folderId, filesIndexed, totalChunks);

            // Update final count
            const finalCount = await vectorStore.getChunkCount();
            setIndexedChunks(finalCount);
            await refreshFolders();

            setProgress({
                phase: "complete",
                fileIndex: files.length,
                fileTotal: files.length,
                chunkIndex: 0,
                chunkTotal: 0,
                totalChunksProcessed: totalChunks,
                filesSkipped,
                filesUpdated,
            });
            console.log(`[Indexer] Complete. ${totalChunks} chunks indexed from ${filesUpdated} files (${filesSkipped} unchanged files skipped).`);
        } catch (err) {
            console.error("[Indexer] Error:", err);
            setProgress({
                phase: "error",
                fileIndex: 0,
                fileTotal: 0,
                chunkIndex: 0,
                chunkTotal: 0,
                totalChunksProcessed: 0,
                filesSkipped: 0,
                filesUpdated: 0,
                error: err instanceof Error ? err.message : String(err),
            });
        } finally {
            setIsIndexing(false);
        }
    }, [isIndexing, chunkText, getFileMtime, readFileContent]);

    /**
     * Cancel ongoing indexing
     */
    const cancelIndexing = useCallback(() => {
        abortRef.current = true;
    }, []);

    /**
     * Load initial data on mount (chunk count + folders)
     */
    const loadChunkCount = useCallback(async () => {
        try {
            const embedder = getEmbedder();
            const vectorStore = getVectorStore();
            await vectorStore.init(embedder.config.id, embedder.config.dimension);
            const count = await vectorStore.getChunkCount();
            setIndexedChunks(count);
            await refreshFolders();
        } catch (err) {
            console.warn("[Indexer] Failed to load chunk count:", err);
        }
    }, []);

    /**
     * Refresh indexed folders list
     */
    const refreshFolders = useCallback(async () => {
        try {
            const vectorStore = getVectorStore();
            const folders = await vectorStore.getFolders();
            setIndexedFolders(folders);
        } catch (err) {
            console.warn("[Indexer] Failed to refresh folders:", err);
        }
    }, []);

    /**
     * Delete a specific folder and all its chunks
     */
    const deleteFolder = useCallback(async (folderId: number) => {
        try {
            const embedder = getEmbedder();
            const vectorStore = getVectorStore();
            await vectorStore.init(embedder.config.id, embedder.config.dimension);
            const deleted = await vectorStore.deleteFolder(folderId);
            console.log(`[Indexer] Deleted folder ${folderId} with ${deleted} chunks`);

            // Refresh counts
            const count = await vectorStore.getChunkCount();
            setIndexedChunks(count);
            await refreshFolders();
        } catch (err) {
            console.error("[Indexer] Failed to delete folder:", err);
        }
    }, [refreshFolders]);

    /**
     * Clear all indexed data
     */
    const clearIndex = useCallback(async () => {
        try {
            const embedder = getEmbedder();
            const vectorStore = getVectorStore();
            await vectorStore.init(embedder.config.id, embedder.config.dimension);
            await vectorStore.clearAll();
            setIndexedChunks(0);
            setIndexedFolders([]);
            console.log("[Indexer] Index cleared");
        } catch (err) {
            console.error("[Indexer] Failed to clear index:", err);
        }
    }, []);

    return {
        indexFolder,
        cancelIndexing,
        loadChunkCount,
        clearIndex,
        deleteFolder,
        refreshFolders,
        isIndexing,
        progress,
        indexedChunks,
        indexedFolders,
    };
}
