use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use std::path::Path;
use std::sync::Mutex;

/// Represents a document chunk stored in the vector database
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DocumentChunk {
    pub id: i64,
    pub path: String,
    pub chunk_index: i32,
    pub content: String,
    pub embedding: Vec<f32>,
}

/// Represents a search result from the vector database
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VectorSearchResult {
    pub id: i64,
    pub path: String,
    pub chunk_index: i32,
    pub content: String,
    pub distance: f64,
}

/// Represents an indexed folder in the knowledge base
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct IndexedFolder {
    pub id: i64,
    pub path: String,
    pub label: Option<String>,
    pub indexed_at: String,
    pub file_count: i64,
    pub chunk_count: i64,
}

/// Represents an indexed file in the knowledge base
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct IndexedFile {
    pub id: i64,
    pub folder_id: i64,
    pub path: String,
    pub last_modified: i64,
    pub file_hash: Option<String>,
    pub chunk_count: i64,
    pub indexed_at: String,
}

/// Wrapper around SQLite connection with sqlite-vec extension
pub struct VectorStore {
    conn: Connection,
}

impl VectorStore {
    /// Initialize a new vector store at the given path with specified embedding dimension
    pub fn new(db_path: &Path, dimension: i32) -> Result<Self, rusqlite::Error> {
        let conn = Connection::open(db_path)?;

        // Load the sqlite-vec extension using the auto-load feature
        unsafe {
            let _db_handle = conn.handle();
            sqlite_vec::sqlite3_vec_init();
        }

        // Create indexed_folders table for tracking indexed folders
        conn.execute(
            "CREATE TABLE IF NOT EXISTS indexed_folders (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                path TEXT NOT NULL UNIQUE,
                label TEXT,
                indexed_at TEXT NOT NULL,
                file_count INTEGER DEFAULT 0,
                chunk_count INTEGER DEFAULT 0
            )",
            [],
        )?;

