use tauri::Manager;

// SPIKE: throwaway Touch ID-gate feasibility, removed/replaced in Plan 2.
mod confidential;

// Plan 2, Task 4: AES-256-GCM crypto core.
pub mod crypto;

// Plan 2, Task 5: persist the Data Encryption Key in the OS keyring.
pub mod keyring_dek;

// Plan 2, Task 6: item data model and encrypted SQLite store.
pub mod model;
pub mod store;

// Plan 2, Task 7: core IPC commands wired to the encrypted store.
pub mod commands;

// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

// SPIKE: throwaway, removed/replaced in Plan 2.
// Triggers a Touch ID system prompt via LocalAuthentication (LAContext). Works
// under unsigned `tauri dev` with no keychain entitlement / no code-signing.
// Returns Ok(true) on successful auth, or a String error on cancel/failure.
#[tauri::command]
fn spike_biometric() -> Result<bool, String> {
    confidential::biometric_roundtrip()
}

// SPIKE: throwaway drag-out test, removed in Plan 2.
// Returns absolute paths to a real file to drag and an icon for the drag
// preview. Both are embedded at compile time and written to the OS temp dir on
// demand, so the paths are always valid in `tauri dev` without depending on
// bundled-resource packaging.
#[tauri::command]
fn spike_drag_paths() -> Result<(String, String), String> {
    let sample_bytes = include_bytes!("../sample-drag.txt");
    let icon_bytes = include_bytes!("../icons/128x128.png");

    let dir = std::env::temp_dir().join("quickboard-spike");
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;

    let file_path = dir.join("sample-drag.txt");
    std::fs::write(&file_path, sample_bytes).map_err(|e| e.to_string())?;

    let icon_path = dir.join("drag-icon.png");
    std::fs::write(&icon_path, icon_bytes).map_err(|e| e.to_string())?;

    Ok((
        file_path.to_string_lossy().into_owned(),
        icon_path.to_string_lossy().into_owned(),
    ))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        // SPIKE: throwaway drag-out test, removed in Plan 2
        .plugin(tauri_plugin_drag::init())
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
            greet,
            spike_drag_paths,
            // SPIKE: throwaway Touch ID-gate feasibility, removed/replaced in Plan 2.
            spike_biometric,
            // Plan 2, Task 7: core IPC commands wired to the encrypted store.
            commands::list_items,
            commands::add_text_item,
            commands::get_text_value,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
