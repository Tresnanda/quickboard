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
    environment: String,
    confidential: bool,
    value: String,
) -> Result<String, String> {
    store.lock().unwrap().add_text(&label, &category, &environment, confidential, &value)
}

#[tauri::command]
pub fn list_environments(store: State<Mutex<Store>>) -> Result<Vec<String>, String> {
    store.lock().unwrap().list_environments()
}

#[tauri::command]
pub fn set_environment(store: State<Mutex<Store>>, id: String, environment: String) -> Result<(), String> {
    store.lock().unwrap().set_environment(&id, &environment)
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
    store.lock().unwrap().update_item(&id, &label, &category, &environment, confidential, value.as_deref())
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
                     environment: String, confidential: bool, src_path: String) -> Result<String, String> {
    let bytes = std::fs::read(&src_path).map_err(|e| e.to_string())?;
    let filename = std::path::Path::new(&src_path).file_name()
        .and_then(|s| s.to_str()).unwrap_or("file").to_string();
    let mime = mime_guess_from_name(&filename);
    store.lock().unwrap().add_file(&label, &category, &environment, confidential, &filename, &mime, &bytes)
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
    store.lock().unwrap().rename_category(&old, &new, environment.as_deref())
}

#[tauri::command]
pub fn delete_category(store: State<Mutex<Store>>, category: String, environment: Option<String>) -> Result<(), String> {
    store.lock().unwrap().delete_category(&category, environment.as_deref())
}

#[tauri::command]
pub fn rename_environment(store: State<Mutex<Store>>, old: String, new: String) -> Result<(), String> {
    store.lock().unwrap().rename_environment(&old, &new)
}

#[tauri::command]
pub fn delete_environment(store: State<Mutex<Store>>, environment: String, reassign_to: String) -> Result<(), String> {
    store.lock().unwrap().delete_environment(&environment, &reassign_to)
}

