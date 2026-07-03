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

/// Single seam every confidential-egress command routes through: release the value
/// only after `authorize` succeeds. In production `authorize` is `require_biometric()`
/// (the Touch ID round-trip); tests inject stub futures to drive the decision table
/// without an interactive prompt. Futures are lazy in Rust, so passing an un-awaited
/// `require_biometric()` here never fires the prompt for a non-confidential item.
async fn gate_confidential<F>(confidential: bool, authorize: F) -> Result<(), String>
where
    F: std::future::Future<Output = Result<(), String>>,
{
    if confidential {
        authorize.await?;
    }
    Ok(())
}

#[tauri::command]
pub fn list_items(store: State<Mutex<Store>>) -> Result<Vec<Item>, String> {
    store.lock().unwrap_or_else(std::sync::PoisonError::into_inner).list()
}

#[tauri::command]
pub fn add_text_item(
    store: State<Mutex<Store>>,
    label: String,
    category: String,
    environment: String,
    confidential: bool,
    value: String,
) -> Result<String, String> {
    store.lock().unwrap_or_else(std::sync::PoisonError::into_inner).add_text(&label, &category, &environment, confidential, &value)
}

#[tauri::command]
pub fn list_environments(store: State<Mutex<Store>>) -> Result<Vec<String>, String> {
    store.lock().unwrap_or_else(std::sync::PoisonError::into_inner).list_environments()
}

#[tauri::command]
pub fn set_environment(store: State<Mutex<Store>>, id: String, environment: String) -> Result<(), String> {
    store.lock().unwrap_or_else(std::sync::PoisonError::into_inner).set_environment(&id, &environment)
}

#[tauri::command]
pub fn update_item(
    store: State<Mutex<Store>>,
    id: String,
    label: String,
    category: String,
    environment: String,
    confidential: bool,
    value: Option<String>,
) -> Result<(), String> {
    store.lock().unwrap_or_else(std::sync::PoisonError::into_inner).update_item(&id, &label, &category, &environment, confidential, value.as_deref())
}

#[tauri::command]
pub async fn get_text_value(store: State<'_, Mutex<Store>>, id: String) -> Result<String, String> {
    // Confidential items require a Touch ID unlock before we decrypt + return.
    // SECURITY: gate_confidential must run before any read of the body.
    let confidential = { store.lock().unwrap_or_else(std::sync::PoisonError::into_inner).is_confidential(&id)? };
    gate_confidential(confidential, require_biometric()).await?;
    let value = { store.lock().unwrap_or_else(std::sync::PoisonError::into_inner).get_text(&id)? };
    Ok(value)
}

#[tauri::command]
pub fn set_pinned(store: State<Mutex<Store>>, id: String, pinned: bool) -> Result<(), String> {
    store.lock().unwrap_or_else(std::sync::PoisonError::into_inner).set_pinned(&id, pinned)
}

#[tauri::command]
pub fn delete_item(store: State<Mutex<Store>>, id: String) -> Result<(), String> {
    store.lock().unwrap_or_else(std::sync::PoisonError::into_inner).delete(&id)
}

#[tauri::command]
pub fn list_categories(store: State<Mutex<Store>>) -> Result<Vec<String>, String> {
    store.lock().unwrap_or_else(std::sync::PoisonError::into_inner).list_categories()
}

/// Persist the clipboard-history buffer, encrypted under the DEK. Callable from
/// any window (writes originate from main/summon/tray).
#[tauri::command]
pub fn clip_history_save(store: State<Mutex<Store>>, json: String) -> Result<(), String> {
    store.lock().unwrap_or_else(std::sync::PoisonError::into_inner).save_clips(&json)
}

/// Load + decrypt the clipboard-history buffer (JSON array; `"[]"` when absent).
#[tauri::command]
pub fn clip_history_load(store: State<Mutex<Store>>) -> Result<String, String> {
    store.lock().unwrap_or_else(std::sync::PoisonError::into_inner).load_clips()
}

#[tauri::command]
pub fn add_file_item(store: State<Mutex<Store>>, label: String, category: String,
                     environment: String, confidential: bool, src_path: String) -> Result<String, String> {
    let bytes = std::fs::read(&src_path).map_err(|e| e.to_string())?;
    let filename = std::path::Path::new(&src_path).file_name()
        .and_then(|s| s.to_str()).unwrap_or("file").to_string();
    let mime = mime_guess_from_name(&filename);
    store.lock().unwrap_or_else(std::sync::PoisonError::into_inner).add_file(&label, &category, &environment, confidential, &filename, &mime, &bytes)
}

fn mime_guess_from_name(name: &str) -> String {
    match name.rsplit('.').next().unwrap_or("").to_lowercase().as_str() {
        "png" => "image/png", "jpg" | "jpeg" => "image/jpeg", "webp" => "image/webp",
        "gif" => "image/gif", "heic" => "image/heic", "pdf" => "application/pdf",
        _ => "application/octet-stream",
    }.to_string()
}

/// Read any image file the user picked (folder cover) into a `data:` URL.
#[tauri::command]
pub fn read_image_as_data_url(path: String) -> Result<String, String> {
    use base64::Engine as _;
    let bytes = std::fs::read(&path).map_err(|e| e.to_string())?;
    let mime = mime_guess_from_name(&path);
    let b64 = base64::engine::general_purpose::STANDARD.encode(&bytes);
    Ok(format!("data:{mime};base64,{b64}"))
}

#[tauri::command]
pub fn rename_category(store: State<Mutex<Store>>, old: String, new: String, environment: Option<String>) -> Result<(), String> {
    store.lock().unwrap_or_else(std::sync::PoisonError::into_inner).rename_category(&old, &new, environment.as_deref())
}

#[tauri::command]
pub fn delete_category(store: State<Mutex<Store>>, category: String, environment: Option<String>) -> Result<(), String> {
    store.lock().unwrap_or_else(std::sync::PoisonError::into_inner).delete_category(&category, environment.as_deref())
}

#[tauri::command]
pub fn rename_environment(store: State<Mutex<Store>>, old: String, new: String) -> Result<(), String> {
    store.lock().unwrap_or_else(std::sync::PoisonError::into_inner).rename_environment(&old, &new)
}