        // Create indexed_files table for tracking individual files with change detection
        conn.execute(
            "CREATE TABLE IF NOT EXISTS indexed_files (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                folder_id INTEGER NOT NULL,
                path TEXT NOT NULL UNIQUE,
                last_modified INTEGER NOT NULL,
                file_hash TEXT,
                chunk_count INTEGER DEFAULT 0,
                indexed_at TEXT NOT NULL,
                FOREIGN KEY (folder_id) REFERENCES indexed_folders(id) ON DELETE CASCADE
            )",
            [],
        )?;

        // Create documents table (now with file_id reference)
        conn.execute(
            "CREATE TABLE IF NOT EXISTS documents (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                file_id INTEGER,
                path TEXT NOT NULL,
                chunk_index INTEGER NOT NULL,
                content TEXT NOT NULL,
                UNIQUE(path, chunk_index),
                FOREIGN KEY (file_id) REFERENCES indexed_files(id) ON DELETE CASCADE
            )",
            [],
        )?;

        // Migration: Add file_id column to existing documents table if missing
        // This handles databases created before the persistent RAG feature
        let has_file_id: bool = {
            let mut stmt = conn.prepare(
                "SELECT COUNT(*) FROM pragma_table_info('documents') WHERE name = 'file_id'",
            )?;
            let count: i64 = stmt.query_row([], |row| row.get(0))?;
            count > 0
        };

        if !has_file_id {
            conn.execute("ALTER TABLE documents ADD COLUMN file_id INTEGER", [])?;
        }

        // Create virtual table for vector storage with dynamic dimension
        // Note: dimension is validated by the caller (frontend knows the correct dimension)
        conn.execute(
            &format!(
                "CREATE VIRTUAL TABLE IF NOT EXISTS document_vectors USING vec0(
                    id INTEGER PRIMARY KEY,
                    embedding float[{}]
                )",
                dimension
            ),
            [],
        )?;

        // Enable foreign key constraints
        conn.execute("PRAGMA foreign_keys = ON", [])?;

        Ok(Self { conn })
    }

    /// Add a document chunk with its embedding to the store
    /// Now accepts optional file_id for linking to indexed_files
    pub fn add_chunk(
        &self,
        file_id: Option<i64>,
        path: &str,
        chunk_index: i32,
        content: &str,
        embedding: &[f32],
    ) -> Result<i64, rusqlite::Error> {
        // Insert document metadata with file_id
        self.conn.execute(
            "INSERT OR REPLACE INTO documents (file_id, path, chunk_index, content) VALUES (?1, ?2, ?3, ?4)",
            params![file_id, path, chunk_index, content],
        )?;

        let doc_id = self.conn.last_insert_rowid();

        // Convert embedding to blob format for sqlite-vec
        let embedding_blob: Vec<u8> = embedding.iter().flat_map(|f| f.to_le_bytes()).collect();

        // Insert embedding
        self.conn.execute(
            "INSERT OR REPLACE INTO document_vectors (id, embedding) VALUES (?1, ?2)",
            params![doc_id, embedding_blob],
        )?;

        Ok(doc_id)
    }

    /// Search for similar documents using vector similarity
    pub fn search(
        &self,
        query_embedding: &[f32],
        limit: usize,
    ) -> Result<Vec<VectorSearchResult>, rusqlite::Error> {
        let embedding_blob: Vec<u8> = query_embedding
            .iter()
            .flat_map(|f| f.to_le_bytes())
            .collect();

        let mut stmt = self.conn.prepare(
            "SELECT 
                d.id,
                d.path,
                d.chunk_index,
                d.content,
                v.distance
            FROM document_vectors v
            INNER JOIN documents d ON d.id = v.id
            WHERE v.embedding MATCH ?1 AND k = ?2
            ORDER BY v.distance",
        )?;

        let results = stmt.query_map(params![embedding_blob, limit as i64], |row| {
            Ok(VectorSearchResult {
                id: row.get(0)?,
                path: row.get(1)?,
                chunk_index: row.get(2)?,
                content: row.get(3)?,
                distance: row.get(4)?,
            })
        })?;

        results.collect()
    }

    /// Delete all chunks for a given path
    pub fn delete_path(&self, path: &str) -> Result<usize, rusqlite::Error> {
        // Get IDs to delete from vector table
        let mut stmt = self
            .conn
            .prepare("SELECT id FROM documents WHERE path = ?1")?;
        let ids: Vec<i64> = stmt
            .query_map([path], |row| row.get(0))?
            .filter_map(|r| r.ok())
            .collect();

        // Delete from vector table
        for id in &ids {
            self.conn
                .execute("DELETE FROM document_vectors WHERE id = ?1", [id])?;
        }

        // Delete from documents table
        let deleted = self
            .conn
            .execute("DELETE FROM documents WHERE path = ?1", [path])?;

        Ok(deleted)
    }

    /// Check if a path is already indexed
    pub fn is_indexed(&self, path: &str) -> Result<bool, rusqlite::Error> {
        let count: i64 = self.conn.query_row(
            "SELECT COUNT(*) FROM documents WHERE path = ?1",
            [path],
            |row| row.get(0),
        )?;
        Ok(count > 0)
    }

    /// Get count of indexed chunks
    pub fn chunk_count(&self) -> Result<i64, rusqlite::Error> {
        self.conn
            .query_row("SELECT COUNT(*) FROM documents", [], |row| row.get(0))
    }

    /// Clear all indexed data (including folders and files)
    pub fn clear_all(&self) -> Result<usize, rusqlite::Error> {
        // Delete all vectors
        self.conn.execute("DELETE FROM document_vectors", [])?;
        // Delete all documents
        let deleted = self.conn.execute("DELETE FROM documents", [])?;
        // Delete all indexed files
        self.conn.execute("DELETE FROM indexed_files", [])?;
        // Delete all indexed folders
        self.conn.execute("DELETE FROM indexed_folders", [])?;
        Ok(deleted)
    }

    // ============ FOLDER MANAGEMENT METHODS ============

    /// Add or update an indexed folder
    pub fn add_folder(&self, path: &str, label: Option<&str>) -> Result<i64, rusqlite::Error> {
        let now = chrono::Utc::now().to_rfc3339();
        self.conn.execute(
            "INSERT INTO indexed_folders (path, label, indexed_at) VALUES (?1, ?2, ?3)
             ON CONFLICT(path) DO UPDATE SET label = ?2, indexed_at = ?3",
            params![path, label, now],
        )?;

        // Get the folder id (whether inserted or updated)
        let folder_id: i64 = self.conn.query_row(
            "SELECT id FROM indexed_folders WHERE path = ?1",
            [path],
            |row| row.get(0),
        )?;

        Ok(folder_id)
    }

    /// Get all indexed folders with their stats
    pub fn get_folders(&self) -> Result<Vec<IndexedFolder>, rusqlite::Error> {
        let mut stmt = self.conn.prepare(
            "SELECT id, path, label, indexed_at, file_count, chunk_count FROM indexed_folders",
        )?;

        let folders = stmt.query_map([], |row| {
            Ok(IndexedFolder {
                id: row.get(0)?,
                path: row.get(1)?,
                label: row.get(2)?,
                indexed_at: row.get(3)?,
                file_count: row.get(4)?,
                chunk_count: row.get(5)?,
            })
        })?;

        folders.collect()
    }

    /// Delete an indexed folder and all its files/chunks (cascade)
    pub fn delete_folder(&self, folder_id: i64) -> Result<usize, rusqlite::Error> {
        // First, get all document IDs for this folder's files
        let mut stmt = self.conn.prepare(
            "SELECT d.id FROM documents d
             INNER JOIN indexed_files f ON d.file_id = f.id
             WHERE f.folder_id = ?1",
        )?;
        let ids: Vec<i64> = stmt
            .query_map([folder_id], |row| row.get(0))?
            .filter_map(|r| r.ok())
            .collect();

        // Delete from vector table
        for id in &ids {
            self.conn
                .execute("DELETE FROM document_vectors WHERE id = ?1", [id])?;
        }

        // Delete folder (cascades to files, then documents via foreign keys)
        self.conn
            .execute("DELETE FROM indexed_folders WHERE id = ?1", [folder_id])?;

        Ok(ids.len())
    }

    /// Update folder stats after indexing
    pub fn update_folder_stats(
        &self,
        folder_id: i64,
        file_count: i64,
        chunk_count: i64,
    ) -> Result<(), rusqlite::Error> {
        self.conn.execute(
            "UPDATE indexed_folders SET file_count = ?1, chunk_count = ?2 WHERE id = ?3",
            params![file_count, chunk_count, folder_id],
        )?;
        Ok(())
    }

    // ============ FILE MANAGEMENT METHODS ============

    /// Add or update an indexed file
    pub fn add_file(
        &self,
        folder_id: i64,
        path: &str,
        last_modified: i64,
        file_hash: Option<&str>,
    ) -> Result<i64, rusqlite::Error> {
        let now = chrono::Utc::now().to_rfc3339();
        self.conn.execute(
            "INSERT INTO indexed_files (folder_id, path, last_modified, file_hash, indexed_at) 
             VALUES (?1, ?2, ?3, ?4, ?5)
             ON CONFLICT(path) DO UPDATE SET 
                folder_id = ?1, 
                last_modified = ?3, 
                file_hash = ?4, 
                indexed_at = ?5,
                chunk_count = 0",
            params![folder_id, path, last_modified, file_hash, now],
        )?;

        let file_id: i64 = self.conn.query_row(
            "SELECT id FROM indexed_files WHERE path = ?1",
            [path],
            |row| row.get(0),
        )?;

        Ok(file_id)
    }

    /// Get indexed file info by path
    pub fn get_file(&self, path: &str) -> Result<Option<IndexedFile>, rusqlite::Error> {
        let result = self.conn.query_row(
            "SELECT id, folder_id, path, last_modified, file_hash, chunk_count, indexed_at 
             FROM indexed_files WHERE path = ?1",
            [path],
            |row| {
                Ok(IndexedFile {
                    id: row.get(0)?,
                    folder_id: row.get(1)?,
                    path: row.get(2)?,
                    last_modified: row.get(3)?,
                    file_hash: row.get(4)?,
                    chunk_count: row.get(5)?,
                    indexed_at: row.get(6)?,
                })
            },
        );

        match result {
            Ok(file) => Ok(Some(file)),
            Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
            Err(e) => Err(e),
        }
    }

    /// Check if a file needs re-indexing based on mtime
    pub fn is_file_stale(&self, path: &str, current_mtime: i64) -> Result<bool, rusqlite::Error> {
        let result = self.conn.query_row(
            "SELECT last_modified FROM indexed_files WHERE path = ?1",
            [path],
            |row| row.get::<_, i64>(0),
        );

        match result {
            Ok(stored_mtime) => Ok(current_mtime > stored_mtime),
            Err(rusqlite::Error::QueryReturnedNoRows) => Ok(true), // Not indexed = needs indexing
            Err(e) => Err(e),
        }
    }

    /// Delete all chunks for a file (by file_id) before re-indexing
    pub fn delete_file_chunks(&self, file_id: i64) -> Result<usize, rusqlite::Error> {
        // Get document IDs to delete from vector table
        let mut stmt = self
            .conn
            .prepare("SELECT id FROM documents WHERE file_id = ?1")?;
        let ids: Vec<i64> = stmt
            .query_map([file_id], |row| row.get(0))?
            .filter_map(|r| r.ok())
            .collect();

        // Delete from vector table
        for id in &ids {
            self.conn
                .execute("DELETE FROM document_vectors WHERE id = ?1", [id])?;
        }

        // Delete from documents table
        let deleted = self
            .conn
            .execute("DELETE FROM documents WHERE file_id = ?1", [file_id])?;

        Ok(deleted)
    }

    /// Update file chunk count after indexing
    pub fn update_file_chunk_count(
        &self,
        file_id: i64,
        chunk_count: i64,
    ) -> Result<(), rusqlite::Error> {
        self.conn.execute(
            "UPDATE indexed_files SET chunk_count = ?1 WHERE id = ?2",
            params![chunk_count, file_id],
        )?;
        Ok(())
    }
}

/// Thread-safe wrapper for VectorStore state
pub struct VectorStoreState(pub Mutex<Option<VectorStore>>);

impl VectorStoreState {
    pub fn new() -> Self {
        Self(Mutex::new(None))
    }
}
