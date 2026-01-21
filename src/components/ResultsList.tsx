import { Virtuoso } from "react-virtuoso";
import { openPath } from "@tauri-apps/plugin-opener";
import { SearchResult, FileResult, DocResult } from "../types";
import { highlightText } from "../utils/highlightText";

interface FileResultsListProps {
    data: FileResult[];
    query?: string;
    expandedTerms?: string[];
}

export function FileResultsList({ data, query, expandedTerms = [] }: FileResultsListProps) {
    const allTerms = query ? [query, ...expandedTerms] : expandedTerms;
    return (
        <Virtuoso
            style={{ height: "100%" }}
            data={data}
            itemContent={(_index, r) => (
                <div
                    onClick={() => openPath(r.path)}
                    title={r.path}
                    className="flex gap-2 hover:bg-gray-800 px-2 py-1 rounded cursor-pointer active:bg-gray-700"
                >
                    <span className="text-purple-400 truncate hover:underline">
                        {allTerms.length > 0 ? highlightText(r.filename, allTerms) : r.filename}
                    </span>
                    <span className="text-gray-500 truncate text-[10px]">{r.path}</span>
                </div>
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
        <Virtuoso
            style={{ height: "100%" }}
            data={data}
            itemContent={(_index, r) => (
                <div
                    onClick={() => openPath(r.path)}
                    title={r.path}
                    className="flex gap-2 hover:bg-gray-800 px-2 py-1 rounded cursor-pointer active:bg-gray-700"
                >
                    <span className="text-blue-400 truncate w-40 shrink-0 hover:underline">
                        {r.path.split("/").pop()}
                    </span>
                    <span className="text-yellow-500 shrink-0 w-10 text-right">
                        {r.lineNumber}
                    </span>
                    <span className="text-gray-300 truncate">{highlightText(r.lineContent, allTerms)}</span>
                </div>
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
        <Virtuoso
            style={{ height: "100%" }}
            data={data}
            itemContent={(_index, r) => (
                <div
                    onClick={() => openPath(r.path)}
                    title={r.path}
                    className="flex gap-2 hover:bg-gray-800 px-2 py-1 rounded cursor-pointer active:bg-gray-700"
                >
                    <span className="text-green-400 truncate w-40 shrink-0 hover:underline">
                        {r.path.split("/").pop()}
                    </span>
                    {r.lineNumber > 0 && (
                        <span className="text-yellow-500 shrink-0 w-10 text-right">
                            {r.lineNumber}
                        </span>
                    )}
                    <span className="text-gray-300 truncate">{highlightText(r.lineContent, allTerms)}</span>
                </div>
            )}
        />
    );
}
