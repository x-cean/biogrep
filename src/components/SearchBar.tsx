import { useState, useEffect } from "react";
import { open } from "@tauri-apps/plugin-dialog";

interface SearchBarProps {
    query: string;
    setQuery: (q: string) => void;
    searchPath: string;
    setSearchPath: (p: string) => void;
    loading: boolean;
    isExpanding: boolean;
    expandedTerms: string[];
    noInitialMatch: boolean;
    error: string;
    stopSearch: () => void;
}

export function SearchBar({
    query,
    setQuery,
    searchPath,
    setSearchPath,
    loading,
    isExpanding,
    expandedTerms,
    noInitialMatch,
    error,
    stopSearch,
}: SearchBarProps) {
    const [dots, setDots] = useState("");

    // Animate dots while loading or expanding
    useEffect(() => {
        if (!loading && !isExpanding) {
            setDots("");
            return;
        }
        const interval = setInterval(() => {
            setDots((prev) => (prev.length >= 3 ? "" : prev + "."));
        }, 400);
        return () => clearInterval(interval);
    }, [loading, isExpanding]);

    const handleBrowse = async () => {
        const selected = await open({ directory: true, multiple: false });
        if (selected) {
            setSearchPath(selected as string);
        }
    };

    return (
        <div className="p-4 border-b border-gray-800">
            <h1 className="text-xl font-bold mb-3">🧬 BioGrep</h1>

            <div className="flex gap-2">
                <input
                    type="text"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Search files & content (min 2 chars)..."
                    className="flex-1 px-3 py-2 bg-gray-800 rounded border border-gray-700 focus:border-blue-500 outline-none text-sm placeholder:text-gray-500 placeholder:italic"
                    autoFocus
                />
                <input
                    type="text"
                    value={searchPath}
                    onChange={(e) => setSearchPath(e.target.value)}
                    placeholder="/path/to/folder"
                    className="w-64 px-3 py-2 bg-gray-800 rounded border border-gray-700 focus:border-blue-500 outline-none text-sm placeholder:text-gray-500 placeholder:italic"
                />
                <button
                    onClick={handleBrowse}
                    className="px-3 py-2 bg-gray-700 hover:bg-gray-600 rounded border border-gray-600 text-sm transition-colors"
                >
                    Browse
                </button>
                {(loading || isExpanding) && (
                    <button
                        onClick={stopSearch}
                        className="px-3 py-2 bg-red-600 hover:bg-red-500 rounded border border-red-500 text-sm transition-colors"
                    >
                        Stop
                    </button>
                )}
            </div>

            <div className="flex flex-col gap-1 mt-2 text-xs">
                {loading && !isExpanding && (
                    <span className="text-blue-400">
                        Searching<span className="inline-block w-4">{dots}</span>
                    </span>
                )}
                {noInitialMatch && !isExpanding && !loading && expandedTerms.length === 0 && (
                    <span className="text-yellow-400">
                        Found no match for "{query}"
                    </span>
                )}
                {noInitialMatch && isExpanding && (
                    <>
                        <span className="text-yellow-400">
                            Found no match for "{query}"
                        </span>
                        <span className="text-purple-400">
                            Searching {expandedTerms.join(", ")}<span className="inline-block w-4">{dots}</span>
                        </span>
                    </>
                )}
                {noInitialMatch && !isExpanding && expandedTerms.length > 0 && (
                    <>
                        <span className="text-gray-500">
                            Found no match for "{query}"
                        </span>
                        <span className="text-gray-400">
                            Also searched: {expandedTerms.join(", ")}
                        </span>
                    </>
                )}
                {error && <span className="text-red-400">{error}</span>}
            </div>
        </div>
    );
}

