import { useState, useEffect, useRef } from "react";
import { Command } from "@tauri-apps/plugin-shell";
import { openPath } from "@tauri-apps/plugin-opener";
import { Virtuoso } from "react-virtuoso";

interface SearchResult {
  path: string;
  lineNumber: number;
  lineContent: string;
}

interface FileResult {
  path: string;
  filename: string;
}

const MAX_RESULTS = 50000;
const MAX_FILE_RESULTS = 5000;

function App() {
  const [query, setQuery] = useState("");
  const [searchPath, setSearchPath] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [fileResults, setFileResults] = useState<FileResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [activeTab, setActiveTab] = useState<"files" | "content">("content");

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
          {error && <span className="text-red-400">{error}</span>}
        </div>
      </div>

      {/* Tab Bar */}
      <div className="flex border-b border-gray-700 bg-gray-850">
        <button
          onClick={() => setActiveTab("files")}
          className={`px-4 py-2 text-sm font-medium transition-colors ${activeTab === "files"
            ? "text-white border-b-2 border-blue-500 bg-gray-800"
            : "text-gray-400 hover:text-gray-200 hover:bg-gray-800"
            }`}
        >
          📁 Filename
          {fileResults.length > 0 && (
            <span className="ml-2 px-1.5 py-0.5 text-xs rounded-full bg-purple-600 text-white">
              {fileResults.length}
            </span>
          )}
        </button>
        <button
          onClick={() => setActiveTab("content")}
          className={`px-4 py-2 text-sm font-medium transition-colors ${activeTab === "content"
            ? "text-white border-b-2 border-blue-500 bg-gray-800"
            : "text-gray-400 hover:text-gray-200 hover:bg-gray-800"
            }`}
        >
          📄 Pure Text
          {results.length > 0 && (
            <span className="ml-2 px-1.5 py-0.5 text-xs rounded-full bg-blue-600 text-white">
              {results.length}
            </span>
          )}
        </button>
      </div>

      {/* Results Area */}
      <div className="flex-1 overflow-hidden p-2 font-mono text-xs">
        {/* File Results */}
        {activeTab === "files" && fileResults.length > 0 && (
          <Virtuoso
            style={{ height: "100%" }}
            data={fileResults}
            itemContent={(_index, r) => (
              <div
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
            )}
          />
        )}

        {activeTab === "files" && fileResults.length === 0 && !loading && query.length >= 2 && searchPath && (
          <p className="text-gray-500 p-4">No filename matches</p>
        )}

        {/* Content Results */}
        {activeTab === "content" && results.length > 0 && (
          <Virtuoso
            style={{ height: "100%" }}
            data={results}
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
                <span className="text-gray-300 truncate">{r.lineContent}</span>
              </div>
            )}
          />
        )}

        {activeTab === "content" && results.length === 0 && !loading && query.length >= 2 && searchPath && (
          <p className="text-gray-500 p-4">No content matches</p>
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
