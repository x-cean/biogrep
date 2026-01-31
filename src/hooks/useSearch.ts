import { useState, useEffect, useCallback } from "react";
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
            resetExpansion();

            try {
                // Run initial search in parallel
                await Promise.all([
                    runFileSearch(currentSearchId, query, searchPath, false, setFileResults),
                    runContentSearch(currentSearchId, query, searchPath, false, setResults, setError),
                    runDocSearch(currentSearchId, query, searchPath, false, setDocResults),
                ]);

                // Check for sparse results and trigger expansion
                if (getSearchId() === currentSearchId) {
                    // Read current results counts
                    setResults((currentResults) => {
                        setFileResults((currentFileResults) => {
                            setDocResults((currentDocResults) => {
                                const totalResults =
                                    currentResults.length +
                                    currentFileResults.length +
                                    currentDocResults.length;

                                // Trigger expansion in async context
                                checkAndExpand(
                                    currentSearchId,
                                    query,
                                    searchPath,
                                    totalResults,
                                    setFileResults,
                                    setResults,
                                    setDocResults,
                                    setError
                                );

                                return currentDocResults;
                            });
                            return currentFileResults;
                        });
                        return currentResults;
                    });
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