#[tauri::command]
pub fn delete_environment(store: State<Mutex<Store>>, environment: String, reassign_to: String) -> Result<(), String> {
    store.lock().unwrap_or_else(std::sync::PoisonError::into_inner).delete_environment(&environment, &reassign_to)
}

/// Return a file's bytes as a `data:` URL for in-app display (image covers).
/// Confidential files still gate on Touch ID before any bytes leave the vault;
/// the UI only requests covers for non-confidential images, so the prompt is
/// effectively never hit on the board.
#[tauri::command]
pub async fn get_image_data_url(store: State<'_, Mutex<Store>>, id: String) -> Result<String, String> {
    use base64::Engine as _;
    // SECURITY: gate_confidential must run before any read of the body.
    let confidential = { store.lock().unwrap_or_else(std::sync::PoisonError::into_inner).is_confidential(&id)? };
    gate_confidential(confidential, require_biometric()).await?;
    let (_filename, mime, bytes) = { store.lock().unwrap_or_else(std::sync::PoisonError::into_inner).read_file(&id)? };
    let b64 = base64::engine::general_purpose::STANDARD.encode(&bytes);
    Ok(format!("data:{mime};base64,{b64}"))
}

#[tauri::command]
pub async fn file_to_temp(store: State<'_, Mutex<Store>>, app: tauri::AppHandle, id: String) -> Result<String, String> {
    use tauri::Manager;
    // A confidential file requires a Touch ID unlock before it leaves the vault.
    // SECURITY: gate_confidential must run before any read of the body.
    let confidential = { store.lock().unwrap_or_else(std::sync::PoisonError::into_inner).is_confidential(&id)? };
    gate_confidential(confidential, require_biometric()).await?;
    let (filename, bytes) = { store.lock().unwrap_or_else(std::sync::PoisonError::into_inner).read_file_bytes(&id)? };
    let dir = app.path().temp_dir().map_err(|e| e.to_string())?.join("quickboard-drag");
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let p = dir.join(filename);
    std::fs::write(&p, bytes).map_err(|e| e.to_string())?;
    Ok(p.to_string_lossy().to_string())
}

/// Phase 1 "Summon anywhere": dismiss the panel and paste the value (already on the
/// clipboard) at the user's cursor in whatever app they were in. Auto-paste needs
/// macOS Accessibility permission; the value is on the clipboard regardless, so ⌘V
/// works as a fallback if the key-synthesis is blocked.
#[cfg(target_os = "macos")]
const MACOS_ANSI_V_KEYCODE: u16 = 0x09;

fn paste_at_cursor(app: &tauri::AppHandle) -> Result<(), String> {
    let (tx, rx) = std::sync::mpsc::channel();
    app.run_on_main_thread(move || {
        let result = (|| {
            crate::summon::reactivate_prev();
            // Two waits are folded together here, and BOTH matter:
            //
            // 1. App activation: if quickboard somehow became the active app, wait
            //    (poll, hard-capped) until the remembered app is frontmost again —
            //    a fixed sleep can't bound Spaces switches or heavy apps.
            // 2. Key-window handoff: the summon panel is a NON-ACTIVATING NSPanel,
            //    so the target app usually stays frontmost the entire time — the
            //    poll succeeds instantly — but the panel still holds KEY (keyboard)
            //    status until it finishes hiding. AppKit exposes no cheap signal for
            //    that handoff, so a minimum settle delay is load-bearing: without it
            //    the synthetic ⌘V fires while the panel still owns the keyboard and
            //    the paste is lost. 140ms is the empirically reliable floor.
            let start = std::time::Instant::now();
            if let Some(target) = crate::summon::prev_pid() {
                for _ in 0..20 {
                    if crate::summon::frontmost_pid() == Some(target) {
                        break;
                    }
                    std::thread::sleep(std::time::Duration::from_millis(20));
                }
            }
            const MIN_SETTLE: std::time::Duration = std::time::Duration::from_millis(140);
            if let Some(rest) = MIN_SETTLE.checked_sub(start.elapsed()) {
                std::thread::sleep(rest);
            }

            use enigo::{Direction, Enigo, Key, Keyboard, Settings};
            let mut enigo = Enigo::new(&Settings::default()).map_err(|e| e.to_string())?;
            enigo.key(Key::Meta, Direction::Press).map_err(|e| e.to_string())?;
            let paste_result = enigo.raw(MACOS_ANSI_V_KEYCODE, Direction::Click).map_err(|e| e.to_string());
            let release_result = enigo.key(Key::Meta, Direction::Release).map_err(|e| e.to_string());
            paste_result?;
            release_result?;
            Ok(())
        })();
        let _ = tx.send(result);
    })
    .map_err(|e| e.to_string())?;
    rx.recv().map_err(|e| e.to_string())?
}

#[tauri::command]
pub fn summon_paste(app: tauri::AppHandle) -> Result<(), String> {
    use tauri::Manager;
    if let Some(win) = app.get_webview_window("summon") {
        let _ = win.hide();
    }
    paste_at_cursor(&app)
}

#[tauri::command]
pub async fn summon_paste_image(store: State<'_, Mutex<Store>>, app: tauri::AppHandle, id: String) -> Result<(), String> {
    // SECURITY: gate_confidential must run before any read of the body.
    let confidential = { store.lock().unwrap_or_else(std::sync::PoisonError::into_inner).is_confidential(&id)? };
    gate_confidential(confidential, require_biometric()).await?;
    let (_filename, mime, bytes) = { store.lock().unwrap_or_else(std::sync::PoisonError::into_inner).read_file(&id)? };
    if !mime.starts_with("image/") {
        return Err("item is not an image".to_string());
    }

    #[cfg(target_os = "macos")]
    {
        let (tx, rx) = std::sync::mpsc::channel();
        app.run_on_main_thread(move || {
            use objc2::AnyThread;
            use objc2_app_kit::{NSImage, NSPasteboard, NSPasteboardTypeTIFF};
            use objc2_foundation::NSData;

            let result = (|| {
                let data = NSData::from_vec(bytes);
                let image = NSImage::initWithData(NSImage::alloc(), &data)
                    .ok_or_else(|| "failed to decode image".to_string())?;
                let tiff = image.TIFFRepresentation()
                    .ok_or_else(|| "failed to encode image for pasteboard".to_string())?;
                let pb = NSPasteboard::generalPasteboard();
                pb.clearContents();
                let tiff_type = unsafe { NSPasteboardTypeTIFF };
                if !pb.setData_forType(Some(&tiff), tiff_type) {
                    return Err("failed to write pasteboard".to_string());
                }
                Ok(())
            })();
            let _ = tx.send(result);
        })
        .map_err(|e| e.to_string())?;
        rx.recv().map_err(|e| e.to_string())??;
    }

    #[cfg(not(target_os = "macos"))]
    {
        let _ = bytes;
        return Err("image paste is only supported on macOS".to_string());
    }

    summon_paste(app)
}

