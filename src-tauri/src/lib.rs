// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/

mod commands;
mod vectorstore;

use vectorstore::VectorStoreState;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_opener::init())
        .manage(VectorStoreState::new())
        .invoke_handler(tauri::generate_handler![
            commands::init_vectorstore,
            commands::add_document_chunk,
            commands::search_vectors,
            commands::delete_indexed_path,
            commands::is_path_indexed,
            commands::get_chunk_count,
            commands::clear_all_chunks,
            // Folder management
            commands::add_indexed_folder,
            commands::get_indexed_folders,
            commands::delete_indexed_folder,
            commands::update_folder_stats,
            // File management
            commands::add_indexed_file,
            commands::get_indexed_file,
            commands::is_file_stale,
            commands::delete_file_chunks,
            commands::update_file_chunk_count,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
