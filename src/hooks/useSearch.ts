import { useState, useEffect, useRef, useCallback } from "react";
import { Command, Child } from "@tauri-apps/plugin-shell";
import { SearchResult, FileResult, DocResult } from "../types";
import { getDefaultProvider } from "../lib/llm";

const MAX_RESULTS = 50000;
const MAX_FILE_RESULTS = 5000;
const SPARSE_RESULTS_THRESHOLD = 5;

export function useSearch() {
    const [query, setQuery] = useState("");
    const [searchPath, setSearchPath] = useState("");
    const [results, setResults] = useState<SearchResult[]>([]);
    const [fileResults, setFileResults] = useState<FileResult[]>([]);
    const [docResults, setDocResults] = useState<DocResult[]>([]);
    const [loading, setLoading] = useState(false);
    const [isExpanding, setIsExpanding] = useState(false);
    const [expandedTerms, setExpandedTerms] = useState<string[]>([]);
    const [noInitialMatch, setNoInitialMatch] = useState(false);
    const [error, setError] = useState("");

    const searchIdRef = useRef(0);
    const fdChildRef = useRef<Child | null>(null);
    const rgChildRef = useRef<Child | null>(null);
    const rgaChildRef = useRef<Child | null>(null);

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
        if (rgaChildRef.current) {
            try {
                await rgaChildRef.current.kill();
            } catch {
                // Process may have already exited
            }
            rgaChildRef.current = null;
        }
    }, []);

    const runFileSearch = useCallback(
        (currentSearchId: number, q: string, path: string): Promise<void> => {
            return new Promise((resolve) => {
                try {
                    const command = Command.sidecar("binaries/fd", [
                        q,
                        path,
                        "--max-results",
                        String(MAX_FILE_RESULTS),
                    ]);

                    let stdout = "";

                    command.on("close", () => {
                        if (searchIdRef.current === currentSearchId && stdout) {
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
                        resolve();
                    });

                    command.stdout.on("data", (data) => {
                        if (searchIdRef.current === currentSearchId) {
                            stdout += data;
                        }
                    });

                    command.stderr.on("data", (data) => {
                        console.error("fd stderr:", data);
                    });

                    command.spawn().then((child) => {
                        fdChildRef.current = child;
                    }).catch((err) => {
                        console.error("fd spawn failed:", err);
                        resolve();
                    });
                } catch (err) {
                    console.error("fd search failed:", err);
                    resolve();
                }
            });
        },
        []
    );

    const runContentSearch = useCallback(
        (currentSearchId: number, q: string, path: string): Promise<void> => {
            return new Promise((resolve) => {
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
                        if (searchIdRef.current === currentSearchId) {
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
                        }
                        rgChildRef.current = null;
                        resolve();
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

                    command.spawn().then((child) => {
                        rgChildRef.current = child;
                    }).catch((err) => {
                        console.error("rg spawn failed:", err);
                        resolve();
                    });
                } catch (err) {
                    console.error("rg search failed:", err);
                    resolve();
                }
            });
        },
        []
    );

    const runDocSearch = useCallback(
        (currentSearchId: number, q: string, path: string): Promise<void> => {
            return new Promise((resolve) => {
                try {
                    // Pass PATH so rga can find adapter binaries like pdftotext and pandoc
                    const command = Command.sidecar("binaries/rga", [
                        "--json",
                        "--max-count",
                        "50",
                        q,
                        path,
                    ], {
                        env: {
                            PATH: "/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin"
                        }
                    });

                    let stdout = "";

                    command.on("close", () => {
                        if (searchIdRef.current === currentSearchId) {
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

                            setDocResults(newDocResults);
                        }
                        rgaChildRef.current = null;
                        resolve();
                    });

                    command.stdout.on("data", (data) => {
                        if (searchIdRef.current === currentSearchId) {
                            stdout += data;
                        }
                    });

                    command.stderr.on("data", (data) => {
                        console.error("rga stderr:", data);
                    });

                    command.spawn().then((child) => {
                        rgaChildRef.current = child;
                    }).catch((err) => {
                        console.error("rga spawn failed:", err);
                        resolve();
                    });
                } catch (err) {
                    console.error("rga search failed:", err);
                    resolve();
                }
            });
        },
        []
    );

    // Debounced search effect
    useEffect(() => {
        if (!query.trim() || query.length < 2 || !searchPath.trim()) {
            killPreviousSearches();
            setResults([]);
            setFileResults([]);
            setDocResults([]);
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
            setDocResults([]);
            setExpandedTerms([]);
            setIsExpanding(false);
            setNoInitialMatch(false);

            try {
                // Run initial search
                await Promise.all([
                    runFileSearch(currentSearchId, query, searchPath),
                    runContentSearch(currentSearchId, query, searchPath),
                    runDocSearch(currentSearchId, query, searchPath),
                ]);

                // Check if we should expand (after initial search completes)
                if (searchIdRef.current === currentSearchId) {
                    // Get current result counts from state via refs or check state
                    // We need to use a callback pattern to get latest state
                    setResults(currentResults => {
                        setFileResults(currentFileResults => {
                            setDocResults(currentDocResults => {
                                const totalResults = currentResults.length + currentFileResults.length + currentDocResults.length;
                                console.log("[Search] Total results:", totalResults, "Threshold:", SPARSE_RESULTS_THRESHOLD);

                                if (totalResults < SPARSE_RESULTS_THRESHOLD && totalResults >= 0) {
                                    console.log("[Search] Sparse results, triggering expansion...");
                                    setNoInitialMatch(true);
                                    // Trigger expansion in a separate async context
                                    (async () => {
                                        if (searchIdRef.current !== currentSearchId) return;

                                        const provider = getDefaultProvider();
                                        if (!provider.isConfigured()) {
                                            console.log("[Search] Provider not configured, skipping expansion");
                                            return;
                                        }

                                        setIsExpanding(true);
                                        try {
                                            const terms = await provider.expandQuery(query);
                                            if (searchIdRef.current !== currentSearchId || terms.length === 0) {
                                                setIsExpanding(false);
                                                return;
                                            }

                                            setExpandedTerms(terms);

                                            // Run searches for expanded terms
                                            for (const term of terms) {
                                                if (searchIdRef.current !== currentSearchId) break;

                                                await Promise.all([
                                                    runFileSearch(currentSearchId, term, searchPath),
                                                    runContentSearch(currentSearchId, term, searchPath),
                                                    runDocSearch(currentSearchId, term, searchPath),
                                                ]);
                                            }
                                        } catch (err) {
                                            console.error("Query expansion failed:", err);
                                        } finally {
                                            if (searchIdRef.current === currentSearchId) {
                                                setIsExpanding(false);
                                            }
                                        }
                                    })();
                                }
                                return currentDocResults;
                            });
                            return currentFileResults;
                        });
                        return currentResults;
                    });
                }
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
    }, [query, searchPath, killPreviousSearches, runFileSearch, runContentSearch, runDocSearch]);

    return {
        query,
        setQuery,
        searchPath,
        setSearchPath,
        results,
        fileResults,
        docResults,
        loading,
        isExpanding,
        expandedTerms,
        noInitialMatch,
        error,
    };
}