/// Dismiss the panel without pasting (Esc / blur).
#[tauri::command]
pub fn summon_hide(app: tauri::AppHandle) -> Result<(), String> {
    use tauri::Manager;
    if let Some(win) = app.get_webview_window("summon") {
        let _ = win.hide();
    }
    crate::summon::reactivate_prev();
    Ok(())
}

/// Launch-at-login toggle, wired to the OS login item via the autostart plugin.
#[tauri::command]
pub fn set_autostart(app: tauri::AppHandle, enabled: bool) -> Result<(), String> {
    use tauri_plugin_autostart::ManagerExt;
    let m = app.autolaunch();
    if enabled {
        m.enable().map_err(|e| e.to_string())
    } else {
        m.disable().map_err(|e| e.to_string())
    }
}

#[tauri::command]
pub fn get_autostart(app: tauri::AppHandle) -> Result<bool, String> {
    use tauri_plugin_autostart::ManagerExt;
    app.autolaunch().is_enabled().map_err(|e| e.to_string())
}

/// Write a small data-URL image to a temp file for use as a drag preview, so
/// dragging a file item doesn't drag the full-size image around the screen.
#[tauri::command]
pub fn write_drag_icon(app: tauri::AppHandle, data_url: String) -> Result<String, String> {
    use base64::Engine as _;
    use tauri::Manager;
    let b64 = data_url.split(',').nth(1).ok_or_else(|| "bad data url".to_string())?;
    let bytes = base64::engine::general_purpose::STANDARD.decode(b64).map_err(|e| e.to_string())?;
    let dir = app.path().temp_dir().map_err(|e| e.to_string())?.join("quickboard-drag");
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let p = dir.join("drag-icon.png");
    std::fs::write(&p, &bytes).map_err(|e| e.to_string())?;
    Ok(p.to_string_lossy().to_string())
}

/// Write a tray text entry to a temp .txt file so it can ride along in a mixed
/// (files + text) drag-out as a real file. Lives in the same temp dir the
/// drop-to-save listeners ignore.
#[tauri::command]
pub fn stage_text_file(app: tauri::AppHandle, label: String, value: String) -> Result<String, String> {
    use tauri::Manager;
    let dir = app.path().temp_dir().map_err(|e| e.to_string())?.join("quickboard-drag");
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let safe: String = label
        .chars()
        .map(|c| if c.is_alphanumeric() || c == ' ' || c == '-' || c == '_' { c } else { '_' })
        .collect();
    let trimmed = safe.trim();
    let name: String = if trimmed.is_empty() { "note".to_string() } else { trimmed.chars().take(40).collect() };
    let p = dir.join(format!("{name}.txt"));
    std::fs::write(&p, value).map_err(|e| e.to_string())?;
    Ok(p.to_string_lossy().to_string())
}

/// The durable directory staged tray files live in. NOT the OS temp dir: macOS
/// reaps files under `/var/folders/.../T/` after ~3 days, but the tray keeps a path
/// reference indefinitely (localStorage), so a staged image that outlived its bytes
/// silently "turned into a file". Living under app-data, staged bytes survive
/// reboots; orphans are reclaimed by `sweep_staged_files` on startup (not on remove,
/// which is undoable).
fn staged_root(app: &tauri::AppHandle) -> Result<std::path::PathBuf, String> {
    use tauri::Manager;
    Ok(app.path().app_data_dir().map_err(|e| e.to_string())?.join("staged"))
}

/// Filename extension for a known image mime (empty when unknown).
fn ext_for_mime(mime: &str) -> &'static str {
    match mime {
        "image/png" => "png",
        "image/jpeg" => "jpg",
        "image/gif" => "gif",
        "image/webp" => "webp",
        "image/svg+xml" => "svg",
        "image/heic" => "heic",
        "image/bmp" => "bmp",
        "image/tiff" => "tiff",
        _ => "",
    }
}

fn now_nanos() -> u128 {
    std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_nanos()).unwrap_or(0)
}

/// Write `bytes` to `root/<stamp>/<clean name>` and return the path. A unique
/// per-file subdir keeps the basename clean (it drives the committed filename +
/// mime) while avoiding collisions. `ext` backfills an extension when `name` has
/// none.
fn write_staged(root: &std::path::Path, stamp: u128, name: &str, ext: &str, bytes: &[u8]) -> Result<String, String> {
    let safe: String = name
        .chars()
        .map(|c| if c.is_alphanumeric() || c == '.' || c == ' ' || c == '-' || c == '_' { c } else { '_' })
        .collect();
    let trimmed = safe.trim();
    let mut fname: String = if trimmed.is_empty() { "image".to_string() } else { trimmed.chars().take(60).collect() };
    if !fname.contains('.') && !ext.is_empty() {
        fname = format!("{fname}.{ext}");
    }
    let dir = root.join(format!("{stamp:x}"));
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let p = dir.join(&fname);
    std::fs::write(&p, bytes).map_err(|e| e.to_string())?;
    Ok(p.to_string_lossy().to_string())
}

/// Write a blob dropped into the webview to the durable staged dir so it can be
/// staged on the tray like any other file. A browser image drag carries bytes (a
/// `data:` URL), not a path — and with native drag-drop disabled on the tray,
/// Finder files arrive as bytes too.
#[tauri::command]
pub fn stage_blob_file(app: tauri::AppHandle, data_url: String, name: String) -> Result<String, String> {
    use base64::Engine as _;
    let comma = data_url.find(',').ok_or_else(|| "bad data url".to_string())?;
    let header = &data_url[..comma];
    let bytes = base64::engine::general_purpose::STANDARD
        .decode(data_url[comma + 1..].as_bytes())
        .map_err(|e| e.to_string())?;
    let mime = header.strip_prefix("data:").and_then(|h| h.split(';').next()).unwrap_or("");
    write_staged(&staged_root(&app)?, now_nanos(), &name, ext_for_mime(mime), &bytes)
}

