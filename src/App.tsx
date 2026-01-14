import { useState, useEffect, useRef } from "react";
import { Command } from "@tauri-apps/plugin-shell";
import { openPath } from "@tauri-apps/plugin-opener";

interface SearchResult {
  path: string;
  lineNumber: number;
  lineContent: string;
}

interface FileResult {
  path: string;
  filename: string;
}

const MAX_RESULTS = 1000;
const MAX_FILE_RESULTS = 100;

function App() {
  const [query, setQuery] = useState("");
  const [searchPath, setSearchPath] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [fileResults, setFileResults] = useState<FileResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const searchIdRef = useRef(0);

  // Debounced search - waits 300ms after typing stops
  useEffect(() => {
    if (!query.trim() || query.length < 2 || !searchPath.trim()) {
      setResults([]);
      setFileResults([]);
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
    setFileResults([]);

    try {
      // Run both searches in parallel
      await Promise.all([
        runFileSearch(currentSearchId),
        runContentSearch(currentSearchId),
      ]);
    } catch (err) {
      if (searchIdRef.current === currentSearchId) {
        setError(String(err));
      }
    } finally {
      if (searchIdRef.current === currentSearchId) {
        setLoading(false);
      }
    }
  }

  async function runFileSearch(currentSearchId: number) {
    try {
      const command = Command.sidecar("binaries/fd", [
        query,
        searchPath,
        "--max-results",
        String(MAX_FILE_RESULTS),
      ]);
      const output = await command.execute();

      if (searchIdRef.current !== currentSearchId) return;

      if (output.stdout) {
        const lines = output.stdout.split("\n").filter((line) => line.trim());
        const newFileResults: FileResult[] = lines.map((path) => ({
          path: path.trim(),
          filename: path.split("/").pop() || path,
        }));
        setFileResults(newFileResults);
      }

      if (output.stderr && output.code !== 0) {
        console.error("fd error:", output.stderr);
      }
    } catch (err) {
      console.error("fd search failed:", err);
    }
  }

  async function runContentSearch(currentSearchId: number) {
    try {
      const command = Command.sidecar("binaries/rg", [
        "--json",
        "--max-count",
        "50",
        query,
        searchPath,
      ]);
      const output = await command.execute();

      if (searchIdRef.current !== currentSearchId) return;

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
      throw err;
    }
  }

  const totalResults = fileResults.length + results.length;

  return (
    <main className="flex flex-col h-screen bg-gray-900 text-white">
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
            placeholder="/Users/xhome/VBProjects"
            className="w-80 px-3 py-2 bg-gray-800 rounded border border-gray-700 focus:border-blue-500 outline-none text-sm placeholder:text-gray-500 placeholder:italic"
          />
        </div>

        <div className="flex gap-4 mt-2 text-xs">
          {loading && <span className="text-blue-400">Searching...</span>}
          {totalResults > 0 && (
            <span className="text-green-400">
              {fileResults.length} files, {results.length} content matches
            </span>
          )}
          {error && <span className="text-red-400">{error}</span>}
        </div>
      </div>

      <div className="flex-1 overflow-auto p-2 font-mono text-xs">
        {/* Filename Matches Section */}
        {fileResults.length > 0 && (
          <div className="mb-4">
            <div className="text-gray-400 px-2 py-1 mb-1 text-xs uppercase tracking-wide flex items-center gap-2">
              <span>📁</span>
              <span>Filename Matches ({fileResults.length})</span>
            </div>
            {fileResults.map((r, i) => (
              <div
                key={`file-${i}`}
                onClick={() => openPath(r.path)}
                title={r.path}
                className="flex gap-2 hover:bg-gray-800 px-2 py-1 rounded cursor-pointer active:bg-gray-700"
              >
                <span className="text-purple-400 truncate hover:underline">
                  {r.filename}
                </span>
                <span className="text-gray-500 truncate text-[10px]">
                  {r.path}
                </span>
              </div>
            ))}
          </div>
        )}

        {/* Content Matches Section */}
        {results.length > 0 && (
          <div>
            <div className="text-gray-400 px-2 py-1 mb-1 text-xs uppercase tracking-wide flex items-center gap-2">
              <span>📄</span>
              <span>Content Matches ({results.length})</span>
            </div>
            {results.map((r, i) => (
              <div
                key={`content-${i}`}
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
                <span className="text-gray-300 truncate">{r.lineContent}</span>
              </div>
            ))}
          </div>
        )}

        {!loading && totalResults === 0 && query.length >= 2 && searchPath && (
          <p className="text-gray-500 p-4">No results</p>
        )}

        {!searchPath && (
          <p className="text-gray-500 p-4">
            Enter a path like{" "}
            <code className="bg-gray-800 px-1 rounded">
              /Users/xhome/VBProjects
            </code>{" "}
            and search for{" "}
            <code className="bg-gray-800 px-1 rounded">import</code>
          </p>
        )}
      </div>
    </main>
  );
}

export default App;
