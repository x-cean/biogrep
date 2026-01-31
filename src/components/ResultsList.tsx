import { Virtuoso } from "react-virtuoso";
import { openPath } from "@tauri-apps/plugin-opener";
import { SearchResult, FileResult, DocResult } from "../types";
import { highlightText } from "../utils/highlightText";
import { useColumnResize } from "../hooks/useColumnResize";

interface FileResultsListProps {
    data: FileResult[];
    query?: string;
    expandedTerms?: string[];
}

export function FileResultsList({ data, query, expandedTerms = [] }: FileResultsListProps) {
    const allTerms = query ? [query, ...expandedTerms] : expandedTerms;
    const { width: filenameWidth, handleMouseDown } = useColumnResize(200, 80, 500);

    return (
        <Virtuoso
            style={{ height: "100%" }}
            data={data}
            itemContent={(_index, r) => (
                <div
                    title={r.path}
                    className="flex hover:bg-gray-800 px-2 py-1 rounded"
                >
                    <span
                        onClick={() => openPath(r.path)}
                        className="text-purple-400 truncate hover:underline shrink-0 cursor-pointer"
                        style={{ width: filenameWidth }}
                    >
                        {allTerms.length > 0 ? highlightText(r.filename, allTerms) : r.filename}
                    </span>
                    <div
                        className="w-px mx-1 bg-gray-600 hover:bg-blue-400 hover:w-1 cursor-col-resize shrink-0 transition-all"
                        onMouseDown={handleMouseDown}
                        onClick={(e) => e.stopPropagation()}
                    />
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
    const { width: pathWidth, handleMouseDown } = useColumnResize(160, 80, 400);

    return (
        <Virtuoso
            style={{ height: "100%" }}
            data={data}
            itemContent={(_index, r) => (
                <div
                    title={r.path}
                    className="flex hover:bg-gray-800 px-2 py-1 rounded"
                >
                    <span
                        onClick={() => openPath(r.path)}
                        className="text-blue-400 truncate hover:underline shrink-0 cursor-pointer"
                        style={{ width: pathWidth }}
                    >
                        {r.path.split("/").pop()}
                    </span>
                    <div
                        className="w-px mx-1 bg-gray-600 hover:bg-blue-400 hover:w-1 cursor-col-resize shrink-0 transition-all"
                        onMouseDown={handleMouseDown}
                        onClick={(e) => e.stopPropagation()}
                    />
                    <span className="text-yellow-500 shrink-0 w-10 text-right mr-2">
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
    const { width: pathWidth, handleMouseDown } = useColumnResize(160, 80, 400);

    return (
        <Virtuoso
            style={{ height: "100%" }}
            data={data}
            itemContent={(_index, r) => (
                <div
                    title={r.path}
                    className="flex hover:bg-gray-800 px-2 py-1 rounded"
                >
                    <span
                        onClick={() => openPath(r.path)}
                        className="text-green-400 truncate hover:underline shrink-0 cursor-pointer"
                        style={{ width: pathWidth }}
                    >
                        {r.path.split("/").pop()}
                    </span>
                    <div
                        className="w-px mx-1 bg-gray-600 hover:bg-blue-400 hover:w-1 cursor-col-resize shrink-0 transition-all"
                        onMouseDown={handleMouseDown}
                        onClick={(e) => e.stopPropagation()}
                    />
                    {r.lineNumber > 0 && (
                        <span className="text-yellow-500 shrink-0 w-10 text-right mr-2">
                            {r.lineNumber}
                        </span>
                    )}
                    <span className="text-gray-300 truncate">{highlightText(r.lineContent, allTerms)}</span>
                </div>
            )}
        />
    );
}