/// Copy an already-written file (a Clipboard-lane image lives in the ephemeral clip
/// temp dir) into the durable staged dir, so a Shelf entry that references it
/// survives temp reaping. `mime` backfills an extension when `name` has none.
#[tauri::command]
pub fn persist_staged_file(app: tauri::AppHandle, path: String, name: String, mime: Option<String>) -> Result<String, String> {
    let bytes = std::fs::read(&path).map_err(|e| e.to_string())?;
    write_staged(&staged_root(&app)?, now_nanos(), &name, ext_for_mime(mime.as_deref().unwrap_or("")), &bytes)
}

/// Return the subset of `paths` that still exist on disk — lets the tray prune
/// entries whose staged bytes were already reaped (they're unrecoverable).
#[tauri::command]
pub fn existing_paths(paths: Vec<String>) -> Vec<String> {
    paths.into_iter().filter(|p| std::path::Path::new(p).exists()).collect()
}

/// Whether `p` was modified within `grace` (unknown/future mtime counts as old).
fn young(p: &std::path::Path, grace: std::time::Duration) -> bool {
    std::fs::metadata(p)
        .and_then(|m| m.modified())
        .ok()
        .and_then(|t| t.elapsed().ok())
        .map(|age| age < grace)
        .unwrap_or(false)
}

/// Remove files under `root` not in `keep` (and older than `grace`), dropping the
/// now-empty stamp subdirs. Best-effort: per-entry errors are skipped. Returns the
/// count removed.
fn sweep_dir(root: &std::path::Path, keep: &std::collections::HashSet<String>, grace: std::time::Duration) -> u32 {
    let mut removed = 0u32;
    let subdirs = match std::fs::read_dir(root) {
        Ok(e) => e,
        Err(_) => return 0, // no staged dir yet — nothing to reclaim
    };
    for sub in subdirs.flatten() {
        let subdir = sub.path();
        if !subdir.is_dir() {
            continue;
        }
        let mut kept_any = false;
        if let Ok(files) = std::fs::read_dir(&subdir) {
            for f in files.flatten() {
                let p = f.path();
                let path_str = p.to_string_lossy().to_string();
                if keep.contains(&path_str) || young(&p, grace) {
                    kept_any = true; // referenced, or too fresh to judge — leave it
                } else if std::fs::remove_file(&p).is_ok() {
                    removed += 1;
                } else {
                    kept_any = true;
                }
            }
        }
        if !kept_any {
            let _ = std::fs::remove_dir_all(&subdir);
        }
    }
    removed
}

/// Like `sweep_dir`, but for a flat layout: remove files directly under `root`
/// not in `keep` (and older than `grace`); subdirectories are skipped. Best-effort:
/// per-entry errors are skipped. Returns the count removed.
fn sweep_flat_dir(root: &std::path::Path, keep: &std::collections::HashSet<String>, grace: std::time::Duration) -> u32 {
    let mut removed = 0u32;
    let entries = match std::fs::read_dir(root) {
        Ok(e) => e,
        Err(_) => return 0, // no temp dir yet — nothing to reclaim
    };
    for f in entries.flatten() {
        let p = f.path();
        if p.is_dir() {
            continue;
        }
        let path_str = p.to_string_lossy().to_string();
        if keep.contains(&path_str) || young(&p, grace) {
            continue; // referenced, or too fresh to judge — leave it
        }
        if std::fs::remove_file(&p).is_ok() {
            removed += 1;
        }
    }
    removed
}

/// Delete staged files no longer referenced by the tray. Run on startup: no undo is
/// pending across a restart, so an unreferenced file is a true orphan. A short mtime
/// grace spares a file another window staged mid-startup.
#[tauri::command]
pub fn sweep_staged_files(app: tauri::AppHandle, keep: Vec<String>) -> Result<u32, String> {
    let root = staged_root(&app)?;
    Ok(sweep_dir(&root, &keep.into_iter().collect(), std::time::Duration::from_secs(30)))
}

/// Delete plaintext temp files (drag-out decrypts, clipboard captures) no
/// longer referenced by the tray/clipboard. Run on startup; a generous mtime
/// grace spares files from a drag or capture still in flight.
#[tauri::command]
pub fn sweep_temp_files(app: tauri::AppHandle, keep: Vec<String>) -> Result<u32, String> {
    use tauri::Manager;
    let keep: std::collections::HashSet<String> = keep.into_iter().collect();
    let tmp = app.path().temp_dir().map_err(|e| e.to_string())?;
    let grace = std::time::Duration::from_secs(300);
    let mut n = sweep_flat_dir(&tmp.join("quickboard-drag"), &keep, grace);
    // quickboard-clip nests per-capture stamp subdirs — same layout as the
    // staged dir, so the existing subdir sweeper is the right tool.
    n += sweep_dir(&tmp.join("quickboard-clip"), &keep, grace);
    Ok(n)
}

/// Whether the clipboard-history watcher captures copies. The poll thread runs
/// always but only reads + emits when this is on (toggled by the opt-in setting),
/// so a disabled history never even reads the pasteboard contents.
pub static CLIP_WATCH: std::sync::atomic::AtomicBool = std::sync::atomic::AtomicBool::new(false);

#[tauri::command]
pub fn set_clipboard_watch(enabled: bool) {
    CLIP_WATCH.store(enabled, std::sync::atomic::Ordering::Relaxed);
}

