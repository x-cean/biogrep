import { useState, useCallback } from "react";

/**
 * useCloudFolderDetection Hook - Detects cloud-synced folder paths
 *
 * Checks if a given path is inside a known cloud storage provider folder.
 * This helps warn users before they accidentally trigger downloads of
 * cloud-only files (e.g., iCloud "Optimize Storage" files).
 *
 * Supported providers:
 * - iCloud Drive
 * - Dropbox
 * - Google Drive
 * - OneDrive
 */

interface CloudProvider {
    name: string;
    patterns: string[];
}

const CLOUD_PROVIDERS: CloudProvider[] = [
    {
        name: "iCloud",
        patterns: [
            "/Library/Mobile Documents/",
            "/Library/Mobile Documents",
        ],
    },
    {
        name: "Dropbox",
        patterns: [
            "/Dropbox/",
            "/Dropbox",
        ],
    },
    {
        name: "Google Drive",
        patterns: [
            "/Google Drive/",
            "/Google Drive",
            "/Library/CloudStorage/GoogleDrive",
        ],
    },
    {
        name: "OneDrive",
        patterns: [
            "/OneDrive/",
            "/OneDrive",
            "/Library/CloudStorage/OneDrive",
        ],
    },
];

interface CloudFolderInfo {
    isCloud: boolean;
    provider: string | null;
}

export function useCloudFolderDetection() {
    // Paths the user has acknowledged this session (won't warn again)
    const [acknowledgedPaths, setAcknowledgedPaths] = useState<Set<string>>(
        new Set()
    );

    /**
     * Check if a path is inside a known cloud folder.
     * @param path - The file system path to check
     * @returns CloudFolderInfo with detection result
     */
    const detectCloudFolder = useCallback((path: string): CloudFolderInfo => {
        if (!path) {
            return { isCloud: false, provider: null };
        }

        for (const provider of CLOUD_PROVIDERS) {
            for (const pattern of provider.patterns) {
                if (path.includes(pattern)) {
                    return { isCloud: true, provider: provider.name };
                }
            }
        }

        return { isCloud: false, provider: null };
    }, []);

    /**
     * Check if a path needs a warning (is cloud AND not yet acknowledged).
     */
    const needsWarning = useCallback(
        (path: string): CloudFolderInfo & { needsWarning: boolean } => {
            const detection = detectCloudFolder(path);

            if (!detection.isCloud) {
                return { ...detection, needsWarning: false };
            }

            // Check if user already acknowledged this path
            const isAcknowledged = acknowledgedPaths.has(path);

            return {
                ...detection,
                needsWarning: !isAcknowledged,
            };
        },
        [detectCloudFolder, acknowledgedPaths]
    );

    /**
     * Mark a path as acknowledged (user clicked "Continue Anyway").
     */
    const acknowledgePath = useCallback((path: string) => {
        setAcknowledgedPaths((prev) => new Set(prev).add(path));
    }, []);

    /**
     * Clear acknowledgements (e.g., when user wants to see warnings again).
     */
    const clearAcknowledgements = useCallback(() => {
        setAcknowledgedPaths(new Set());
    }, []);

    return {
        detectCloudFolder,
        needsWarning,
        acknowledgePath,
        clearAcknowledgements,
    };
}
