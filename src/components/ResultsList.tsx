/**
 * ResultsList Components - Specialized result displays
 * 
 * This file contains three result list components, each specialized
 * for a different search type. All use UnifiedResultList internally.
 * 
 * - FileResultsList: Displays fd filename search results
 * - ContentResultsList: Displays rg text content search results  
 * - DocResultsList: Displays rga document search results
 * 
 * Each component:
 * - Highlights matched terms in the results
 * - Opens the file when the primary column is clicked
 * - Shows the file path in the secondary column
 */
import { openPath } from "@tauri-apps/plugin-opener";
import { SearchResult, FileResult, DocResult } from "../types";
import { highlightText } from "../utils/highlightText";
import { UnifiedResultList } from "./UnifiedResultList";
import { CONFIG } from "../config";

interface FileResultsListProps {
    data: FileResult[];
    query?: string;
    expandedTerms?: string[];
}

export function FileResultsList({ data, query, expandedTerms = [] }: FileResultsListProps) {
    const allTerms = query ? [query, ...expandedTerms] : expandedTerms;

    return (
        <UnifiedResultList
            data={data}
            initialColumnWidth={CONFIG.UI.COLUMN_WIDTHS.FILENAME_DEFAULT}
            onPrimaryClick={(r) => openPath(r.path)}
            renderPrimaryColumn={(r) => (
                <span className="text-purple-400">
                    {allTerms.length > 0 ? highlightText(r.filename, allTerms) : r.filename}
                </span>
            )}
            renderSecondaryContent={(r) => (
                <span className="text-gray-500 truncate text-[10px]">{r.path}</span>
            )}
        />
    );
}

interface ContentResultsListProps {
    data: SearchResult[];
    query: string;
    expandedTerms?: string[];
}

export function ContentResultsList({ data, query, expandedTerms = [] }: ContentResultsListProps) {
    const allTerms = [query, ...expandedTerms];

    return (
        <UnifiedResultList
            data={data}
            initialColumnWidth={CONFIG.UI.COLUMN_WIDTHS.PATH_DEFAULT}
            onPrimaryClick={(r) => openPath(r.path)}
            renderPrimaryColumn={(r) => (
                <span className="text-blue-400">
                    {r.path ? r.path.split("/").pop() : "Unknown File"}
                </span>
            )}
            renderSecondaryContent={(r) => (
                <>
                    <span className="text-yellow-500 shrink-0 w-10 text-right mr-2 font-mono">
                        {r.lineNumber}
                    </span>
                    <span className="text-gray-300 truncate font-mono">
                        {r.lineContent ? highlightText(r.lineContent, allTerms) : ""}
                    </span>
                </>
            )}
        />
    );
}

interface DocResultsListProps {
    data: DocResult[];
    query: string;
    expandedTerms?: string[];
}

export function DocResultsList({ data, query, expandedTerms = [] }: DocResultsListProps) {
    const allTerms = [query, ...expandedTerms];

    return (
        <UnifiedResultList
            data={data}
            initialColumnWidth={CONFIG.UI.COLUMN_WIDTHS.PATH_DEFAULT}
            onPrimaryClick={(r) => openPath(r.path)}
            renderPrimaryColumn={(r) => (
                <span className="text-green-400">
                    {r.path ? r.path.split("/").pop() : "Unknown File"}
                </span>
            )}
            renderSecondaryContent={(r) => (
                <>
                    {r.lineNumber > 0 && (
                        <span className="text-yellow-500 shrink-0 w-10 text-right mr-2 font-mono">
                            {r.lineNumber}
                        </span>
                    )}
                    <span className="text-gray-300 truncate font-mono">
                        {r.lineContent ? highlightText(r.lineContent, allTerms) : ""}
                    </span>
                </>
            )}
        />
    );
}