/// Background pasteboard poll for the Clipboard lane. Emits `clipboard:new`
/// { value, isUrl, sourceApp } for each fresh copy while enabled — skipping password-manager
/// / transient copies and whatever was already on the clipboard at launch.
#[cfg(target_os = "macos")]
pub fn start_clipboard_watch(app: tauri::AppHandle) {
    use objc2_app_kit::{NSPasteboard, NSPasteboardTypeString, NSWorkspace};
    use std::sync::atomic::Ordering;
    use tauri::Emitter;
    fn frontmost_app_name() -> Option<String> {
        NSWorkspace::sharedWorkspace()
            .frontmostApplication()
            .and_then(|front| front.localizedName())
            .map(|name| name.to_string())
            .filter(|name| !name.trim().is_empty())
    }
    std::thread::spawn(move || {
        let mut last: isize = -1;
        let mut last_frontmost_app = frontmost_app_name();
        loop {
            std::thread::sleep(std::time::Duration::from_millis(600));
            // While history is off (the default) the thread stays fully idle — no
            // AppKit frontmost query, no pasteboard read. Forgetting `last` means the
            // first poll after re-enable is treated as "pre-existing" and skipped.
            if !CLIP_WATCH.load(Ordering::Relaxed) {
                last = -1;
                continue;
            }
            let current_frontmost_app = frontmost_app_name();
            // ponytail: stable-app heuristic; omit source if the user switched apps between polls.
            let source_app = if current_frontmost_app == last_frontmost_app { current_frontmost_app.clone() } else { None };
            last_frontmost_app = current_frontmost_app;
            let pb = NSPasteboard::generalPasteboard();
            let cc = pb.changeCount();
            if cc == last {
                continue;
            }
            let first = last == -1;
            last = cc;
            // skip the pre-existing clipboard (fresh enable or thread start)
            if first {
                continue;
            }
            // skip password-manager / transient / auto-generated copies
            let mut concealed = false;
            if let Some(types) = pb.types() {
                let n = types.count();
                for i in 0..n {
                    let s = types.objectAtIndex(i).to_string();
                    if s == "org.nspasteboard.ConcealedType" || s == "org.nspasteboard.TransientType" || s == "org.nspasteboard.AutoGeneratedType" {
                        concealed = true;
                        break;
                    }
                }
            }
            if concealed {
                continue;
            }
            // Prefer text; fall back to image data (screenshots, "Copy Image", etc.)
            let string_type = unsafe { NSPasteboardTypeString };
            if let Some(text) = pb.stringForType(string_type) {
                let value = text.to_string();
                let trimmed = value.trim();
                if !trimmed.is_empty() {
                    let is_url = trimmed.starts_with("http://") || trimmed.starts_with("https://");
                    let _ = app.emit("clipboard:new", serde_json::json!({ "kind": "text", "value": value, "isUrl": is_url, "sourceApp": source_app }));
                    continue;
                }
            }
            if let Some(path) = capture_clipboard_image(&app, &pb) {
                let _ = app.emit("clipboard:new", serde_json::json!({ "kind": "image", "path": path, "sourceApp": source_app }));
            }
        }
    });
}

/// Pull image data off the pasteboard, transcode to PNG, and stash it in a fresh
/// temp subdir. Returns the file path the Clipboard lane references for
/// preview/paste/stage/drag. PNG preferred; a TIFF-only pasteboard is transcoded.
#[cfg(target_os = "macos")]
fn capture_clipboard_image(app: &tauri::AppHandle, pb: &objc2_app_kit::NSPasteboard) -> Option<String> {
    use objc2_app_kit::{NSBitmapImageFileType, NSBitmapImageRep, NSPasteboardTypePNG, NSPasteboardTypeTIFF};
    use objc2_foundation::NSDictionary;
    use tauri::Manager;

    let png_type = unsafe { NSPasteboardTypePNG };
    let png_bytes: Vec<u8> = if let Some(data) = pb.dataForType(png_type) {
        data.to_vec()
    } else {
        let tiff_type = unsafe { NSPasteboardTypeTIFF };
        let tiff = pb.dataForType(tiff_type)?;
        let rep = NSBitmapImageRep::imageRepWithData(&tiff)?;
        let props = NSDictionary::new();
        let png = unsafe { rep.representationUsingType_properties(NSBitmapImageFileType::PNG, &props) }?;
        png.to_vec()
    };
    if png_bytes.is_empty() {
        return None;
    }

    let stamp = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_nanos()).unwrap_or(0);
    let dir = app.path().temp_dir().ok()?.join("quickboard-clip").join(format!("{stamp:x}"));
    std::fs::create_dir_all(&dir).ok()?;
    let p = dir.join("clip.png");
    std::fs::write(&p, &png_bytes).ok()?;
    Some(p.to_string_lossy().to_string())
}

#[cfg(not(target_os = "macos"))]
pub fn start_clipboard_watch(_app: tauri::AppHandle) {}

/// Native multi-item drag — files AND text in a single NSDraggingSession, so each
/// drop target reads whichever representation it understands (Finder → files + a
/// text clipping, a text field → text, a rich editor → both). The drag plugin can
/// only carry one type per drag; this is the both-at-once path for mixed tray
/// selections. Modelled on the `drag` crate's macOS impl, with multiple items.
#[cfg(target_os = "macos")]
mod multi_drag {
    use objc2::rc::Retained;
    use objc2::runtime::{NSObject, NSObjectProtocol, ProtocolObject};
    use objc2::{define_class, msg_send, AnyThread, DefinedClass, MainThreadMarker, MainThreadOnly};
    use objc2_app_kit::{
        NSApplication, NSDraggingContext, NSDraggingItem, NSDraggingSession, NSDraggingSource, NSDragOperation, NSEvent, NSEventModifierFlags, NSEventType, NSImage,
        NSPasteboardItem, NSWindow,
    };
    use objc2_foundation::{NSMutableArray, NSPoint, NSRect, NSSize, NSString, NSURL};

    struct DragSourceIvars {
        app: tauri::AppHandle,
    }

    define_class!(
        #[unsafe(super(NSObject))]
        #[thread_kind = MainThreadOnly]
        #[name = "QuickboardDragSource"]
        #[ivars = DragSourceIvars]
        struct DragSource;

        unsafe impl NSObjectProtocol for DragSource {}

        unsafe impl NSDraggingSource for DragSource {
            #[unsafe(method(draggingSession:sourceOperationMaskForDraggingContext:))]
            unsafe fn operation_mask(&self, _session: &NSDraggingSession, _context: NSDraggingContext) -> NSDragOperation {
                NSDragOperation::Copy
            }

            #[unsafe(method(draggingSession:endedAtPoint:operation:))]
            unsafe fn ended(&self, _session: &NSDraggingSession, _point: NSPoint, _operation: NSDragOperation) {
                use tauri::Emitter;
                let _ = self.ivars().app.emit("drag:end", ());
            }
        }
    );

