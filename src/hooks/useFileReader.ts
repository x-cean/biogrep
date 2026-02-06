import { useState, useCallback } from "react";
import { readTextFile } from "@tauri-apps/plugin-fs";
import { Command } from "@tauri-apps/plugin-shell";
import { FocusedFile } from "../types";
import { CONFIG } from "../config";
import { LineBuffer } from "../utils/stream";

/**
 * useFileReader Hook - Read file contents for chat context
 * 
 * Handles two types of files:
 * - Text files: Read directly via Tauri fs plugin
 * - Documents (PDF, Word, etc.): Extract text via rga
 * 
 * Enforces a size limit to avoid overwhelming LLM context.
 */
export function useFileReader() {
    const [isReading, setIsReading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    /**
     * Check if a file is a document that needs rga extraction
     */
    const isDocumentFile = useCallback((path: string): boolean => {
        const ext = path.toLowerCase().slice(path.lastIndexOf('.'));
        return (CONFIG.FILE_READER.DOCUMENT_EXTENSIONS as readonly string[]).includes(ext);
    }, []);

    /**
     * Read text file content directly
     */
    const readTextFileContent = useCallback(async (path: string): Promise<string> => {
        const content = await readTextFile(path);
        return content;
    }, []);

    /**
     * Extract text from document using rga
     * Uses rga with empty pattern to match all lines
     */
    const extractDocumentText = useCallback(async (path: string): Promise<string> => {
        return new Promise((resolve, reject) => {
            try {
                // Use rga with '.' pattern to match any character (extracts all text)
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

                command.stderr.on("data", (data) => {
                    console.warn("rga extraction stderr:", data);
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
    const readFile = useCallback(async (path: string): Promise<FocusedFile | null> => {
        setIsReading(true);
        setError(null);

        try {
            const filename = path.split("/").pop() || path;
            const isDocument = isDocumentFile(path);

            let content: string;

            if (isDocument) {
                content = await extractDocumentText(path);
            } else {
                content = await readTextFileContent(path);
            }

            // Enforce size limit
            const maxSize = CONFIG.FILE_READER.MAX_SIZE_BYTES;
            const truncated = content.length > maxSize;
            if (truncated) {
                content = content.slice(0, maxSize) + "\n\n[... content truncated ...]";
            }

            return {
                path,
                filename,
                content,
                isDocument,
                truncated,
            };
        } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            setError(`Failed to read file: ${message}`);
            console.error("File read error:", err);
            return null;
        } finally {
            setIsReading(false);
        }
    }, [isDocumentFile, extractDocumentText, readTextFileContent]);

    /**
     * Clear any error state
     */
    const clearError = useCallback(() => {
        setError(null);
    }, []);

    return {
        readFile,
        isReading,
        error,
        clearError,
    };
}
