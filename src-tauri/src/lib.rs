use tauri::Manager;

// Retained for Plan 3 confidential gate (biometric_roundtrip used by Plan 3 unlock flow).
mod confidential;

// Plan 2, Task 4: AES-256-GCM crypto core.
pub mod crypto;

// Plan 2, Task 5: persist the Data Encryption Key in the OS keyring.
pub mod keyring_dek;

// Plan 2, Task 6: item data model and encrypted SQLite store.
pub mod model;
pub mod store;

// Plan 2, Task 2: encrypted file-blob storage.
pub mod blobs;

// Plan 2, Task 7: core IPC commands wired to the encrypted store.
pub mod commands;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        // Drag plugin: used by the real app for file drag-out from items.
        .plugin(tauri_plugin_drag::init())
        // Plan 2, Task 6: native file picker for the Add-item dialog.
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            // Load (or create) the Data Encryption Key from the OS keyring.
            let key = keyring_dek::load_or_create_dek("quickboard")
                .map_err(|e| Box::<dyn std::error::Error>::from(e))?;

            // Resolve the app data directory and ensure it exists.
            let app_data_dir = app.path().app_data_dir()
                .map_err(|e| Box::<dyn std::error::Error>::from(e.to_string()))?;
            std::fs::create_dir_all(&app_data_dir)
                .map_err(|e| Box::<dyn std::error::Error>::from(e))?;

            // Open the encrypted SQLite store.
            let db_path = app_data_dir.join("quickboard.db");
            let db_path_str = db_path.to_string_lossy().into_owned();
            let store = store::Store::open(&db_path_str, key)
                .map_err(|e| Box::<dyn std::error::Error>::from(e))?;

            // Register the store as managed state (wrapped in a Mutex for thread safety).
            app.manage(std::sync::Mutex::new(store));
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            // Plan 2, Task 7: core IPC commands wired to the encrypted store.
            commands::list_items,
            commands::add_text_item,
            commands::get_text_value,
            // Plan 2, Task 3: file/CRUD/category IPC commands.
            commands::set_pinned,
            commands::delete_item,
            commands::list_categories,
            commands::add_file_item,
            commands::file_to_temp,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
