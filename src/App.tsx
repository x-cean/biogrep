import { useState, useCallback, useMemo } from "react";
import { useSearch } from "./hooks/useSearch";
import { useChat, SearchContext } from "./hooks/useChat";
import { useFileReader } from "./hooks/useFileReader";
import { useCloudFolderDetection } from "./hooks/useCloudFolderDetection";
import { SearchBar } from "./components/SearchBar";
import { TabBar } from "./components/TabBar";
import { CloudWarningDialog } from "./components/CloudWarningDialog";
import { ChatPanel } from "./components/ChatPanel";
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

  // Chat state
  const {
    messages,
    isLoading: isChatLoading,
    error: chatError,
    sendMessage,
    clearChat
  } = useChat();
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
