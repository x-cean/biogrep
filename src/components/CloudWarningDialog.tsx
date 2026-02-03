/**
 * CloudWarningDialog Component - Warns users about cloud folder selection
 *
 * Displays a modal dialog when the user selects a cloud-synced folder,
 * explaining the risks of triggering downloads for unsynced files.
 *
 * @example
 * <CloudWarningDialog
 *   isOpen={showWarning}
 *   provider="iCloud"
 *   path="/Users/me/Library/Mobile Documents/..."
 *   onCancel={() => clearPath()}
 *   onContinue={() => proceedWithSearch()}
 * />
 */

interface CloudWarningDialogProps {
    isOpen: boolean;
    provider: string;
    path: string;
    onCancel: () => void;
    onContinue: () => void;
}

export function CloudWarningDialog({
    isOpen,
    provider,
    path,
    onCancel,
    onContinue,
}: CloudWarningDialogProps) {
    if (!isOpen) return null;

    // Truncate long paths for display
    const displayPath =
        path.length > 50 ? "..." + path.slice(-47) : path;

    return (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50">
            <div className="bg-gray-800 border border-gray-700 rounded-lg shadow-xl max-w-md w-full mx-4 overflow-hidden">
                {/* Header */}
                <div className="bg-yellow-900/30 border-b border-yellow-700/50 px-4 py-3 flex items-center gap-2">
                    <span className="text-xl">⚠️</span>
                    <h2 className="text-yellow-400 font-semibold">
                        Cloud Folder Detected
                    </h2>
                </div>

                {/* Body */}
                <div className="p-4 space-y-3">
                    <p className="text-gray-300">
                        You've selected a{" "}
                        <span className="text-yellow-400 font-medium">
                            {provider}
                        </span>{" "}
                        folder:
                    </p>

                    <p className="text-xs text-gray-500 bg-gray-900 px-2 py-1 rounded font-mono truncate">
                        {displayPath}
                    </p>

                    <p className="text-gray-300 text-sm">
                        Searching may trigger downloads of files that are not
                        stored locally, which could:
                    </p>

                    <ul className="text-sm text-gray-400 list-disc list-inside space-y-1 ml-2">
                        <li>Use significant bandwidth</li>
                        <li>Take a long time</li>
                        <li>Fill up your disk</li>
                    </ul>
                </div>

                {/* Footer */}
                <div className="bg-gray-900/50 border-t border-gray-700 px-4 py-3 flex justify-end gap-2">
                    <button
                        onClick={onCancel}
                        className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded text-sm text-gray-300 transition-colors"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={onContinue}
                        className="px-4 py-2 bg-yellow-600 hover:bg-yellow-500 rounded text-sm text-white font-medium transition-colors"
                    >
                        Continue Anyway
                    </button>
                </div>
            </div>
        </div>
    );
}
