use crate::vectorstore::{IndexedFile, IndexedFolder, VectorSearchResult, VectorStoreState};
use tauri::{Manager, State};

/// Initialize the vector store with model-specific database
/// Each embedding model gets its own database file to prevent dimension conflicts
#[tauri::command]
pub fn init_vectorstore(
    app_handle: tauri::AppHandle,
    state: State<VectorStoreState>,
    model_id: String,
    dimension: i32,
) -> Result<String, String> {
    let app_data_dir = app_handle
        .path()
        .app_data_dir()
        .map_err(|e: tauri::Error| e.to_string())?;

    // Create model-specific database filename
    // Sanitize model_id to be filesystem-safe
    let safe_model_id = model_id.replace(['/', '\\', ':', '*', '?', '"', '<', '>', '|'], "_");
    let db_path = app_data_dir.join(format!("biogrep_vectors_{}.db", safe_model_id));

    // Ensure directory exists
    std::fs::create_dir_all(&app_data_dir).map_err(|e| e.to_string())?;

    let store =
        crate::vectorstore::VectorStore::new(&db_path, dimension).map_err(|e| e.to_string())?;

    let mut guard = state.0.lock().unwrap();
    *guard = Some(store);

    Ok(db_path.to_string_lossy().to_string())
}

/// Add a document chunk to the vector store (now with optional file_id)
#[tauri::command]
pub fn add_document_chunk(
    state: State<VectorStoreState>,
    file_id: Option<i64>,
    path: String,
    chunk_index: i32,
    content: String,
    embedding: Vec<f32>,
) -> Result<i64, String> {
    let guard = state.0.lock().unwrap();
    let store = guard.as_ref().ok_or("Vector store not initialized")?;

    store
        .add_chunk(file_id, &path, chunk_index, &content, &embedding)
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

/// Search for similar documents, filtered to specific folders
#[tauri::command]
pub fn search_vectors_by_folders(
    state: State<VectorStoreState>,
    query_embedding: Vec<f32>,
    folder_ids: Vec<i64>,
    limit: usize,
) -> Result<Vec<VectorSearchResult>, String> {
    let guard = state.0.lock().unwrap();
    let store = guard.as_ref().ok_or("Vector store not initialized")?;

    store
        .search_by_folders(&query_embedding, &folder_ids, limit)
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

/// Clear all indexed data
#[tauri::command]
pub fn clear_all_chunks(state: State<VectorStoreState>) -> Result<usize, String> {
    let guard = state.0.lock().unwrap();
    let store = guard.as_ref().ok_or("Vector store not initialized")?;

    store.clear_all().map_err(|e| e.to_string())
}

// ============ FOLDER MANAGEMENT COMMANDS ============

/// Add or update an indexed folder
#[tauri::command]
pub fn add_indexed_folder(
    state: State<VectorStoreState>,
    path: String,
    label: Option<String>,
) -> Result<i64, String> {
    let guard = state.0.lock().unwrap();
    let store = guard.as_ref().ok_or("Vector store not initialized")?;

    store
        .add_folder(&path, label.as_deref())
        .map_err(|e| e.to_string())
}

/// Get all indexed folders
#[tauri::command]
pub fn get_indexed_folders(state: State<VectorStoreState>) -> Result<Vec<IndexedFolder>, String> {
    let guard = state.0.lock().unwrap();
    let store = guard.as_ref().ok_or("Vector store not initialized")?;

    store.get_folders().map_err(|e| e.to_string())
}

/// Delete an indexed folder and all its chunks
#[tauri::command]
pub fn delete_indexed_folder(
    state: State<VectorStoreState>,
    folder_id: i64,
) -> Result<usize, String> {
    let guard = state.0.lock().unwrap();
    let store = guard.as_ref().ok_or("Vector store not initialized")?;

    store.delete_folder(folder_id).map_err(|e| e.to_string())
}

/// Update folder stats after indexing
#[tauri::command]
pub fn update_folder_stats(
    state: State<VectorStoreState>,
    folder_id: i64,
    file_count: i64,
    chunk_count: i64,
) -> Result<(), String> {
    let guard = state.0.lock().unwrap();
    let store = guard.as_ref().ok_or("Vector store not initialized")?;

    store
        .update_folder_stats(folder_id, file_count, chunk_count)
        .map_err(|e| e.to_string())
}

// ============ FILE MANAGEMENT COMMANDS ============

/// Add or update an indexed file
#[tauri::command]
pub fn add_indexed_file(
    state: State<VectorStoreState>,
    folder_id: i64,
    path: String,
    last_modified: i64,
    file_hash: Option<String>,
) -> Result<i64, String> {
    let guard = state.0.lock().unwrap();
    let store = guard.as_ref().ok_or("Vector store not initialized")?;

    store
        .add_file(folder_id, &path, last_modified, file_hash.as_deref())
        .map_err(|e| e.to_string())
}

/// Get an indexed file by path
#[tauri::command]
pub fn get_indexed_file(
    state: State<VectorStoreState>,
    path: String,
) -> Result<Option<IndexedFile>, String> {
    let guard = state.0.lock().unwrap();
    let store = guard.as_ref().ok_or("Vector store not initialized")?;

    store.get_file(&path).map_err(|e| e.to_string())
}

/// Check if a file needs re-indexing based on mtime
#[tauri::command]
pub fn is_file_stale(
    state: State<VectorStoreState>,
    path: String,
    current_mtime: i64,
) -> Result<bool, String> {
    let guard = state.0.lock().unwrap();
    let store = guard.as_ref().ok_or("Vector store not initialized")?;

    store
        .is_file_stale(&path, current_mtime)
        .map_err(|e| e.to_string())
}

/// Delete all chunks for a file before re-indexing
#[tauri::command]
pub fn delete_file_chunks(state: State<VectorStoreState>, file_id: i64) -> Result<usize, String> {
    let guard = state.0.lock().unwrap();
    let store = guard.as_ref().ok_or("Vector store not initialized")?;

    store.delete_file_chunks(file_id).map_err(|e| e.to_string())
}

/// Update file chunk count after indexing
#[tauri::command]
pub fn update_file_chunk_count(
    state: State<VectorStoreState>,
    file_id: i64,
    chunk_count: i64,
) -> Result<(), String> {
    let guard = state.0.lock().unwrap();
    let store = guard.as_ref().ok_or("Vector store not initialized")?;

    store
        .update_file_chunk_count(file_id, chunk_count)
        .map_err(|e| e.to_string())
}
