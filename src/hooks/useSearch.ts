import { useState, useEffect, useRef, useCallback } from "react";
import { Command, Child } from "@tauri-apps/plugin-shell";
import { SearchResult, FileResult, DocResult } from "../types";
import { getDefaultProvider } from "../lib/llm";

/**
 * useSearch Hook - Manages file and content search functionality
 * 
 * This hook orchestrates three parallel search tools:
 * - fd: Fast filename search
 * - rg (ripgrep): Fast text content search  
 * - rga (ripgrep-all): Document search (PDFs, Word docs, etc.)
 * 
 * Flow:
 * 1. User types query → 300ms debounce → search starts
 * 2. All three tools run in parallel
 * 3. If results are sparse (<5), LLM suggests alternative search terms
 * 4. Alternative terms are searched and results are accumulated
 */

// Maximum number of results to store (prevents memory issues with huge result sets)
const MAX_RESULTS = 50000;
const MAX_FILE_RESULTS = 5000;

// If initial search returns fewer than this many results, trigger LLM expansion
const SPARSE_RESULTS_THRESHOLD = 5;

export function useSearch() {
    // ============ STATE ============
    // User input
    const [query, setQuery] = useState("");           // The search query text
    const [searchPath, setSearchPath] = useState(""); // Directory to search in

    // Search results (three separate arrays for the three tabs)
    const [results, setResults] = useState<SearchResult[]>([]);      // Content matches (rg)
    const [fileResults, setFileResults] = useState<FileResult[]>([]); // Filename matches (fd)
    const [docResults, setDocResults] = useState<DocResult[]>([]);   // Document matches (rga)

    // Loading states
    const [loading, setLoading] = useState(false);       // True while searching
    const [isExpanding, setIsExpanding] = useState(false); // True while LLM is generating terms

    // LLM expansion
    const [expandedTerms, setExpandedTerms] = useState<string[]>([]); // Terms suggested by LLM
    const [noInitialMatch, setNoInitialMatch] = useState(false);      // True if original query had sparse results

    const [error, setError] = useState("");

    // ============ REFS ============
    // searchIdRef: Increments with each new search. Used to ignore results from stale searches.
    // Example: User types "test", then quickly types "hello". We only want "hello" results.
    const searchIdRef = useRef(0);

    // Process references - we keep track of spawned processes so we can kill them
    // when a new search starts (prevents old results from polluting new searches)
    const fdChildRef = useRef<Child | null>(null);   // fd process
    const rgChildRef = useRef<Child | null>(null);   // rg process
    const rgaChildRef = useRef<Child | null>(null);  // rga process

    // ============ UTILITY FUNCTIONS ============

    /**
     * Kill all running search processes.
     * Called when: new search starts, user clicks Stop, or query is cleared.
     */
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

    /**
     * User-triggered stop - kills processes AND resets loading state.
     */
    const stopSearch = useCallback(async () => {
        // Increment search ID to invalidate any pending callbacks
        searchIdRef.current++;
        await killPreviousSearches();
        // Reset all loading states
        setLoading(false);
        setIsExpanding(false);
    }, [killPreviousSearches]);

    // ============ SEARCH FUNCTIONS ============
    // Each search function follows this pattern:
    // 1. Spawn a sidecar process (fd/rg/rga)
    // 2. Collect stdout data as it streams in
    // 3. On close, parse results and update state
    // 4. If accumulate=true, merge with existing results (for LLM expansion)
    // 5. If accumulate=false, replace results (for initial search)

    /**
     * Search filenames using fd (fast find alternative).
     */
    const runFileSearch = useCallback(
        (currentSearchId: number, q: string, path: string, accumulate = false): Promise<void> => {
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
                            if (accumulate) {
                                setFileResults(prev => {
                                    // Double-check searchId to prevent race conditions
                                    if (searchIdRef.current !== currentSearchId) return prev;
                                    const seen = new Set(prev.map(r => r.path));
                                    const unique = newFileResults.filter(r => !seen.has(r.path));
                                    return [...prev, ...unique].slice(0, MAX_FILE_RESULTS);
                                });
                            } else {
                                setFileResults(newFileResults);
                            }
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

    /**
     * Search file contents using rg (ripgrep).
     * Results include: file path, line number, and matching line content.
     */
    const runContentSearch = useCallback(
        (currentSearchId: number, q: string, path: string, accumulate = false): Promise<void> => {
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

                            if (accumulate) {
                                setResults(prev => {
                                    // Double-check searchId to prevent race conditions
                                    if (searchIdRef.current !== currentSearchId) return prev;
                                    const seen = new Set(prev.map(r => `${r.path}:${r.lineNumber}`));
                                    const unique = newResults.filter(r => !seen.has(`${r.path}:${r.lineNumber}`));
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

    /**
     * Search documents (PDFs, Word, etc.) using rga (ripgrep-all).
     * rga uses adapters (pdftotext, pandoc) to extract text from binary formats.
     */
    const runDocSearch = useCallback(
        (currentSearchId: number, q: string, path: string, accumulate = false): Promise<void> => {
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

                            if (accumulate) {
                                setDocResults(prev => {
                                    // Double-check searchId to prevent race conditions
                                    if (searchIdRef.current !== currentSearchId) return prev;
                                    const seen = new Set(prev.map(r => `${r.path}:${r.lineNumber}:${r.lineContent}`));
                                    const unique = newDocResults.filter(r => !seen.has(`${r.path}:${r.lineNumber}:${r.lineContent}`));
                                    return [...prev, ...unique].slice(0, MAX_RESULTS);
                                });
                            } else {
                                setDocResults(newDocResults);
                            }
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

    // ============ MAIN SEARCH EFFECT ============
    /**
     * This effect runs whenever query or searchPath changes.
     * It implements a 300ms debounce to avoid excessive searching while typing.
     * 
     * Flow:
     * 1. Clear previous results
     * 2. Start all three searches (fd, rg, rga) in parallel
     * 3. If sparse results, trigger LLM expansion
     * 4. Search for each LLM-suggested term and accumulate results
     */
    useEffect(() => {
        // Don't search if query is too short or path is empty
        if (!query.trim() || query.length < 2 || !searchPath.trim()) {
            killPreviousSearches();
            setResults([]);
            setFileResults([]);
            setDocResults([]);
            setError("");
            return;
        }

        // Debounce: wait 300ms after user stops typing
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

                // ============ LLM EXPANSION CHECK ============
                // After initial search, check if results are sparse.
                // If so, ask the LLM for alternative search terms.
                if (searchIdRef.current === currentSearchId) {
                    // We need nested setState to get the latest state values
                    // (React batches updates, so we can't read state directly)
                    setResults(currentResults => {
                        setFileResults(currentFileResults => {
                            setDocResults(currentDocResults => {
                                const totalResults = currentResults.length + currentFileResults.length + currentDocResults.length;
                                console.log("[Search] Total results:", totalResults, "Threshold:", SPARSE_RESULTS_THRESHOLD);

                                // Sparse results → trigger LLM expansion
                                if (totalResults < SPARSE_RESULTS_THRESHOLD && totalResults >= 0) {
                                    console.log("[Search] Sparse results, triggering expansion...");
                                    setNoInitialMatch(true);

                                    // Run expansion in separate async context (can't await inside setState)
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

                                            // Run searches for expanded terms (accumulate results)
                                            for (const term of terms) {
                                                if (searchIdRef.current !== currentSearchId) break;

                                                await Promise.all([
                                                    runFileSearch(currentSearchId, term, searchPath, true),
                                                    runContentSearch(currentSearchId, term, searchPath, true),
                                                    runDocSearch(currentSearchId, term, searchPath, true),
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
        stopSearch,
    };
}
