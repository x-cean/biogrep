export const CONFIG = {
    SEARCH: {
        MAX_FILE_RESULTS: 5000,
        MAX_CONTENT_RESULTS: 20000,
        MAX_DOC_RESULTS: 20000,
        // Limit matches per file to avoid flooding
        MAX_MATCHES_PER_FILE: 200,
        // If initial search returns fewer than this many results, trigger LLM expansion
        SPARSE_RESULTS_THRESHOLD: 5,
        DEBOUNCE_MS: 300,
    },
    PATHS: {
        // PATH for rga to find adapter binaries (pdftotext, pandoc)
        RGA_ENV_PATH: "/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin",
    },
    UI: {
        COLUMN_WIDTHS: {
            FILENAME_DEFAULT: 200,
            FILENAME_MIN: 80,
            FILENAME_MAX: 500,
            PATH_DEFAULT: 160,
            PATH_MIN: 80,
            PATH_MAX: 400,
        }
    },
    FILE_READER: {
        // Max file size to read (50KB) - larger files will be truncated
        MAX_SIZE_BYTES: 50 * 1024,
        // Document extensions that need rga extraction
        DOCUMENT_EXTENSIONS: ['.pdf', '.docx', '.doc', '.pptx', '.ppt', '.xlsx', '.xls', '.odt', '.epub'],
    }
} as const;
