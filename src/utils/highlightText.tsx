import React from "react";

/**
 * Highlights all occurrences of a search query within text.
 * Returns a React element with matched portions wrapped in <mark> tags.
 */
export function highlightText(text: string, query: string): React.ReactNode {
    if (!query || query.length < 2) {
        return text;
    }

    // Escape special regex characters in the query
    const escapedQuery = query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

    // Create case-insensitive regex
    const regex = new RegExp(`(${escapedQuery})`, "gi");
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
