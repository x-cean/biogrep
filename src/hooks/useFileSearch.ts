import { useCallback } from "react";
import { Command, Child } from "@tauri-apps/plugin-shell";
import { FileResult } from "../types";
import { LineBuffer, ThrottledAccumulator } from "../utils/stream";
import { CONFIG } from "../config";

/**
 * useFileSearch Hook - Filename search using fd
 * 
 * Searches filenames using the fd sidecar binary.
 * Results include: file path and filename.
 */

interface UseFileSearchOptions {
    fdChildRef: React.MutableRefObject<Child | null>;
    getSearchId: () => number;
}

export function useFileSearch({ fdChildRef, getSearchId }: UseFileSearchOptions) {
    /**
     * Run filename search using fd.
     * @param currentSearchId - The search ID at the time of invocation
     * @param query - Search term
     * @param path - Directory to search in
     * @param accumulate - If true, merge with existing results (for LLM expansion)
     * @param setResults - State setter for file results
     */
    const runFileSearch = useCallback(
        (
            currentSearchId: number,
            query: string,
            path: string,
            accumulate: boolean,
            setResults: React.Dispatch<React.SetStateAction<FileResult[]>>
        ): Promise<void> => {
            return new Promise((resolve) => {
                try {
                    const command = Command.sidecar("binaries/fd", [
                        query,
                        path,
                        "--max-results",
                        String(CONFIG.SEARCH.MAX_FILE_RESULTS),
                    ]);

                    const lineBuffer = new LineBuffer();

                    const accumulator = new ThrottledAccumulator<FileResult>((batch) => {
                        if (getSearchId() === currentSearchId) {
                            setResults((prev) => {
                                if (prev.length >= CONFIG.SEARCH.MAX_FILE_RESULTS) return prev;

                                if (accumulate) {
                                    const seen = new Set(prev.map((r) => r.path));
                                    const unique = batch.filter((r) => !seen.has(r.path));
                                    return [...prev, ...unique].slice(0, CONFIG.SEARCH.MAX_FILE_RESULTS);
                                }

                                return [...prev, ...batch].slice(0, CONFIG.SEARCH.MAX_FILE_RESULTS);
                            });
                        }
                    }, 50, 50);

                    command.on("close", () => {
                        const remainingLines = lineBuffer.flush();
                        processLines(remainingLines, accumulator);
                        accumulator.flush();

                        fdChildRef.current = null;
                        resolve();
                    });

                    command.stdout.on("data", (data) => {
                        if (getSearchId() === currentSearchId) {
                            const lines = lineBuffer.append(data);
                            processLines(lines, accumulator);
                        }
                    });

                    command.stderr.on("data", (data) => {
                        console.error("fd stderr:", data);
                    });

                    command
                        .spawn()
                        .then((child) => {
                            fdChildRef.current = child;
                        })
                        .catch((err) => {
                            console.error("fd spawn failed:", err);
                            resolve();
                        });
                } catch (err) {
                    console.error("fd search failed:", err);
                    resolve();
                }
            });
        },
        [fdChildRef, getSearchId]
    );

    return { runFileSearch };
}

function processLines(lines: string[], accumulator: ThrottledAccumulator<FileResult>) {
    for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;

        accumulator.add({
            path: trimmed,
            filename: trimmed.split("/").pop() || trimmed,
        });
    }
}
