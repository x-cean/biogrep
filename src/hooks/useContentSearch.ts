import { useCallback } from "react";
import { Command, Child } from "@tauri-apps/plugin-shell";
import { SearchResult } from "../types";

/**
 * useContentSearch Hook - Text content search using ripgrep
 * 
 * Searches file contents using the rg sidecar binary.
 * Results include: file path, line number, and matching line content.
 */

const MAX_RESULTS = 50000;

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
                        "50",
                        query,
                        path,
                    ]);

                    let stdout = "";

                    command.on("close", () => {
                        if (getSearchId() === currentSearchId) {
                            const newResults: SearchResult[] = [];

                            if (stdout) {
                                const lines = stdout.split("\n");

                                for (const line of lines) {
                                    if (!line.trim()) continue;
                                    if (newResults.length >= MAX_RESULTS) break;

                                    try {
                                        const json = JSON.parse(line);
                                        if (json.type === "match" && json.data) {
                                            const d = json.data;
                                            newResults.push({
                                                path: d.path?.text || "?",
                                                lineNumber: d.line_number || 0,
                                                lineContent: (d.lines?.text || "").trim().slice(0, 200),
                                            });
                                        }
                                    } catch {
                                        // skip non-JSON lines
                                    }
                                }
                            }

                            if (accumulate) {
                                setResults((prev) => {
                                    if (getSearchId() !== currentSearchId) return prev;
                                    const seen = new Set(prev.map((r) => `${r.path}:${r.lineNumber}`));
                                    const unique = newResults.filter(
                                        (r) => !seen.has(`${r.path}:${r.lineNumber}`)
                                    );
                                    return [...prev, ...unique].slice(0, MAX_RESULTS);
                                });
                            } else {
                                setResults(newResults);
                            }
                        }
                        rgChildRef.current = null;
                        resolve();
                    });

                    command.stdout.on("data", (data) => {
                        if (getSearchId() === currentSearchId) {
                            stdout += data;
                        }
                    });

                    command.stderr.on("data", (data) => {
                        if (getSearchId() === currentSearchId && data) {
                            setError(data);
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
