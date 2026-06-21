use std::sync::Mutex;
use tauri::State;
use crate::store::Store;
use crate::model::Item;

/// Run the (blocking) Touch ID prompt on a blocking worker so the webview / main
/// thread never freezes while the system prompt is up. Returns `Err` on cancel,
/// failure, or a Mac with no biometrics enrolled.
async fn require_biometric() -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(crate::confidential::biometric_roundtrip)
        .await
        .map_err(|e| format!("biometric task failed: {e:?}"))?
        .map(|_| ())
}

#[tauri::command]
pub fn list_items(store: State<Mutex<Store>>) -> Result<Vec<Item>, String> {
    store.lock().unwrap().list()
}

#[tauri::command]
pub fn add_text_item(
    store: State<Mutex<Store>>,
    label: String,
    category: String,
    confidential: bool,
    value: String,
) -> Result<String, String> {
    store.lock().unwrap().add_text(&label, &category, confidential, &value)
}

#[tauri::command]
pub async fn get_text_value(store: State<'_, Mutex<Store>>, id: String) -> Result<String, String> {
    // Confidential items require a Touch ID unlock before we decrypt + return.
    let confidential = { store.lock().unwrap().is_confidential(&id)? };
    if confidential {
        require_biometric().await?;
    }
    let value = { store.lock().unwrap().get_text(&id)? };
    Ok(value)
}

#[tauri::command]
pub fn set_pinned(store: State<Mutex<Store>>, id: String, pinned: bool) -> Result<(), String> {
    store.lock().unwrap().set_pinned(&id, pinned)
}

#[tauri::command]
pub fn delete_item(store: State<Mutex<Store>>, id: String) -> Result<(), String> {
    store.lock().unwrap().delete(&id)
}

#[tauri::command]
pub fn list_categories(store: State<Mutex<Store>>) -> Result<Vec<String>, String> {
    store.lock().unwrap().list_categories()
}

#[tauri::command]
pub fn add_file_item(store: State<Mutex<Store>>, label: String, category: String,
                     confidential: bool, src_path: String) -> Result<String, String> {
    let bytes = std::fs::read(&src_path).map_err(|e| e.to_string())?;
    let filename = std::path::Path::new(&src_path).file_name()
        .and_then(|s| s.to_str()).unwrap_or("file").to_string();
    let mime = mime_guess_from_name(&filename);
    store.lock().unwrap().add_file(&label, &category, confidential, &filename, &mime, &bytes)
}

fn mime_guess_from_name(name: &str) -> String {
    match name.rsplit('.').next().unwrap_or("").to_lowercase().as_str() {
        "png" => "image/png", "jpg" | "jpeg" => "image/jpeg", "pdf" => "application/pdf",
        _ => "application/octet-stream",
    }.to_string()
}

#[tauri::command]
pub async fn file_to_temp(store: State<'_, Mutex<Store>>, app: tauri::AppHandle, id: String) -> Result<String, String> {
    use tauri::Manager;
    // A confidential file requires a Touch ID unlock before it leaves the vault.
    let confidential = { store.lock().unwrap().is_confidential(&id)? };
    if confidential {
        require_biometric().await?;
    }
    let (filename, bytes) = { store.lock().unwrap().read_file_bytes(&id)? };
    let dir = app.path().temp_dir().map_err(|e| e.to_string())?.join("quickboard-drag");
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let p = dir.join(filename);
    std::fs::write(&p, bytes).map_err(|e| e.to_string())?;
    Ok(p.to_string_lossy().to_string())
}
