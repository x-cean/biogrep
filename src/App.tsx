import { useState, useCallback, useMemo, useEffect } from "react";
import { useSearch } from "./hooks/useSearch";
import { useChat, SearchContext } from "./hooks/useChat";
import { useFileReader } from "./hooks/useFileReader";
import { useCloudFolderDetection } from "./hooks/useCloudFolderDetection";
import { useIndexer } from "./hooks/useIndexer";
import { SearchBar } from "./components/SearchBar";
import { TabBar } from "./components/TabBar";
import { CloudWarningDialog } from "./components/CloudWarningDialog";
import { ChatPanel } from "./components/ChatPanel";
import { KnowledgeBasePanel } from "./components/KnowledgeBasePanel";
import { FileResultsList, ContentResultsList, DocResultsList } from "./components/ResultsList";
import { TabType, FocusedFile } from "./types";

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

  // Indexer for RAG knowledge base
  const {
    indexFolder,
    cancelIndexing,
    loadChunkCount,
    clearIndex,
    deleteFolder,
    isIndexing,
    progress,
    indexedChunks,
    indexedFolders,
  } = useIndexer();

  // Load chunk count on mount
  useEffect(() => {
    loadChunkCount();
  }, [loadChunkCount]);

  // Enable RAG when knowledge base has indexed chunks
  const isRAGEnabled = indexedChunks > 0;

  // Folder-scoped RAG state (empty = search all folders)
  const [activeFolderIds, setActiveFolderIds] = useState<number[]>([]);

  const handleToggleFolder = useCallback((folderId: number) => {
    setActiveFolderIds(prev =>
      prev.includes(folderId)
        ? prev.filter(id => id !== folderId)
        : [...prev, folderId]
    );
  }, []);

  const handleSelectAllFolders = useCallback(() => {
    setActiveFolderIds([]);  // Empty = search all
  }, []);

  // Chat state - enable RAG if we have indexed chunks
  const {
    messages,
    isLoading: isChatLoading,
    error: chatError,
    sendMessage,
    clearChat
  } = useChat({ enableRAG: isRAGEnabled, activeFolderIds: activeFolderIds.length > 0 ? activeFolderIds : undefined });
  const [isChatCollapsed, setIsChatCollapsed] = useState(true);

  // File reader for focused file
  const { readFile, isReading: isReadingFile } = useFileReader();
  const [focusedFile, setFocusedFile] = useState<FocusedFile | null>(null);

  // Handle "Ask about this file" click
  const handleAskAboutFile = useCallback(async (path: string) => {
    const file = await readFile(path);
    if (file) {
      setFocusedFile(file);
      setIsChatCollapsed(false); // Open chat panel
    }
  }, [readFile]);

  // Clear focused file
  const handleClearFocusedFile = useCallback(() => {
    setFocusedFile(null);
  }, []);

  // Build search context for chat
  const searchContext: SearchContext = useMemo(() => ({
    query,
    results,
    fileResults,
    docResults,
    focusedFile: focusedFile ?? undefined,
  }), [query, results, fileResults, docResults, focusedFile]);

  // Cloud folder detection
  const { needsWarning, acknowledgePath } = useCloudFolderDetection();
  const [pendingCloudPath, setPendingCloudPath] = useState<{
    path: string;
    provider: string;
  } | null>(null);

  // Wrap setSearchPath to check for cloud folders first
  const handleSetSearchPath = useCallback(
    (newPath: string) => {
      const detection = needsWarning(newPath);

      if (detection.needsWarning && detection.provider) {
        // Show warning dialog, don't set path yet
        setPendingCloudPath({ path: newPath, provider: detection.provider });
      } else {
        // Safe to proceed
        setSearchPath(newPath);
      }
    },
    [needsWarning, setSearchPath]
  );

  // Handle warning dialog actions
  const handleCloudWarningCancel = useCallback(() => {
    setPendingCloudPath(null);
    // Don't change the current path
  }, []);

  const handleCloudWarningContinue = useCallback(() => {
    if (pendingCloudPath) {
      acknowledgePath(pendingCloudPath.path);
      setSearchPath(pendingCloudPath.path);
      setPendingCloudPath(null);
    }
  }, [pendingCloudPath, acknowledgePath, setSearchPath]);

  const [activeTab, setActiveTab] = useState<TabType>("content");

  return (
    <main className="flex h-screen bg-gray-900 text-white overflow-hidden">
      {/* Left side: Search UI - takes remaining space, has min-width for usability */}
      <div className="flex-1 flex flex-col min-w-0 relative">
        <SearchBar
          query={query}
          setQuery={setQuery}
          searchPath={searchPath}
          setSearchPath={handleSetSearchPath}
          loading={loading}
          isExpanding={isExpanding}
          expandedTerms={expandedTerms}
          noInitialMatch={noInitialMatch}
          error={error}
          stopSearch={stopSearch}
        />

        {/* Indexing Controls */}
        <div className="px-4 py-2 border-b border-gray-800 flex flex-col gap-2 text-xs">
          <div className="flex items-center gap-3">
            <button
              onClick={() => searchPath && indexFolder(searchPath)}
              disabled={isIndexing || !searchPath}
              className={`px-3 py-1.5 rounded transition-colors ${isIndexing
                ? "bg-yellow-600 cursor-wait"
                : searchPath
                  ? "bg-blue-600 hover:bg-blue-500"
                  : "bg-gray-700 cursor-not-allowed"
                }`}
            >
              {isIndexing ? "Indexing..." : "📚 Index Folder"}
            </button>

            {isIndexing && (
              <button
                onClick={cancelIndexing}
                className="px-2 py-1 bg-red-600 hover:bg-red-500 rounded text-xs"
              >
                Cancel
              </button>
            )}

            {isIndexing && (
              <span className="text-yellow-400">
                {progress.phase === "scanning" && "📂 Scanning..."}
                {progress.phase === "reading" && `📄 Checking file ${progress.fileIndex}/${progress.fileTotal}`}
                {progress.phase === "chunking" && `✂️ Chunking file ${progress.fileIndex}/${progress.fileTotal}`}
                {progress.phase === "embedding" && `🧠 Embedding ${progress.chunkIndex}/${progress.chunkTotal}`}
                {progress.phase === "storing" && `💾 Storing...`}
                {progress.filesSkipped > 0 && (
                  <span className="text-gray-500 ml-2">
                    ({progress.filesSkipped} unchanged)
                  </span>
                )}
                {progress.currentFile && (
                  <span className="text-gray-500 ml-2 truncate max-w-xs inline-block align-bottom">
                    {progress.currentFile.split("/").pop()}
                  </span>
                )}
              </span>
            )}

            {!isIndexing && indexedChunks === 0 && (
              <span className="text-gray-500">
                No knowledge base — index a folder to enable RAG
              </span>
            )}
          </div>

          {/* Knowledge Base Panel - shows indexed folders */}
          <KnowledgeBasePanel
            folders={indexedFolders}
            totalChunks={indexedChunks}
            onDeleteFolder={deleteFolder}
            onClearAll={clearIndex}
            isIndexing={isIndexing}
          />
        </div>


        <TabBar
          activeTab={activeTab}
          setActiveTab={setActiveTab}
          fileCount={fileResults.length}
          contentCount={results.length}
          docCount={docResults.length}
        />

        <div className="flex-1 overflow-hidden p-2 font-mono text-xs">
          {activeTab === "files" && fileResults.length > 0 && (
            <FileResultsList
              data={fileResults}
              query={query}
              expandedTerms={expandedTerms}
              onAskAboutFile={handleAskAboutFile}
            />
          )}

          {activeTab === "files" &&
            fileResults.length === 0 &&
            !loading &&
            query.length >= 2 &&
            searchPath && (
              <p className="text-gray-500 p-4">No filename matches</p>
            )}

          {activeTab === "content" && results.length > 0 && (
            <ContentResultsList
              data={results}
              query={query}
              expandedTerms={expandedTerms}
              onAskAboutFile={handleAskAboutFile}
            />
          )}

          {activeTab === "content" &&
            results.length === 0 &&
            !loading &&
            query.length >= 2 &&
            searchPath && (
              <p className="text-gray-500 p-4">No content matches</p>
            )}

          {activeTab === "docs" && docResults.length > 0 && (
            <DocResultsList
              data={docResults}
              query={query}
              expandedTerms={expandedTerms}
              onAskAboutFile={handleAskAboutFile}
            />
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
      </div>

      {/* Right side: Chat Panel */}
      <ChatPanel
        messages={messages}
        isLoading={isChatLoading || isReadingFile}
        error={chatError}
        onSendMessage={sendMessage}
        onClearChat={clearChat}
        searchContext={searchContext}
        isCollapsed={isChatCollapsed}
        onToggleCollapse={() => setIsChatCollapsed(!isChatCollapsed)}
        focusedFile={focusedFile}
        onClearFocusedFile={handleClearFocusedFile}
        indexedFolders={indexedFolders}
        activeFolderIds={activeFolderIds}
        onToggleFolder={handleToggleFolder}
        onSelectAllFolders={handleSelectAllFolders}
      />

      {/* Cloud folder warning dialog */}
      <CloudWarningDialog
        isOpen={pendingCloudPath !== null}
        provider={pendingCloudPath?.provider ?? ""}
        path={pendingCloudPath?.path ?? ""}
        onCancel={handleCloudWarningCancel}
        onContinue={handleCloudWarningContinue}
      />
    </main>
  );
}

export default App;