    impl DragSource {
        fn new(mtm: MainThreadMarker, app: tauri::AppHandle) -> Retained<Self> {
            let this = Self::alloc(mtm).set_ivars(DragSourceIvars { app });
            unsafe { msg_send![super(this), init] }
        }
    }

    pub fn start(window: &tauri::Window, files: Vec<String>, text: Option<String>, icon: String, origin: Option<[f64; 4]>, view_h: f64) -> Result<(), String> {
        use tauri::Manager;
        let mtm = MainThreadMarker::new().ok_or("not on the main thread")?;
        let ns_window_ptr = window.ns_window().map_err(|e| e.to_string())?;
        unsafe {
            let ns_window = &*(ns_window_ptr as *const NSWindow);
            let content_view = ns_window.contentView().ok_or("no content view")?;
            let pos: NSPoint = ns_window.mouseLocationOutsideOfEventStream();

            let img = NSImage::initByReferencingFile(NSImage::alloc(), &NSString::from_str(&icon)).ok_or("could not load drag image")?;
            let size: NSSize = img.size();
            // lift the preview off the source element's centre (content-view points,
            // Y-flipped from the webview's top-left CSS rect); else centre on the cursor
            let (cx, cy) = match origin {
                Some([ox, oy, ow, oh]) => (ox + ow / 2.0, view_h - (oy + oh / 2.0)),
                None => (pos.x, pos.y),
            };
            let rect = NSRect::new(NSPoint::new(cx - size.width / 2.0, cy - size.height / 2.0), size);

            let items = NSMutableArray::new();
            for path in &files {
                let url = NSURL::fileURLWithPath_isDirectory(&NSString::from_str(path), false);
                let di = NSDraggingItem::initWithPasteboardWriter(NSDraggingItem::alloc(), &ProtocolObject::from_retained(url));
                di.setDraggingFrame_contents(rect, Some(&*img));
                items.addObject(&*di);
            }
            if let Some(text) = text {
                let pb_item = NSPasteboardItem::new();
                let _ = pb_item.setString_forType(&NSString::from_str(&text), &NSString::from_str("public.utf8-plain-text"));
                let di = NSDraggingItem::initWithPasteboardWriter(NSDraggingItem::alloc(), &ProtocolObject::from_retained(pb_item));
                di.setDraggingFrame_contents(rect, Some(&*img));
                items.addObject(&*di);
            }

            let app = NSApplication::sharedApplication(mtm);
            let timestamp = app.currentEvent().map(|e| e.timestamp()).unwrap_or(0.0);
            let window_number = ns_window.windowNumber();
            let drag_event = NSEvent::mouseEventWithType_location_modifierFlags_timestamp_windowNumber_context_eventNumber_clickCount_pressure(
                NSEventType::LeftMouseDragged,
                pos,
                NSEventModifierFlags::empty(),
                timestamp,
                window_number,
                None,
                0,
                1,
                1.0,
            )
            .ok_or("could not synthesize drag event")?;

            let source = DragSource::new(mtm, window.app_handle().clone());
            let _ = content_view.beginDraggingSessionWithItems_event_source(&items, &drag_event, &ProtocolObject::<dyn NSDraggingSource>::from_retained(source));
        }
        Ok(())
    }
}

/// Start a native drag carrying both files and text together (mixed tray selections).
#[cfg(target_os = "macos")]
#[tauri::command]
pub async fn start_multi_drag(window: tauri::Window, files: Vec<String>, text: Option<String>, icon: String, origin: Option<[f64; 4]>, view_h: f64) -> Result<(), String> {
    let (tx, rx) = std::sync::mpsc::channel();
    let win = window.clone();
    window
        .run_on_main_thread(move || {
            let _ = tx.send(multi_drag::start(&win, files, text, icon, origin, view_h));
        })
        .map_err(|e| e.to_string())?;
    rx.recv().map_err(|e| e.to_string())?
}

#[cfg(not(target_os = "macos"))]
#[tauri::command]
pub async fn start_multi_drag(_files: Vec<String>, _text: Option<String>, _icon: String, _origin: Option<[f64; 4]>, _view_h: f64) -> Result<(), String> {
    Err("native drag is only supported on macOS".into())
}

/// Show the floating tray window (positioned top-right of the cursor's screen),
/// without activating the app.
#[tauri::command]
pub fn show_tray(app: tauri::AppHandle) -> Result<(), String> {
    use tauri::Manager;
    crate::summon::capture_frontmost();
    if let Some(win) = app.get_webview_window("tray") {
        let was_visible = win.is_visible().unwrap_or(false);
        let w = win.clone();
        let _ = app.run_on_main_thread(move || {
            use tauri::Emitter;
            crate::summon::position_tray(&w);
            let _ = w.show();
            crate::summon::order_front(&w);
            // replay the entrance only when it was actually hidden
            if !was_visible {
                let _ = w.emit("tray:open", ());
            }
        });
    }
    Ok(())
}

/// From the tray: bring the board window forward and ask it to open the "Save to
/// board" modal for the staged items, then hide the tray so the modal is unobscured.
/// (The tray is a separate webview, so the commit + board refresh must happen there.)
#[derive(Clone, serde::Serialize)]
struct CommitRequest {
    ids: Vec<String>,
    category: String,
}

#[tauri::command]
pub fn open_commit(app: tauri::AppHandle, ids: Vec<String>, category: String) -> Result<(), String> {
    use tauri::{Emitter, Manager};
    if let Some(win) = app.get_webview_window("main") {
        let _ = win.unminimize();
        let _ = win.show();
        let _ = win.set_focus();
        // carry the tray's selection (empty = all staged) + a category to pre-fill
        let _ = win.emit("board:commit-tray", CommitRequest { ids, category });
    }
    if let Some(tray) = app.get_webview_window("tray") {
        let _ = tray.hide();
    }
    Ok(())
}

#[tauri::command]
pub fn hide_tray(app: tauri::AppHandle) -> Result<(), String> {
    use tauri::Manager;
    if let Some(win) = app.get_webview_window("tray") {
        let _ = win.hide();
    }
    Ok(())
}

