import React from "react";

/**
 * Highlights all occurrences of search queries within text.
 * Accepts a single query or an array of queries (for LLM-expanded terms).
 * Returns a React element with matched portions wrapped in <mark> tags.
 */
export function highlightText(text: string, queries: string | string[]): React.ReactNode {
    // Normalize to array, split by commas, and filter empty/short queries
    const rawList: string[] = Array.isArray(queries) ? queries : [queries];

    // Flatten and split any comma-separated strings
    const queryList = rawList
        .flatMap(q => q.includes(",") ? q.split(",") : [q])
        .map(q => q.trim())
        .filter(q => q && q.length >= 2);

    if (queryList.length === 0) {
        return text;
    }

    // Escape special regex characters and join with OR
    const escapedQueries = queryList.map(q =>
        q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
    );

    // Create case-insensitive regex matching any of the terms
    const regex = new RegExp(`(${escapedQueries.join("|")})`, "gi");
    const parts = text.split(regex);

    if (parts.length === 1) {
        // No matches found
        return text;
    }

    return (
        <>
            {parts.map((part, i) =>
                regex.test(part) ? (
                    <mark
                        key={i}
                        className="bg-yellow-500/40 text-yellow-200 rounded px-0.5"
                    >
                        {part}
                    </mark>
                ) : (
                    part
                )
            )}
        </>
    );
}

