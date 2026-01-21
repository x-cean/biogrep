import { useState } from "react";
import { useSearch } from "./hooks/useSearch";
import { SearchBar } from "./components/SearchBar";
import { TabBar } from "./components/TabBar";
import { FileResultsList, ContentResultsList, DocResultsList } from "./components/ResultsList";
import { TabType } from "./types";

function App() {
  const {
    query,
    setQuery,
    searchPath,
    setSearchPath,
    results,
    fileResults,
    docResults,
    loading,
    isExpanding,
    expandedTerms,
    noInitialMatch,
    error,
    stopSearch,
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
        isExpanding={isExpanding}
        expandedTerms={expandedTerms}
        noInitialMatch={noInitialMatch}
        error={error}
        stopSearch={stopSearch}
      />

      <TabBar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        fileCount={fileResults.length}
        contentCount={results.length}
        docCount={docResults.length}
      />

      <div className="flex-1 overflow-hidden p-2 font-mono text-xs">
        {activeTab === "files" && fileResults.length > 0 && (
          <FileResultsList data={fileResults} query={query} expandedTerms={expandedTerms} />
        )}

        {activeTab === "files" &&
          fileResults.length === 0 &&
          !loading &&
          query.length >= 2 &&
          searchPath && (
            <p className="text-gray-500 p-4">No filename matches</p>
          )}

        {activeTab === "content" && results.length > 0 && (
          <ContentResultsList data={results} query={query} expandedTerms={expandedTerms} />
        )}

        {activeTab === "content" &&
          results.length === 0 &&
          !loading &&
          query.length >= 2 &&
          searchPath && (
            <p className="text-gray-500 p-4">No content matches</p>
          )}

        {activeTab === "docs" && docResults.length > 0 && (
          <DocResultsList data={docResults} query={query} expandedTerms={expandedTerms} />
        )}

        {activeTab === "docs" &&
          docResults.length === 0 &&
          !loading &&
          query.length >= 2 &&
          searchPath && (
            <p className="text-gray-500 p-4">No document matches</p>
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