/// Put the value on the pasteboard, then paste it at the cursor. Browser clipboard
/// writes can fail from the non-key tray panel, so this path stays native.
#[tauri::command]
pub fn tray_paste(app: tauri::AppHandle, value: String) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        use objc2_app_kit::{NSPasteboard, NSPasteboardTypeString};
        use objc2_foundation::NSString;
        let pb = NSPasteboard::generalPasteboard();
        pb.clearContents();
        let string_type = unsafe { NSPasteboardTypeString };
        if !pb.setString_forType(&NSString::from_str(&value), string_type) {
            return Err("failed to write pasteboard".to_string());
        }
    }
    paste_at_cursor(&app)
}

/// Decode image bytes and write them to the general pasteboard as TIFF, on the main
/// thread (AppKit image work). Shared by the tray + summon image-paste commands.
#[cfg(target_os = "macos")]
fn put_image_on_pasteboard(app: &tauri::AppHandle, bytes: Vec<u8>) -> Result<(), String> {
    let (tx, rx) = std::sync::mpsc::channel();
    app.run_on_main_thread(move || {
        use objc2::AnyThread;
        use objc2_app_kit::{NSImage, NSPasteboard, NSPasteboardTypeTIFF};
        use objc2_foundation::NSData;
        let result = (|| {
            let data = NSData::from_vec(bytes);
            let image = NSImage::initWithData(NSImage::alloc(), &data).ok_or_else(|| "failed to decode image".to_string())?;
            let tiff = image.TIFFRepresentation().ok_or_else(|| "failed to encode image for pasteboard".to_string())?;
            let pb = NSPasteboard::generalPasteboard();
            pb.clearContents();
            let tiff_type = unsafe { NSPasteboardTypeTIFF };
            if !pb.setData_forType(Some(&tiff), tiff_type) {
                return Err("failed to write pasteboard".to_string());
            }
            Ok(())
        })();
        let _ = tx.send(result);
    })
    .map_err(|e| e.to_string())?;
    rx.recv().map_err(|e| e.to_string())?
}

/// Put a Clipboard-lane image (by temp-file path) on the pasteboard, then paste it
/// at the cursor — the image twin of `tray_paste`.
#[tauri::command]
pub fn tray_paste_image(app: tauri::AppHandle, path: String) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        use tauri::Manager;
        let bytes = std::fs::read(&path).map_err(|e| e.to_string())?;
        put_image_on_pasteboard(&app, bytes)?;
        if let Some(win) = app.get_webview_window("tray") {
            let _ = win.hide();
        }
    }
    #[cfg(not(target_os = "macos"))]
    {
        let _ = path;
        return Err("image paste is only supported on macOS".to_string());
    }
    paste_at_cursor(&app)
}

/// Summon-panel twin of `tray_paste_image`: write the image, then paste + dismiss.
#[tauri::command]
pub fn summon_paste_image_path(app: tauri::AppHandle, path: String) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        let bytes = std::fs::read(&path).map_err(|e| e.to_string())?;
        put_image_on_pasteboard(&app, bytes)?;
    }
    #[cfg(not(target_os = "macos"))]
    {
        let _ = path;
        return Err("image paste is only supported on macOS".to_string());
    }
    summon_paste(app)
}

/// Whether quickboard has macOS Accessibility permission — required for the
/// synthesized ⌘V (auto-paste). Without it ⌥Space still copies, but won't paste.
#[cfg(target_os = "macos")]
#[tauri::command]
pub fn accessibility_trusted() -> bool {
    #[link(name = "ApplicationServices", kind = "framework")]
    extern "C" {
        fn AXIsProcessTrusted() -> bool;
    }
    unsafe { AXIsProcessTrusted() }
}

#[cfg(not(target_os = "macos"))]
#[tauri::command]
pub fn accessibility_trusted() -> bool {
    true
}

/// Open System Settings → Privacy & Security → Accessibility.
#[tauri::command]
pub fn open_accessibility_settings() {
    #[cfg(target_os = "macos")]
    {
        let _ = std::process::Command::new("open")
            .arg("x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility")
            .spawn();
    }
}

/// Write a UTF-8 text file to a user-chosen path (backup export).
/// Path comes from the OS save dialog — same trust level as other path-taking commands.
#[tauri::command]
pub fn save_text_file(path: String, contents: String) -> Result<(), String> {
    std::fs::write(&path, contents).map_err(|e| e.to_string())
}

