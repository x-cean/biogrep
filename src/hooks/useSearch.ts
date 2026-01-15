import { useState, useEffect, useRef, useCallback } from "react";
import { Command, Child } from "@tauri-apps/plugin-shell";
import { SearchResult, FileResult } from "../types";

const MAX_RESULTS = 50000;
const MAX_FILE_RESULTS = 5000;

export function useSearch() {
    const [query, setQuery] = useState("");
    const [searchPath, setSearchPath] = useState("");
    const [results, setResults] = useState<SearchResult[]>([]);
    const [fileResults, setFileResults] = useState<FileResult[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");

    const searchIdRef = useRef(0);
    const fdChildRef = useRef<Child | null>(null);
    const rgChildRef = useRef<Child | null>(null);

    const killPreviousSearches = useCallback(async () => {
        if (fdChildRef.current) {
            try {
                await fdChildRef.current.kill();
            } catch {
                // Process may have already exited
            }
            fdChildRef.current = null;
        }
        if (rgChildRef.current) {
            try {
                await rgChildRef.current.kill();
            } catch {
                // Process may have already exited
            }
            rgChildRef.current = null;
        }
    }, []);

    const runFileSearch = useCallback(
        async (currentSearchId: number, q: string, path: string) => {
            try {
                const command = Command.sidecar("binaries/fd", [
                    q,
                    path,
                    "--max-results",
                    String(MAX_FILE_RESULTS),
                ]);

                let stdout = "";

                command.on("close", () => {
                    if (searchIdRef.current !== currentSearchId) return;

                    if (stdout) {
                        const lines = stdout.split("\n").filter((line) => line.trim());
                        const newFileResults: FileResult[] = lines
                            .slice(0, MAX_FILE_RESULTS)
                            .map((p) => ({
                                path: p.trim(),
                                filename: p.split("/").pop() || p,
                            }));
                        setFileResults(newFileResults);
                    }
                    fdChildRef.current = null;
                });

                command.stdout.on("data", (data) => {
                    if (searchIdRef.current === currentSearchId) {
                        stdout += data;
                    }
                });

                command.stderr.on("data", (data) => {
                    console.error("fd stderr:", data);
                });

                fdChildRef.current = await command.spawn();
            } catch (err) {
                console.error("fd search failed:", err);
            }
        },
        []
    );

    const runContentSearch = useCallback(
        async (currentSearchId: number, q: string, path: string) => {
            try {
                const command = Command.sidecar("binaries/rg", [
                    "--json",
                    "--max-count",
                    "50",
                    q,
                    path,
                ]);

                let stdout = "";

                command.on("close", () => {
                    if (searchIdRef.current !== currentSearchId) return;

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

                    setResults(newResults);
                    rgChildRef.current = null;
                });

                command.stdout.on("data", (data) => {
                    if (searchIdRef.current === currentSearchId) {
                        stdout += data;
                    }
                });

                command.stderr.on("data", (data) => {
                    if (searchIdRef.current === currentSearchId && data) {
                        setError(data);
                    }
                });

                rgChildRef.current = await command.spawn();
            } catch (err) {
                throw err;
            }
        },
        []
    );

    // Debounced search effect
    useEffect(() => {
        if (!query.trim() || query.length < 2 || !searchPath.trim()) {
            killPreviousSearches();
            setResults([]);
            setFileResults([]);
            setError("");
            return;
        }

        const timer = setTimeout(async () => {
            await killPreviousSearches();

            const currentSearchId = ++searchIdRef.current;

            setLoading(true);
            setError("");
            setResults([]);
            setFileResults([]);

            try {
                await Promise.all([
                    runFileSearch(currentSearchId, query, searchPath),
                    runContentSearch(currentSearchId, query, searchPath),
                ]);
            } catch (err) {
                if (searchIdRef.current === currentSearchId) {
                    setError(String(err));
                }
            } finally {
                if (searchIdRef.current === currentSearchId) {
                    setLoading(false);
                }
            }
        }, 300);

        return () => clearTimeout(timer);
    }, [query, searchPath, killPreviousSearches, runFileSearch, runContentSearch]);

    return {
        query,
        setQuery,
        searchPath,
        setSearchPath,
        results,
        fileResults,
        loading,
        error,
    };
}
