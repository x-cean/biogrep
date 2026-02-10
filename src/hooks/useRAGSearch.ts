import { useCallback } from "react";
import { getEmbedder } from "../lib/embeddings";
import { getVectorStore } from "../lib/vectorstore";

/**
 * Combined RAG search result (from vector or keyword search)
 */
export interface RAGResult {
    path: string;
    content: string;
    chunkIndex: number;
    score: number;
    source: "vector" | "keyword";
}

/**
 * useRAGSearch Hook - Combines vector and keyword search for RAG
 * 
 * Provides:
 * - Semantic search via vector embeddings
 * - Integration point for keyword search merging
 * - Score normalization and deduplication
 */
export function useRAGSearch() {
    /**
     * Search the vector store using semantic similarity
     * When folderIds is provided, only search within those folders
     */
    const searchVectors = useCallback(async (
        query: string,
        limit: number = 5,
        folderIds?: number[]
    ): Promise<RAGResult[]> => {
        try {
            const embedder = getEmbedder();
            const vectorStore = getVectorStore();

            // Initialize if needed (with embedder config for model-specific DB)
            await vectorStore.init(embedder.config.id, embedder.config.dimension);

            // Embed the query
            const queryEmbedding = await embedder.embed(query);

            // Search vector store — use Hybrid Search (Vector + Keyword)
            // This combines semantic search with full-text search using RRF
            // If folderIds is provided (even empty [] if all selected), it handles it
            const results = await vectorStore.searchHybrid(
                queryEmbedding,
                query,
                folderIds || [],
                limit
            );

            // Convert to RAGResult format
            // Lower distance = more similar, so we invert for score
            return results.map((r) => ({
                path: r.path,
                content: r.content,
                chunkIndex: r.chunk_index,
                // In hybrid search, 'distance' is actually 1.0 / RRF_score
                // So lower distance (higher RRF) is better.
                // We normalize it to a score here.
                score: 1 / (1 + r.distance),
                source: "vector" as const,
            }));
        } catch (err) {
            console.error("[RAGSearch] Vector search failed:", err);
            return [];
        }
    }, []);

    /**
     * Merge and deduplicate results from multiple sources
     * Keeps the highest-scoring entry for each unique path+chunk
     */
    const mergeResults = useCallback((
        ...resultSets: RAGResult[][]
    ): RAGResult[] => {
        const merged = new Map<string, RAGResult>();

        for (const results of resultSets) {
            for (const result of results) {
                const key = `${result.path}:${result.chunkIndex}`;
                const existing = merged.get(key);

                if (!existing || result.score > existing.score) {
                    merged.set(key, result);
                }
            }
        }

        // Sort by score descending
        return Array.from(merged.values()).sort((a, b) => b.score - a.score);
    }, []);

    /**
     * Perform hybrid search (vector + optional keyword results)
     * When folderIds is provided, scopes vector search to those folders
     */
    const search = useCallback(async (
        query: string,
        options: { vectorLimit?: number; folderIds?: number[]; keywordResults?: RAGResult[] } = {}
    ): Promise<RAGResult[]> => {
        const { vectorLimit = 5, folderIds, keywordResults = [] } = options;

        // Get vector search results (scoped to folders if provided)
        const vectorResults = await searchVectors(query, vectorLimit, folderIds);

        // Merge with any keyword results passed in
        const merged = mergeResults(vectorResults, keywordResults);

        console.log(`[RAGSearch] Found ${vectorResults.length} vector + ${keywordResults.length} keyword = ${merged.length} merged results${folderIds ? ` (folders: ${folderIds.join(',')})` : ''}`);

        return merged;
    }, [searchVectors, mergeResults]);

    /**
     * Format RAG results as context string for LLM
     */
    const formatContext = useCallback((results: RAGResult[]): string => {
        if (results.length === 0) return "";

        const parts = ["📚 Knowledge Base Context:"];

        results.forEach((r, i) => {
            const filename = r.path.split("/").pop() || r.path;
            const snippet = r.content.length > 300
                ? r.content.slice(0, 300) + "..."
                : r.content;
            parts.push(`\n[${i + 1}] ${filename} (${r.source}):`);
            parts.push(snippet);
        });

        return parts.join("\n");
    }, []);

    return {
        search,
        searchVectors,
        mergeResults,
        formatContext,
    };
}
