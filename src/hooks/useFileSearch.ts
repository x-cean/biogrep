import { useCallback } from "react";
import { Command, Child } from "@tauri-apps/plugin-shell";
import { FileResult } from "../types";

/**
 * useFileSearch Hook - Filename search using fd
 * 
 * Searches filenames using the fd sidecar binary.
 * Results include: file path and filename.
 */

const MAX_FILE_RESULTS = 5000;

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
                        String(MAX_FILE_RESULTS),
                    ]);

                    let stdout = "";

                    command.on("close", () => {
                        if (getSearchId() === currentSearchId && stdout) {
                            const lines = stdout.split("\n").filter((line) => line.trim());
                            const newFileResults: FileResult[] = lines
                                .slice(0, MAX_FILE_RESULTS)
                                .map((p) => ({
                                    path: p.trim(),
                                    filename: p.split("/").pop() || p,
                                }));

                            if (accumulate) {
                                setResults((prev) => {
                                    if (getSearchId() !== currentSearchId) return prev;
                                    const seen = new Set(prev.map((r) => r.path));
                                    const unique = newFileResults.filter((r) => !seen.has(r.path));
                                    return [...prev, ...unique].slice(0, MAX_FILE_RESULTS);
                                });
                            } else {
                                setResults(newFileResults);
                            }
                        }
                        fdChildRef.current = null;
                        resolve();
                    });

                    command.stdout.on("data", (data) => {
                        if (getSearchId() === currentSearchId) {
                            stdout += data;
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
