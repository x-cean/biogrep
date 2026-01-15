export interface SearchResult {
    path: string;
    lineNumber: number;
    lineContent: string;
}

export interface FileResult {
    path: string;
    filename: string;
}

export interface DocResult {
    path: string;
    lineNumber: number;
    lineContent: string;
    adapter?: string; // e.g., "pdfpages", "pandoc"
}

export type TabType = "files" | "content" | "docs";
