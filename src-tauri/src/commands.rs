use crate::vectorstore::{VectorSearchResult, VectorStoreState};
use tauri::{Manager, State};

/// Initialize the vector store with the app data directory
#[tauri::command]
pub fn init_vectorstore(
    app_handle: tauri::AppHandle,
    state: State<VectorStoreState>,
) -> Result<String, String> {
    let app_data_dir = app_handle
        .path()
        .app_data_dir()
        .map_err(|e: tauri::Error| e.to_string())?;

    let db_path = app_data_dir.join("biogrep_vectors.db");

    // Ensure directory exists
    std::fs::create_dir_all(&app_data_dir).map_err(|e| e.to_string())?;

    let store = crate::vectorstore::VectorStore::new(&db_path).map_err(|e| e.to_string())?;

    let mut guard = state.0.lock().unwrap();
    *guard = Some(store);

    Ok(db_path.to_string_lossy().to_string())
}

/// Add a document chunk to the vector store
#[tauri::command]
pub fn add_document_chunk(
    state: State<VectorStoreState>,
    path: String,
    chunk_index: i32,
    content: String,
    embedding: Vec<f32>,
) -> Result<i64, String> {
    let guard = state.0.lock().unwrap();
    let store = guard.as_ref().ok_or("Vector store not initialized")?;

    store
        .add_chunk(&path, chunk_index, &content, &embedding)
        .map_err(|e| e.to_string())
}

/// Search for similar documents
#[tauri::command]
pub fn search_vectors(
    state: State<VectorStoreState>,
    query_embedding: Vec<f32>,
    limit: usize,
) -> Result<Vec<VectorSearchResult>, String> {
    let guard = state.0.lock().unwrap();
    let store = guard.as_ref().ok_or("Vector store not initialized")?;

    store
        .search(&query_embedding, limit)
        .map_err(|e| e.to_string())
}

/// Delete all chunks for a path
#[tauri::command]
pub fn delete_indexed_path(state: State<VectorStoreState>, path: String) -> Result<usize, String> {
    let guard = state.0.lock().unwrap();
    let store = guard.as_ref().ok_or("Vector store not initialized")?;

    store.delete_path(&path).map_err(|e| e.to_string())
}

/// Check if a path is indexed
#[tauri::command]
pub fn is_path_indexed(state: State<VectorStoreState>, path: String) -> Result<bool, String> {
    let guard = state.0.lock().unwrap();
    let store = guard.as_ref().ok_or("Vector store not initialized")?;

    store.is_indexed(&path).map_err(|e| e.to_string())
}

/// Get the count of indexed chunks
#[tauri::command]
pub fn get_chunk_count(state: State<VectorStoreState>) -> Result<i64, String> {
    let guard = state.0.lock().unwrap();
    let store = guard.as_ref().ok_or("Vector store not initialized")?;

    store.chunk_count().map_err(|e| e.to_string())
}
