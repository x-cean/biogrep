import { useState, useCallback } from "react";
import { getDefaultProvider } from "../lib/llm";
import { SearchResult, FileResult, DocResult } from "../types";

/**
 * useQueryExpansion Hook - LLM-powered query expansion
 * 
 * When search results are sparse, this hook uses an LLM to suggest
 * alternative search terms that might find related content.
 */

// If initial search returns fewer than this many results, trigger LLM expansion
const SPARSE_RESULTS_THRESHOLD = 5;

interface UseQueryExpansionOptions {
    getSearchId: () => number;
    runFileSearch: (
        searchId: number,
        query: string,
        path: string,
        accumulate: boolean,
        setResults: React.Dispatch<React.SetStateAction<FileResult[]>>
    ) => Promise<void>;
    runContentSearch: (
        searchId: number,
        query: string,
        path: string,
        accumulate: boolean,
        setResults: React.Dispatch<React.SetStateAction<SearchResult[]>>,
        setError: React.Dispatch<React.SetStateAction<string>>
    ) => Promise<void>;
    runDocSearch: (
        searchId: number,
        query: string,
        path: string,
        accumulate: boolean,
        setResults: React.Dispatch<React.SetStateAction<DocResult[]>>
    ) => Promise<void>;
}

export function useQueryExpansion({
    getSearchId,
    runFileSearch,
    runContentSearch,
    runDocSearch,
}: UseQueryExpansionOptions) {
    const [isExpanding, setIsExpanding] = useState(false);
    const [expandedTerms, setExpandedTerms] = useState<string[]>([]);
    const [noInitialMatch, setNoInitialMatch] = useState(false);

    /**
     * Check if results are sparse and trigger LLM expansion if needed.
     */
    const checkAndExpand = useCallback(
        async (
            currentSearchId: number,
            query: string,
            searchPath: string,
            totalResults: number,
            setFileResults: React.Dispatch<React.SetStateAction<FileResult[]>>,
            setResults: React.Dispatch<React.SetStateAction<SearchResult[]>>,
            setDocResults: React.Dispatch<React.SetStateAction<DocResult[]>>,
            setError: React.Dispatch<React.SetStateAction<string>>
        ) => {
            console.log("[Search] Total results:", totalResults, "Threshold:", SPARSE_RESULTS_THRESHOLD);

            if (totalResults >= SPARSE_RESULTS_THRESHOLD || getSearchId() !== currentSearchId) {
                return;
            }

            console.log("[Search] Sparse results, triggering expansion...");
            setNoInitialMatch(true);

            const provider = getDefaultProvider();
            if (!provider.isConfigured()) {
                console.log("[Search] Provider not configured, skipping expansion");
                return;
            }

            setIsExpanding(true);
            try {
                const terms = await provider.expandQuery(query);
                if (getSearchId() !== currentSearchId || terms.length === 0) {
                    setIsExpanding(false);
                    return;
                }

                setExpandedTerms(terms);

                // Run searches for expanded terms (accumulate results)
                // Run searches for expanded terms (accumulate results)
                // Combine terms into a single regex query for efficiency
                // e.g. (term1|term2|term3)
                const combinedQuery = `(${terms.join("|")})`;

                await Promise.all([
                    runFileSearch(currentSearchId, combinedQuery, searchPath, true, setFileResults),
                    runContentSearch(currentSearchId, combinedQuery, searchPath, true, setResults, setError),
                    runDocSearch(currentSearchId, combinedQuery, searchPath, true, setDocResults),
                ]);
            } catch (err) {
                console.error("Query expansion failed:", err);
            } finally {
                if (getSearchId() === currentSearchId) {
                    setIsExpanding(false);
                }
            }
        },
        [getSearchId, runFileSearch, runContentSearch, runDocSearch]
    );

    /**
     * Reset expansion state for a new search.
     */
    const resetExpansion = useCallback(() => {
        setExpandedTerms([]);
        setIsExpanding(false);
        setNoInitialMatch(false);
    }, []);

    return {
        isExpanding,
        expandedTerms,
        noInitialMatch,
        checkAndExpand,
        resetExpansion,
    };
}
