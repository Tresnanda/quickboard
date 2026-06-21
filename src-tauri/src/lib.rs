// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
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
        .invoke_handler(tauri::generate_handler![greet, spike_drag_paths])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
