use std::sync::Mutex;
use tauri::State;
use crate::store::Store;
use crate::model::Item;

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
pub fn get_text_value(store: State<Mutex<Store>>, id: String) -> Result<String, String> {
    // Plan 2 will add: if the item is confidential -> require a biometric unlock before returning.
    store.lock().unwrap().get_text(&id)
}