/// Return a file's bytes as a `data:` URL for in-app display (image covers).
/// Confidential files still gate on Touch ID before any bytes leave the vault;
/// the UI only requests covers for non-confidential images, so the prompt is
/// effectively never hit on the board.
#[tauri::command]
pub async fn get_image_data_url(store: State<'_, Mutex<Store>>, id: String) -> Result<String, String> {
    use base64::Engine as _;
    let confidential = { store.lock().unwrap().is_confidential(&id)? };
    if confidential {
        require_biometric().await?;
    }
    let (_filename, mime, bytes) = { store.lock().unwrap().read_file(&id)? };
    let b64 = base64::engine::general_purpose::STANDARD.encode(&bytes);
    Ok(format!("data:{mime};base64,{b64}"))
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

/// Phase 1 "Summon anywhere": dismiss the panel and paste the value (already on the
/// clipboard) at the user's cursor in whatever app they were in. Auto-paste needs
/// macOS Accessibility permission; the value is on the clipboard regardless, so ⌘V
/// works as a fallback if the key-synthesis is blocked.
#[tauri::command]
pub fn summon_paste(app: tauri::AppHandle) -> Result<(), String> {
    use tauri::Manager;
    if let Some(win) = app.get_webview_window("summon") {
        let _ = win.hide();
    }
    // Re-activate the app the user was in (and its text field) so the paste lands there.
    crate::summon::reactivate_prev();
    std::thread::sleep(std::time::Duration::from_millis(140));
    {
        use enigo::{Direction, Enigo, Key, Keyboard, Settings};
        let mut enigo = Enigo::new(&Settings::default()).map_err(|e| e.to_string())?;
        enigo.key(Key::Meta, Direction::Press).map_err(|e| e.to_string())?;
        enigo.key(Key::Unicode('v'), Direction::Click).map_err(|e| e.to_string())?;
        enigo.key(Key::Meta, Direction::Release).map_err(|e| e.to_string())?;
    }
    Ok(())
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

/// Write a blob dropped into the webview to a temp file so it can be staged on the
/// tray like any other file. A browser image drag carries bytes (a `data:` URL),
/// not a path — and with native drag-drop disabled on the tray, Finder files arrive
/// as bytes too. Each blob gets its own temp subdir so the basename stays clean (it
/// drives the stored filename + mime when the entry is committed to the board).
#[tauri::command]
pub fn stage_blob_file(app: tauri::AppHandle, data_url: String, name: String) -> Result<String, String> {
    use base64::Engine as _;
    use tauri::Manager;
    let comma = data_url.find(',').ok_or_else(|| "bad data url".to_string())?;
    let header = &data_url[..comma];
    let bytes = base64::engine::general_purpose::STANDARD
        .decode(data_url[comma + 1..].as_bytes())
        .map_err(|e| e.to_string())?;

    // sanitize the supplied name; if it carries no extension, derive one from the mime
    let mime = header.strip_prefix("data:").and_then(|h| h.split(';').next()).unwrap_or("");
    let ext = match mime {
        "image/png" => "png",
        "image/jpeg" => "jpg",
        "image/gif" => "gif",
        "image/webp" => "webp",
        "image/svg+xml" => "svg",
        "image/heic" => "heic",
        "image/bmp" => "bmp",
        "image/tiff" => "tiff",
        _ => "",
    };
    let safe: String = name
        .chars()
        .map(|c| if c.is_alphanumeric() || c == '.' || c == ' ' || c == '-' || c == '_' { c } else { '_' })
        .collect();
    let trimmed = safe.trim();
    let mut fname: String = if trimmed.is_empty() { "image".to_string() } else { trimmed.chars().take(60).collect() };
    if !fname.contains('.') && !ext.is_empty() {
        fname = format!("{fname}.{ext}");
    }

    // a unique subdir keeps the basename clean while avoiding collisions across drops
    let stamp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_nanos())
        .unwrap_or(0);
    let dir = app
        .path()
        .temp_dir()
        .map_err(|e| e.to_string())?
        .join("quickboard-staged")
        .join(format!("{stamp:x}"));
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let p = dir.join(&fname);
    std::fs::write(&p, &bytes).map_err(|e| e.to_string())?;
    Ok(p.to_string_lossy().to_string())
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
/// { value, isUrl } for each fresh copy while enabled — skipping password-manager
/// / transient copies and whatever was already on the clipboard at launch.
#[cfg(target_os = "macos")]
pub fn start_clipboard_watch(app: tauri::AppHandle) {
    use objc2_app_kit::{NSPasteboard, NSPasteboardTypeString};
    use std::sync::atomic::Ordering;
    use tauri::Emitter;
    std::thread::spawn(move || {
        let mut last: isize = -1;
        loop {
            std::thread::sleep(std::time::Duration::from_millis(600));
            let pb = NSPasteboard::generalPasteboard();
            let cc = pb.changeCount();
            if cc == last {
                continue;
            }
            let first = last == -1;
            last = cc;
            // skip the pre-existing clipboard, and don't read anything when disabled
            if first || !CLIP_WATCH.load(Ordering::Relaxed) {
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
            let string_type = unsafe { NSPasteboardTypeString };
            if let Some(text) = pb.stringForType(string_type) {
                let value = text.to_string();
                let trimmed = value.trim();
                if trimmed.is_empty() {
                    continue;
                }
                let is_url = trimmed.starts_with("http://") || trimmed.starts_with("https://");
                let _ = app.emit("clipboard:new", serde_json::json!({ "value": value, "isUrl": is_url }));
            }
        }
    });
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

/// Paste the (already-copied) value at the cursor. The tray is a non-key panel, so
/// the app the user is in keeps focus — no hide, no re-activate, just ⌘V.
#[tauri::command]
pub fn tray_paste() -> Result<(), String> {
    std::thread::sleep(std::time::Duration::from_millis(50));
    use enigo::{Direction, Enigo, Key, Keyboard, Settings};
    let mut enigo = Enigo::new(&Settings::default()).map_err(|e| e.to_string())?;
    enigo.key(Key::Meta, Direction::Press).map_err(|e| e.to_string())?;
    enigo.key(Key::Unicode('v'), Direction::Click).map_err(|e| e.to_string())?;
    enigo.key(Key::Meta, Direction::Release).map_err(|e| e.to_string())?;
    Ok(())
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
