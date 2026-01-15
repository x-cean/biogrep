export interface SearchResult {
    path: string;
    lineNumber: number;
    lineContent: string;
}

export interface FileResult {
    path: string;
    filename: string;
}

export type TabType = "files" | "content";
