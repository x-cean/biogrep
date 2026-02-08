import { useState, useCallback, useRef } from "react";
import { Command } from "@tauri-apps/plugin-shell";
import { readTextFile } from "@tauri-apps/plugin-fs";
import { getEmbedder } from "../lib/embeddings";
import { getVectorStore } from "../lib/vectorstore";
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
        fileIndex: 0,
        fileTotal: 0,
        chunkIndex: 0,
        chunkTotal: 0,
        totalChunksProcessed: 0,
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
            // Initialize embedder first (needed for config)
            console.log("[Indexer] Getting embedder...");
            const embedder = getEmbedder();
            console.log("[Indexer] Embedder ready:", embedder.config.name, "configured:", embedder.isConfigured());

            // Initialize vector store with embedder config
            console.log("[Indexer] Initializing vector store...");
            const vectorStore = getVectorStore();
            await vectorStore.init(embedder.config.id, embedder.config.dimension);
            console.log("[Indexer] Vector store initialized for model:", embedder.config.id);

            setProgress({ phase: "scanning", fileIndex: 0, fileTotal: 0, chunkIndex: 0, chunkTotal: 0, totalChunksProcessed: 0 });

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
                    console.log("[Indexer] fd stdout received:", data.length, "chars");
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
                setProgress({ phase: "complete", fileIndex: 0, fileTotal: 0, chunkIndex: 0, chunkTotal: 0, totalChunksProcessed: 0 });
                setIsIndexing(false);
                return;
            }

            console.log(`[Indexer] Found ${files.length} files to index`);
            setProgress({ phase: "reading", fileIndex: 0, fileTotal: files.length, chunkIndex: 0, chunkTotal: 0, totalChunksProcessed: 0 });

            let totalChunks = 0;

            for (let i = 0; i < files.length; i++) {
                if (abortRef.current) break;

                const filePath = files[i];
                setProgress((p) => ({
                    ...p,
                    phase: "reading",
                    fileIndex: i + 1,
                    fileTotal: files.length,
                    currentFile: filePath,
                }));

                try {
                    // Read file content (handles both text and document files)
                    const content = await readFileContent(filePath);
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
                            chunkIndex: chunk.index + 1,
                            chunkTotal: chunks.length,
                            currentFile: filePath,
                        }));

                        // Generate embedding
                        const embedding = await embedder.embed(chunk.content);
                        console.log(`[Indexer] Embedded chunk ${chunk.index + 1}/${chunks.length}, dim=${embedding.length}`);

                        // Store in vector database
                        setProgress((p) => ({ ...p, phase: "storing", totalChunksProcessed: totalChunks + 1 }));
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
            setProgress({ phase: "complete", fileIndex: files.length, fileTotal: files.length, chunkIndex: 0, chunkTotal: 0, totalChunksProcessed: totalChunks });
            console.log(`[Indexer] Complete. ${totalChunks} chunks indexed.`);
        } catch (err) {
            console.error("[Indexer] Error:", err);
            setProgress({
                phase: "error",
                fileIndex: 0,
                fileTotal: 0,
                chunkIndex: 0,
                chunkTotal: 0,
                totalChunksProcessed: 0,
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
            const embedder = getEmbedder();
            const vectorStore = getVectorStore();
            await vectorStore.init(embedder.config.id, embedder.config.dimension);
            const count = await vectorStore.getChunkCount();
            setIndexedChunks(count);
        } catch (err) {
            console.warn("[Indexer] Failed to load chunk count:", err);
        }
    }, []);

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
        isIndexing,
        progress,
        indexedChunks,
    };
}
