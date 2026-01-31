import { useCallback } from "react";
import { Command, Child } from "@tauri-apps/plugin-shell";
import { DocResult } from "../types";

/**
 * useDocSearch Hook - Document search using ripgrep-all
 * 
 * Searches document contents (PDFs, Word, etc.) using the rga sidecar binary.
 * rga uses adapters (pdftotext, pandoc) to extract text from binary formats.
 * Results include: file path, line number, and matching line content.
 */

const MAX_RESULTS = 50000;

// PATH for rga to find adapter binaries (pdftotext, pandoc)
const RGA_PATH = "/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin";

interface UseDocSearchOptions {
    rgaChildRef: React.MutableRefObject<Child | null>;
    getSearchId: () => number;
}

export function useDocSearch({ rgaChildRef, getSearchId }: UseDocSearchOptions) {
    /**
     * Run document search using rga (ripgrep-all).
     * @param currentSearchId - The search ID at the time of invocation
     * @param query - Search term
     * @param path - Directory to search in
     * @param accumulate - If true, merge with existing results (for LLM expansion)
     * @param setResults - State setter for document results
     */
    const runDocSearch = useCallback(
        (
            currentSearchId: number,
            query: string,
            path: string,
            accumulate: boolean,
            setResults: React.Dispatch<React.SetStateAction<DocResult[]>>
        ): Promise<void> => {
            return new Promise((resolve) => {
                try {
                    const command = Command.sidecar(
                        "binaries/rga",
                        ["--json", "--max-count", "50", query, path],
                        {
                            env: {
                                PATH: RGA_PATH,
                            },
                        }
                    );

                    let stdout = "";

                    command.on("close", () => {
                        if (getSearchId() === currentSearchId) {
                            const newDocResults: DocResult[] = [];

                            if (stdout) {
                                const lines = stdout.split("\n");

                                for (const line of lines) {
                                    if (!line.trim()) continue;
                                    if (newDocResults.length >= MAX_RESULTS) break;

                                    try {
                                        const json = JSON.parse(line);
                                        if (json.type === "match" && json.data) {
                                            const d = json.data;
                                            newDocResults.push({
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
                                    const seen = new Set(
                                        prev.map((r) => `${r.path}:${r.lineNumber}:${r.lineContent}`)
                                    );
                                    const unique = newDocResults.filter(
                                        (r) => !seen.has(`${r.path}:${r.lineNumber}:${r.lineContent}`)
                                    );
                                    return [...prev, ...unique].slice(0, MAX_RESULTS);
                                });
                            } else {
                                setResults(newDocResults);
                            }
                        }
                        rgaChildRef.current = null;
                        resolve();
                    });

                    command.stdout.on("data", (data) => {
                        if (getSearchId() === currentSearchId) {
                            stdout += data;
                        }
                    });

                    command.stderr.on("data", (data) => {
                        console.error("rga stderr:", data);
                    });

                    command
                        .spawn()
                        .then((child) => {
                            rgaChildRef.current = child;
                        })
                        .catch((err) => {
                            console.error("rga spawn failed:", err);
                            resolve();
                        });
                } catch (err) {
                    console.error("rga search failed:", err);
                    resolve();
                }
            });
        },
        [rgaChildRef, getSearchId]
    );

    return { runDocSearch };
}
