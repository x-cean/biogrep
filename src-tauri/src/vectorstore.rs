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

/// Wrapper around SQLite connection with sqlite-vec extension
pub struct VectorStore {
    conn: Connection,
}

impl VectorStore {
    /// Initialize a new vector store at the given path
    pub fn new(db_path: &Path) -> Result<Self, rusqlite::Error> {
        let conn = Connection::open(db_path)?;

        // Load the sqlite-vec extension using the auto-load feature
        unsafe {
            let _db_handle = conn.handle();
            sqlite_vec::sqlite3_vec_init();
        }

        // Create tables if they don't exist
        conn.execute(
            "CREATE TABLE IF NOT EXISTS documents (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                path TEXT NOT NULL,
                chunk_index INTEGER NOT NULL,
                content TEXT NOT NULL,
                UNIQUE(path, chunk_index)
            )",
            [],
        )?;

        // Create virtual table for vector storage (768 dimensions for Gemini text-embedding-004)
        conn.execute(
            "CREATE VIRTUAL TABLE IF NOT EXISTS document_vectors USING vec0(
                id INTEGER PRIMARY KEY,
                embedding float[768]
            )",
            [],
        )?;

        Ok(Self { conn })
    }

    /// Add a document chunk with its embedding to the store
    pub fn add_chunk(
        &self,
        path: &str,
        chunk_index: i32,
        content: &str,
        embedding: &[f32],
    ) -> Result<i64, rusqlite::Error> {
        // Insert document metadata
        self.conn.execute(
            "INSERT OR REPLACE INTO documents (path, chunk_index, content) VALUES (?1, ?2, ?3)",
            params![path, chunk_index, content],
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
            WHERE v.embedding MATCH ?1
            ORDER BY v.distance
            LIMIT ?2",
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
}

/// Thread-safe wrapper for VectorStore state
pub struct VectorStoreState(pub Mutex<Option<VectorStore>>);

impl VectorStoreState {
    pub fn new() -> Self {
        Self(Mutex::new(None))
    }
}