/// Read a UTF-8 text file from a user-chosen path (backup import).
#[tauri::command]
pub fn read_text_file(path: String) -> Result<String, String> {
    std::fs::read_to_string(&path).map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::HashSet;
    use std::time::Duration;

    // A private scratch dir under the OS temp dir — these tests exercise the pure
    // staged-file helpers, which take a root path (no AppHandle needed).
    fn scratch(tag: &str) -> std::path::PathBuf {
        let d = std::env::temp_dir().join(format!("qb-cmd-test-{tag}-{}", now_nanos()));
        std::fs::create_dir_all(&d).unwrap();
        d
    }

    #[test]
    fn save_and_read_text_file_round_trip() {
        let root = scratch("txtfile");
        let p = root.join("quickboard-backup.json");
        let path = p.to_string_lossy().to_string();
        let contents = "{\"version\":1,\"items\":[]}";
        save_text_file(path.clone(), contents.to_string()).unwrap();
        assert_eq!(read_text_file(path).unwrap(), contents);
        std::fs::remove_dir_all(&root).ok();
    }

    #[test]
    fn write_staged_backfills_extension_from_mime() {
        let root = scratch("ext");
        let p = write_staged(&root, 0x1a, "logo", ext_for_mime("image/png"), b"PNG").unwrap();
        assert!(p.ends_with("logo.png"), "got {p}");
        assert_eq!(std::fs::read(&p).unwrap(), b"PNG");
        std::fs::remove_dir_all(&root).ok();
    }

    #[test]
    fn write_staged_keeps_existing_extension_and_names_empty_image() {
        let root = scratch("keep");
        let p = write_staged(&root, 1, "pic.jpg", "png", b"x").unwrap();
        assert!(p.ends_with("pic.jpg"), "got {p}");
        let q = write_staged(&root, 2, "   ", "png", b"y").unwrap();
        assert!(q.ends_with("image.png"), "got {q}");
        std::fs::remove_dir_all(&root).ok();
    }

    #[test]
    fn existing_paths_keeps_only_files_that_exist() {
        let root = scratch("exist");
        let real = write_staged(&root, 3, "a.png", "", b"z").unwrap();
        let gone = root.join("nope").join("x.png").to_string_lossy().to_string();
        assert_eq!(existing_paths(vec![real.clone(), gone]), vec![real]);
        std::fs::remove_dir_all(&root).ok();
    }

    #[test]
    fn sweep_removes_orphans_but_keeps_referenced() {
        let root = scratch("sweep");
        let keep = write_staged(&root, 0xaa, "keep.png", "", b"1").unwrap();
        let orphan = write_staged(&root, 0xbb, "orphan.png", "", b"2").unwrap();
        let set: HashSet<String> = [keep.clone()].into_iter().collect();
        // grace 0: nothing counts as "young", so the orphan is eligible immediately.
        assert_eq!(sweep_dir(&root, &set, Duration::ZERO), 1);
        assert!(std::path::Path::new(&keep).exists());
        assert!(!std::path::Path::new(&orphan).exists());
        assert!(root.join("aa").exists()); // referenced entry's subdir stays
        assert!(!root.join("bb").exists()); // emptied subdir is pruned
        std::fs::remove_dir_all(&root).ok();
    }

    #[test]
    fn sweep_grace_spares_fresh_files() {
        let root = scratch("grace");
        let fresh = write_staged(&root, 0xcc, "fresh.png", "", b"3").unwrap();
        // a just-written file is too young to reclaim even when unreferenced.
        assert_eq!(sweep_dir(&root, &HashSet::new(), Duration::from_secs(3600)), 0);
        assert!(std::path::Path::new(&fresh).exists());
        std::fs::remove_dir_all(&root).ok();
    }

    // --- The Touch ID egress gate (the app's core security invariant) ---------
    //
    // `gate_confidential` is the seam every confidential-egress command routes
    // through. In production the authorizer is the interactive Touch ID round-trip;
    // here we inject stub futures to drive the decision table without a prompt. A
    // dropped guard in any of the four commands would leave one of these unproven.

    /// A non-confidential item must NEVER trigger the authorizer (no prompt on the
    /// board): the authorizer panics if awaited, so reaching it fails the test.
    #[test]
    fn gate_skips_authorizer_when_not_confidential() {
        let result = tauri::async_runtime::block_on(gate_confidential(false, async {
            panic!("authorizer must not run for a non-confidential item");
        }));
        assert_eq!(result, Ok(()));
    }

    /// A confidential item proceeds only when the authorizer succeeds.
    #[test]
    fn gate_proceeds_on_successful_auth() {
        let result = tauri::async_runtime::block_on(gate_confidential(true, async { Ok(()) }));
        assert_eq!(result, Ok(()));
    }

    /// A confidential item is REFUSED when the authorizer fails (cancel / no
    /// biometrics): the error propagates and no read of the body happens.
    #[test]
    fn gate_refuses_on_failed_auth() {
        let result =
            tauri::async_runtime::block_on(gate_confidential(true, async { Err("cancelled".to_string()) }));
        assert_eq!(result, Err("cancelled".to_string()));
    }

    /// A confidential item stored via the real Store reports `is_confidential == true`,
    /// so the commands' `gate_confidential(confidential, ..)` gate actually engages.
    /// Guards against a regression where the flag stops round-tripping and every
    /// item silently becomes non-confidential (which would bypass the prompt).
    #[test]
    fn confidential_flag_round_trips_through_store() {
        let store = crate::store::Store::open_in_memory(crate::crypto::new_key()).unwrap();
        let id = store
            .add_text("KTP number", "Identity", "Personal", true, "1234567890")
            .unwrap();
        assert_eq!(store.is_confidential(&id), Ok(true));

        let plain = store
            .add_text("Nickname", "Personal", "Personal", false, "hi")
            .unwrap();
        assert_eq!(store.is_confidential(&plain), Ok(false));
    }

    // Note: the quickboard-clip layout (root/<stamp:x>/clip.png) is the same shape
    // `write_staged` produces, so `sweep_removes_orphans_but_keeps_referenced` above
    // already proves `sweep_dir` handles it (reaps the orphan stamp subdir, keeps
    // the referenced one). The tests below cover the flat quickboard-drag layout.

    // A top-level file in a flat temp dir (the quickboard-drag layout).
    fn write_flat(root: &std::path::Path, name: &str, bytes: &[u8]) -> String {
        let p = root.join(name);
        std::fs::write(&p, bytes).unwrap();
        p.to_string_lossy().to_string()
    }

    #[test]
    fn sweep_flat_removes_orphans_but_keeps_referenced() {
        let root = scratch("flat-sweep");
        let keep = write_flat(&root, "keep.png", b"1");
        let orphan = write_flat(&root, "orphan.txt", b"2");
        let set: HashSet<String> = [keep.clone()].into_iter().collect();
        // grace 0: nothing counts as "young", so the orphan is eligible immediately.
        assert_eq!(sweep_flat_dir(&root, &set, Duration::ZERO), 1);
        assert!(std::path::Path::new(&keep).exists());
        assert!(!std::path::Path::new(&orphan).exists());
        std::fs::remove_dir_all(&root).ok();
    }

    #[test]
    fn sweep_flat_grace_spares_fresh_files() {
        let root = scratch("flat-grace");
        let fresh = write_flat(&root, "fresh.png", b"3");
        // a just-written file is too young to reclaim even when unreferenced.
        assert_eq!(sweep_flat_dir(&root, &HashSet::new(), Duration::from_secs(3600)), 0);
        assert!(std::path::Path::new(&fresh).exists());
        std::fs::remove_dir_all(&root).ok();
    }

    #[test]
    fn sweep_flat_skips_subdirs_and_missing_root() {
        let root = scratch("flat-skip");
        std::fs::create_dir_all(root.join("nested")).unwrap();
        let inner = write_flat(&root.join("nested"), "inner.png", b"4");
        // subdirectories (and their contents) are out of scope for the flat sweep.
        assert_eq!(sweep_flat_dir(&root, &HashSet::new(), Duration::ZERO), 0);
        assert!(std::path::Path::new(&inner).exists());
        // a root that doesn't exist yet is a no-op, not an error.
        assert_eq!(sweep_flat_dir(&root.join("nope"), &HashSet::new(), Duration::ZERO), 0);
        std::fs::remove_dir_all(&root).ok();
    }
}
