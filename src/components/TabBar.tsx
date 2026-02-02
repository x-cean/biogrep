/**
 * TabBar Component - Search result type navigation
 * 
 * Displays tabs for switching between different search result views:
 * - 📁 Filename: Results from fd (fast file finder)
 * - 📄 Pure Text: Results from rg (ripgrep) for plain text files
 * - 📚 Documents: Results from rga (ripgrep-all) for PDFs, Word docs, etc.
 * 
 * Each tab shows a badge with the count of results when > 0.
 */
import { TabType } from "../types";

interface TabBarProps {
    activeTab: TabType;
    setActiveTab: (tab: TabType) => void;
    fileCount: number;
    contentCount: number;
    docCount: number;
}

export function TabBar({
    activeTab,
    setActiveTab,
    fileCount,
    contentCount,
    docCount,
}: TabBarProps) {
    const tabClass = (tab: TabType) =>
        `px-4 py-2 text-sm font-medium transition-colors ${activeTab === tab
            ? "text-white border-b-2 border-blue-500 bg-gray-800"
            : "text-gray-400 hover:text-gray-200 hover:bg-gray-800"
        }`;

    return (
        <div className="flex border-b border-gray-700 bg-gray-850">
            <button onClick={() => setActiveTab("files")} className={tabClass("files")}>
                📁 Filename
                {fileCount > 0 && (
                    <span className="ml-2 px-1.5 py-0.5 text-xs rounded-full bg-purple-600 text-white">
                        {fileCount}
                    </span>
                )}
            </button>
            <button onClick={() => setActiveTab("content")} className={tabClass("content")}>
                📄 Pure Text
                {contentCount > 0 && (
                    <span className="ml-2 px-1.5 py-0.5 text-xs rounded-full bg-blue-600 text-white">
                        {contentCount}
                    </span>
                )}
            </button>
            <button onClick={() => setActiveTab("docs")} className={tabClass("docs")}>
                📚 Documents
                {docCount > 0 && (
                    <span className="ml-2 px-1.5 py-0.5 text-xs rounded-full bg-green-600 text-white">
                        {docCount}
                    </span>
                )}
            </button>
        </div>
    );
}
