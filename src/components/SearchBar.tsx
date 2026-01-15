import { open } from "@tauri-apps/plugin-dialog";

interface SearchBarProps {
    query: string;
    setQuery: (q: string) => void;
    searchPath: string;
    setSearchPath: (p: string) => void;
    loading: boolean;
    error: string;
}

export function SearchBar({
    query,
    setQuery,
    searchPath,
    setSearchPath,
    loading,
    error,
}: SearchBarProps) {
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
            </div>

            <div className="flex gap-4 mt-2 text-xs">
                {loading && <span className="text-blue-400">Searching...</span>}
                {error && <span className="text-red-400">{error}</span>}
            </div>
        </div>
    );
}
