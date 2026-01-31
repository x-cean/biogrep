import { useRef, useCallback } from "react";
import { Child } from "@tauri-apps/plugin-shell";

/**
 * useProcessManager Hook - Manages child processes and search IDs
 * 
 * Responsibilities:
 * - Maintains refs to spawned child processes (fd, rg, rga)
 * - Provides function to kill all running searches
 * - Manages search ID for invalidating stale results
 */

export interface ProcessRefs {
    fdChild: React.MutableRefObject<Child | null>;
    rgChild: React.MutableRefObject<Child | null>;
    rgaChild: React.MutableRefObject<Child | null>;
}

export function useProcessManager() {
    // Search ID increments with each new search
    // Used to ignore results from stale searches
    const searchIdRef = useRef(0);

    // Child process refs
    const fdChildRef = useRef<Child | null>(null);
    const rgChildRef = useRef<Child | null>(null);
    const rgaChildRef = useRef<Child | null>(null);

    /**
     * Kill all running search processes.
     * Called when: new search starts, user clicks Stop, or query is cleared.
     */
    const killAllProcesses = useCallback(async () => {
        const killProcess = async (ref: React.MutableRefObject<Child | null>) => {
            if (ref.current) {
                try {
                    await ref.current.kill();
                } catch {
                    // Process may have already exited
                }
                ref.current = null;
            }
        };

        await Promise.all([
            killProcess(fdChildRef),
            killProcess(rgChildRef),
            killProcess(rgaChildRef),
        ]);
    }, []);

    /**
     * Increment search ID to invalidate pending callbacks
     */
    const incrementSearchId = useCallback(() => {
        return ++searchIdRef.current;
    }, []);

    /**
     * Get current search ID for comparison
     */
    const getSearchId = useCallback(() => {
        return searchIdRef.current;
    }, []);

    return {
        // Refs for spawning processes
        fdChildRef,
        rgChildRef,
        rgaChildRef,
        // Functions
        killAllProcesses,
        incrementSearchId,
        getSearchId,
    };
}
