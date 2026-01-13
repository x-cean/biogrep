import { useState, useEffect, useRef } from "react";
import { Command } from "@tauri-apps/plugin-shell";

interface SearchResult {
  path: string;
  lineNumber: number;
  lineContent: string;
}

const MAX_RESULTS = 1000;

function App() {
  const [query, setQuery] = useState("");
  const [searchPath, setSearchPath] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const searchIdRef = useRef(0);

  // Debounced search - waits 300ms after typing stops
  useEffect(() => {
    if (!query.trim() || query.length < 2 || !searchPath.trim()) {
      setResults([]);
      setError("");
      return;
    }

    const timer = setTimeout(() => runSearch(), 300);
    return () => clearTimeout(timer);
  }, [query, searchPath]);

  async function runSearch() {
    const currentSearchId = ++searchIdRef.current;

    setLoading(true);
    setError("");
    setResults([]);

    try {
      const command = Command.sidecar("binaries/rg", [
        "--json",
        "--max-count", "50",
        query,
        searchPath,
      ]);
      const output = await command.execute();

      // Check if this search is still current (user may have typed again)
      if (searchIdRef.current !== currentSearchId) {
        return;
      }

      const newResults: SearchResult[] = [];

      if (output.stdout) {
        const lines = output.stdout.split("\n");

        for (const line of lines) {
          if (!line.trim()) continue;
          if (newResults.length >= MAX_RESULTS) break;

          try {
            const json = JSON.parse(line);
            if (json.type === "match" && json.data) {
              const d = json.data;
              newResults.push({
                path: d.path?.text || "?",
                lineNumber: d.line_number || 0,
                lineContent: (d.lines?.text || "").trim().slice(0, 200),
              });
            }
          } catch {
            // skip non-JSON lines
          }
        }
      }

      setResults(newResults);

      if (output.stderr && output.code !== 0) {
        setError(output.stderr);
      }
    } catch (err) {
      setError(String(err));
    } finally {
      if (searchIdRef.current === currentSearchId) {
        setLoading(false);
      }
    }
  }

  return (
    <main className="flex flex-col h-screen bg-gray-900 text-white">
      <div className="p-4 border-b border-gray-800">
        <h1 className="text-xl font-bold mb-3">🧬 BioGrep</h1>

        <div className="flex gap-2">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search content (min 2 chars)..."
            className="flex-1 px-3 py-2 bg-gray-800 rounded border border-gray-700 focus:border-blue-500 outline-none text-sm"
            autoFocus
          />
          <input
            type="text"
            value={searchPath}
            onChange={(e) => setSearchPath(e.target.value)}
            placeholder="/Users/xhome/VBProjects"
            className="w-80 px-3 py-2 bg-gray-800 rounded border border-gray-700 focus:border-blue-500 outline-none text-sm"
          />
        </div>

        <div className="flex gap-4 mt-2 text-xs">
          {loading && <span className="text-blue-400">Searching...</span>}
          {results.length > 0 && (
            <span className="text-green-400">
              {results.length >= MAX_RESULTS ? `${MAX_RESULTS}+ results` : `${results.length} results`}
            </span>
          )}
          {error && <span className="text-red-400">{error}</span>}
        </div>
      </div>

      <div className="flex-1 overflow-auto p-2 font-mono text-xs">
        {results.map((r, i) => (
          <div
            key={i}
            className="flex gap-2 hover:bg-gray-800 px-2 py-1 rounded cursor-pointer"
          >
            <span className="text-gray-500 truncate w-36 shrink-0">
              {r.path.split("/").pop()}
            </span>
            <span className="text-yellow-500 shrink-0 w-10 text-right">
              {r.lineNumber}
            </span>
            <span className="text-gray-300 truncate">{r.lineContent}</span>
          </div>
        ))}

        {!loading && results.length === 0 && query.length >= 2 && searchPath && (
          <p className="text-gray-500 p-4">No results</p>
        )}

        {!searchPath && (
          <p className="text-gray-500 p-4">
            Enter a path like <code className="bg-gray-800 px-1 rounded">/Users/xhome/VBProjects</code> and search for <code className="bg-gray-800 px-1 rounded">import</code>
          </p>
        )}
      </div>
    </main>
  );
}

export default App;
