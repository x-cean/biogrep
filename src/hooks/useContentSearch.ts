import { useCallback } from "react";
import { Command, Child } from "@tauri-apps/plugin-shell";
import { SearchResult } from "../types";
import { LineBuffer, ThrottledAccumulator } from "../utils/stream";

/**
 * useContentSearch Hook - Text content search using ripgrep
 * 
 * Searches file contents using the rg sidecar binary.
 * Results include: file path, line number, and matching line content.
 */

import { CONFIG } from "../config";

/**
 * useContentSearch Hook - Text content search using ripgrep
 * 
 * Searches file contents using the rg sidecar binary.
 * Results include: file path, line number, and matching line content.
 */

interface UseContentSearchOptions {
    rgChildRef: React.MutableRefObject<Child | null>;
    getSearchId: () => number;
}

export function useContentSearch({ rgChildRef, getSearchId }: UseContentSearchOptions) {
    /**
     * Run content search using rg (ripgrep).
     * @param currentSearchId - The search ID at the time of invocation
     * @param query - Search term
     * @param path - Directory to search in
     * @param accumulate - If true, merge with existing results (for LLM expansion)
     * @param setResults - State setter for content results
     * @param setError - State setter for errors
     */
    const runContentSearch = useCallback(
        (
            currentSearchId: number,
            query: string,
            path: string,
            accumulate: boolean,
            setResults: React.Dispatch<React.SetStateAction<SearchResult[]>>,
            setError: React.Dispatch<React.SetStateAction<string>>
        ): Promise<void> => {
            return new Promise((resolve) => {
                try {
                    const command = Command.sidecar("binaries/rg", [
                        "--json",
                        "--max-count",
                        String(CONFIG.SEARCH.MAX_MATCHES_PER_FILE), // Limit matches per file to avoid flooding
                        query,
                        path,
                    ]);

                    const lineBuffer = new LineBuffer();

                    // Throttle updates to UI (every 100ms or 50 items)
                    const accumulator = new ThrottledAccumulator<SearchResult>((batch) => {
                        if (getSearchId() === currentSearchId) {
                            setResults((prev) => {
                                // Safety check to stop growing if we hit limit
                                if (prev.length >= CONFIG.SEARCH.MAX_CONTENT_RESULTS) return prev;

                                // When accumulating (LLM expansion), we might duplicate, so filter
                                // But for main search stream, raw append is faster.
                                // We'll use a simple collision check if accumulate is true
                                if (accumulate) {
                                    const seen = new Set(prev.map((r) => `${r.path}:${r.lineNumber}`));
                                    const unique = batch.filter(
                                        (r) => !seen.has(`${r.path}:${r.lineNumber}`)
                                    );
                                    return [...prev, ...unique].slice(0, CONFIG.SEARCH.MAX_CONTENT_RESULTS);
                                }

                                return [...prev, ...batch].slice(0, CONFIG.SEARCH.MAX_CONTENT_RESULTS);
                            });
                        }
                    }, 50, 50);

                    command.on("close", () => {
                        // Flush any remaining data
                        const remainingLines = lineBuffer.flush();
                        processLines(remainingLines, accumulator);
                        accumulator.flush();

                        rgChildRef.current = null;
                        resolve();
                    });

                    command.stdout.on("data", (data) => {
                        if (getSearchId() === currentSearchId) {
                            const lines = lineBuffer.append(data);
                            processLines(lines, accumulator);
                        }
                    });

                    command.stderr.on("data", (data) => {
                        if (getSearchId() === currentSearchId && data) {
                            // Only show actual errors, ignore some stats output if any
                            if (data.includes("error")) {
                                setError(data);
                            }
                        }
                    });

                    command
                        .spawn()
                        .then((child) => {
                            rgChildRef.current = child;
                        })
                        .catch((err) => {
                            console.error("rg spawn failed:", err);
                            resolve();
                        });
                } catch (err) {
                    console.error("rg search failed:", err);
                    resolve();
                }
            });
        },
        [rgChildRef, getSearchId]
    );

    return { runContentSearch };
}

function processLines(lines: string[], accumulator: ThrottledAccumulator<SearchResult>) {
    for (const line of lines) {
        if (!line.trim()) continue;

        try {
            const json = JSON.parse(line);
            if (json.type === "match" && json.data) {
                const d = json.data;
                const path = d.path?.text || "?";
                const lineNumber = d.line_number || 0;
                // Truncate incredibly long lines (minified code etc)
                const lineContent = (d.lines?.text || "").trim().slice(0, 300);

                accumulator.add({
                    path,
                    lineNumber,
                    lineContent,
                });
            }
        } catch {
            // skip non-JSON lines
        }
    }
}
