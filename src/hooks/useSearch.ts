import { useState, useEffect, useCallback, useRef } from "react";
import { SearchResult, FileResult, DocResult } from "../types";
import { useProcessManager } from "./useProcessManager";
import { useFileSearch } from "./useFileSearch";
import { useContentSearch } from "./useContentSearch";
import { useDocSearch } from "./useDocSearch";
import { useQueryExpansion } from "./useQueryExpansion";

/**
 * useSearch Hook - Orchestrates file and content search functionality
 * 
 * This hook composes smaller specialized hooks to provide:
 * - fd: Fast filename search
 * - rg (ripgrep): Fast text content search  
 * - rga (ripgrep-all): Document search (PDFs, Word docs, etc.)
 * - LLM query expansion when results are sparse
 * 
 * Flow:
 * 1. User types query → 300ms debounce → search starts
 * 2. All three tools run in parallel
 * 3. If results are sparse (<5), LLM suggests alternative search terms
 * 4. Alternative terms are searched and results are accumulated
 */

export function useSearch() {
    // ============ USER INPUT STATE ============
    const [query, setQuery] = useState("");
    const [searchPath, setSearchPath] = useState("");

    // ============ RESULTS STATE ============
    const [results, setResults] = useState<SearchResult[]>([]);
    const [fileResults, setFileResults] = useState<FileResult[]>([]);
    const [docResults, setDocResults] = useState<DocResult[]>([]);

    // ============ REFS FOR RESULTS (to read counts without setState callbacks) ============
    const resultsRef = useRef<SearchResult[]>([]);
    const fileResultsRef = useRef<FileResult[]>([]);
    const docResultsRef = useRef<DocResult[]>([]);

    // ============ UI STATE ============
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");

    // ============ COMPOSED HOOKS ============
    const {
        fdChildRef,
        rgChildRef,
        rgaChildRef,
        killAllProcesses,
        incrementSearchId,
        getSearchId,
    } = useProcessManager();

    const { runFileSearch } = useFileSearch({ fdChildRef, getSearchId });
    const { runContentSearch } = useContentSearch({ rgChildRef, getSearchId });
    const { runDocSearch } = useDocSearch({ rgaChildRef, getSearchId });

    const {
        isExpanding,
        expandedTerms,
        noInitialMatch,
        checkAndExpand,
        resetExpansion,
    } = useQueryExpansion({
        getSearchId,
        runFileSearch,
        runContentSearch,
        runDocSearch,
    });

    // ============ ACTIONS ============

    /**
     * User-triggered stop - kills processes AND resets loading state.
     */
    const stopSearch = useCallback(async () => {
        incrementSearchId();
        await killAllProcesses();
        setLoading(false);
        resetExpansion();
    }, [killAllProcesses, incrementSearchId, resetExpansion]);

    // ============ MAIN SEARCH EFFECT ============
    useEffect(() => {
        // Don't search if query is too short or path is empty
        if (!query.trim() || query.length < 2 || !searchPath.trim()) {
            killAllProcesses();
            setResults([]);
            setFileResults([]);
            setDocResults([]);
            setError("");
            return;
        }

        // Debounce: wait 300ms after user stops typing
        const timer = setTimeout(async () => {
            await killAllProcesses();

            const currentSearchId = incrementSearchId();

            setLoading(true);
            setError("");
            setResults([]);
            setFileResults([]);
            setDocResults([]);
            // Also clear refs
            resultsRef.current = [];
            fileResultsRef.current = [];
            docResultsRef.current = [];
            resetExpansion();

            try {
                // Transform query if it contains commas (multi-term search)
                let effectiveQuery = query;
                if (query.includes(",")) {
                    const terms = query
                        .split(",")
                        .map((t) => t.trim())
                        .filter((t) => t.length > 0);

                    if (terms.length > 1) {
                        effectiveQuery = `(${terms.join("|")})`;
                    } else if (terms.length === 1) {
                        // Handle "term1," case - just search "term1"
                        effectiveQuery = terms[0];
                    }
                }

                // Run initial search in parallel, with wrapper setters that also update refs
                const wrappedSetResults = (updater: React.SetStateAction<SearchResult[]>) => {
                    setResults(prev => {
                        const next = typeof updater === 'function' ? updater(prev) : updater;
                        resultsRef.current = next;
                        return next;
                    });
                };
                const wrappedSetFileResults = (updater: React.SetStateAction<FileResult[]>) => {
                    setFileResults(prev => {
                        const next = typeof updater === 'function' ? updater(prev) : updater;
                        fileResultsRef.current = next;
                        return next;
                    });
                };
                const wrappedSetDocResults = (updater: React.SetStateAction<DocResult[]>) => {
                    setDocResults(prev => {
                        const next = typeof updater === 'function' ? updater(prev) : updater;
                        docResultsRef.current = next;
                        return next;
                    });
                };

                await Promise.all([
                    runFileSearch(currentSearchId, effectiveQuery, searchPath, false, wrappedSetFileResults),
                    runContentSearch(currentSearchId, effectiveQuery, searchPath, false, wrappedSetResults, setError),
                    runDocSearch(currentSearchId, effectiveQuery, searchPath, false, wrappedSetDocResults),
                ]);

                // Check for sparse results and trigger expansion
                // Use refs to read counts directly (avoids calling async code inside setState)
                if (getSearchId() === currentSearchId) {
                    const totalResults =
                        resultsRef.current.length +
                        fileResultsRef.current.length +
                        docResultsRef.current.length;

                    // Trigger expansion (async but called outside setState)
                    checkAndExpand(
                        currentSearchId,
                        query,
                        searchPath,
                        totalResults,
                        wrappedSetFileResults,
                        wrappedSetResults,
                        wrappedSetDocResults,
                        setError
                    );
                }
            } catch (err) {
                if (getSearchId() === currentSearchId) {
                    setError(String(err));
                }
            } finally {
                if (getSearchId() === currentSearchId) {
                    setLoading(false);
                }
            }
        }, 300);

        return () => clearTimeout(timer);
    }, [
        query,
        searchPath,
        killAllProcesses,
        incrementSearchId,
        getSearchId,
        runFileSearch,
        runContentSearch,
        runDocSearch,
        checkAndExpand,
        resetExpansion,
    ]);

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
