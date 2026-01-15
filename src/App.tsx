import { useState } from "react";
import { useSearch } from "./hooks/useSearch";
import { SearchBar } from "./components/SearchBar";
import { TabBar } from "./components/TabBar";
import { FileResultsList, ContentResultsList } from "./components/ResultsList";
import { TabType } from "./types";

function App() {
  const {
    query,
    setQuery,
    searchPath,
    setSearchPath,
    results,
    fileResults,
    loading,
    error,
  } = useSearch();

  const [activeTab, setActiveTab] = useState<TabType>("content");

  return (
    <main className="flex flex-col h-screen bg-gray-900 text-white">
      <SearchBar
        query={query}
        setQuery={setQuery}
        searchPath={searchPath}
        setSearchPath={setSearchPath}
        loading={loading}
        error={error}
      />

      <TabBar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        fileCount={fileResults.length}
        contentCount={results.length}
      />

      <div className="flex-1 overflow-hidden p-2 font-mono text-xs">
        {activeTab === "files" && fileResults.length > 0 && (
          <FileResultsList data={fileResults} />
        )}

        {activeTab === "files" &&
          fileResults.length === 0 &&
          !loading &&
          query.length >= 2 &&
          searchPath && (
            <p className="text-gray-500 p-4">No filename matches</p>
          )}

        {activeTab === "content" && results.length > 0 && (
          <ContentResultsList data={results} />
        )}

        {activeTab === "content" &&
          results.length === 0 &&
          !loading &&
          query.length >= 2 &&
          searchPath && (
            <p className="text-gray-500 p-4">No content matches</p>
          )}

        {!searchPath && (
          <p className="text-gray-500 p-4">
            Enter a path like{" "}
            <code className="bg-gray-800 px-1 rounded">/path/to/folder</code>{" "}
            and search for{" "}
            <code className="bg-gray-800 px-1 rounded">import</code>
          </p>
        )}
      </div>
    </main>
  );
}

export default App;
