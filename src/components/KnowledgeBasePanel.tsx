import { IndexedFolder } from "../lib/vectorstore";

interface KnowledgeBasePanelProps {
    folders: IndexedFolder[];
    totalChunks: number;
    onDeleteFolder: (folderId: number) => void;
    onClearAll: () => void;
    isIndexing: boolean;
}

/**
 * KnowledgeBasePanel - Shows indexed folders and allows management
 */
export function KnowledgeBasePanel({
    folders,
    totalChunks,
    onDeleteFolder,
    onClearAll,
    isIndexing,
}: KnowledgeBasePanelProps) {
    if (folders.length === 0 && totalChunks === 0) {
        return null;
    }

    return (
        <div className="bg-gray-800/50 rounded-lg p-3 mb-2">
            <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-medium text-gray-300">
                    📚 Knowledge Base
                </h3>
                <div className="flex items-center gap-2">
                    <span className="text-xs text-green-400">
                        {totalChunks} chunks
                    </span>
                    {folders.length > 0 && !isIndexing && (
                        <button
                            onClick={onClearAll}
                            className="px-2 py-0.5 text-xs bg-gray-700 hover:bg-red-600 rounded transition-colors"
                            title="Clear all indexed data"
                        >
                            Clear All
                        </button>
                    )}
                </div>
            </div>

            {folders.length > 0 && (
                <div className="space-y-1.5 max-h-32 overflow-y-auto">
                    {folders.map((folder) => (
                        <div
                            key={folder.id}
                            className="flex items-center justify-between bg-gray-900/50 rounded px-2 py-1.5 text-xs"
                        >
                            <div className="flex-1 min-w-0 mr-2">
                                <div className="text-gray-200 truncate" title={folder.path}>
                                    📁 {folder.path.split("/").pop() || folder.path}
                                </div>
                                <div className="text-gray-500 text-[10px]">
                                    {folder.file_count} files • {folder.chunk_count} chunks
                                </div>
                            </div>
                            {!isIndexing && (
                                <button
                                    onClick={() => onDeleteFolder(folder.id)}
                                    className="px-1.5 py-0.5 text-gray-400 hover:text-red-400 hover:bg-red-900/30 rounded transition-colors"
                                    title="Remove this folder from knowledge base"
                                >
                                    ✕
                                </button>
                            )}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
