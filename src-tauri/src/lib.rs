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

// Phase 1 "Summon anywhere": macOS focus capture/restore for the panel.
pub mod summon;

use std::sync::atomic::{AtomicBool, Ordering};

/// Set by the tray's "Quit" before `app.exit(0)` so a real quit is let through.
/// Everything else that requests app exit — Cmd+Q, last window closed — means
/// "go to the menu bar," not "die." We can't trust `ExitRequested`'s `code` to
/// tell them apart reliably across macOS/Tauri versions, so we gate on this
/// explicit intent instead.
static WANTS_QUIT: AtomicBool = AtomicBool::new(false);

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        // Launch-at-login so the global summon works without opening the app first.
        // The login item launches with `--hidden` → no main window pops up at login.
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            Some(vec!["--hidden"]),
        ))
        // Drag plugin: used by the real app for file drag-out from items.
        .plugin(tauri_plugin_drag::init())
        // Plan 2, Task 6: native file picker for the Add-item dialog.
        .plugin(tauri_plugin_dialog::init())
        // In-app auto-update: checks GitHub Releases and self-installs. `process`
        // backs the JS relaunch() after an update is applied.
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        // Phase 1 "Summon anywhere": a global hotkey toggles the quick-find panel.
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_handler(|app, shortcut, event| {
                    use tauri_plugin_global_shortcut::{Code, Modifiers, ShortcutState};
                    if event.state() != ShortcutState::Pressed {
                        return;
                    }
                    if shortcut.matches(Modifiers::ALT | Modifiers::SHIFT, Code::Space) {
                        toggle_tray(app);
                    } else if shortcut.matches(Modifiers::ALT, Code::Space) {
                        toggle_summon(app);
                    }
                })
                .build(),
        )
        .setup(|app| {
            use tauri::Manager;
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

            // Global hotkey: ⌥Space summons the quick-find panel over any app.
            #[cfg(desktop)]
            {
                use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, Modifiers, Shortcut};
                let summon = Shortcut::new(Some(Modifiers::ALT), Code::Space);
                let _ = app.global_shortcut().register(summon);
                let tray = Shortcut::new(Some(Modifiers::ALT | Modifiers::SHIFT), Code::Space);
                let _ = app.global_shortcut().register(tray);
            }

            // Turn the panel into a non-activating NSPanel (floats over all spaces /
            // fullscreen, receives keyboard without activating the app).
            if let Some(summon) = app.get_webview_window("summon") {
                crate::summon::make_panel(&summon);
            }
            // The floating tray is a non-KEY panel so clicking it never steals focus.
            if let Some(tray) = app.get_webview_window("tray") {
                crate::summon::make_float_panel(&tray);
            }

            // Background clipboard-history watcher (idle until the opt-in setting turns it on).
            crate::commands::start_clipboard_watch(app.handle().clone());

            // Inset the traffic lights so they sit roomily in the sidebar card, and
            // keep them there across resizes (macOS re-lays them out otherwise).
            if let Some(main) = app.get_webview_window("main") {
                crate::summon::position_traffic_lights(&main, 18.0, 18.0);
                let mw = main.clone();
                main.on_window_event(move |event| {
                    if matches!(event, tauri::WindowEvent::Resized(_)) {
                        crate::summon::position_traffic_lights(&mw, 18.0, 18.0);
                    }
                });
            }

            // Menu-bar tray — quickboard lives here as a background utility.
            {
                use tauri::menu::{Menu, MenuItem, PredefinedMenuItem};
                use tauri::tray::TrayIconBuilder;
                let open_i = MenuItem::with_id(app, "tray_open", "Open quickboard", true, None::<&str>)?;
                let summon_i = MenuItem::with_id(app, "tray_summon", "Summon  (⌥Space)", true, None::<&str>)?;
                let shelf_i = MenuItem::with_id(app, "tray_shelf", "Show tray  (⌥⇧Space)", true, None::<&str>)?;
                let quit_i = MenuItem::with_id(app, "tray_quit", "Quit quickboard", true, None::<&str>)?;
                let menu = Menu::with_items(app, &[&open_i, &summon_i, &shelf_i, &PredefinedMenuItem::separator(app)?, &quit_i])?;
                let mut tray = TrayIconBuilder::with_id("main")
                    .tooltip("quickboard")
                    .menu(&menu)
                    .on_menu_event(|app, event| match event.id.as_ref() {
                        "tray_open" => {
                            // Reopening from the menu bar brings the dock icon back.
                            #[cfg(target_os = "macos")]
                            let _ = app.set_dock_visibility(true);
                            if let Some(main) = app.get_webview_window("main") {
                                let _ = main.show();
                                let _ = main.set_focus();
                            }
                        }
                        "tray_summon" => toggle_summon(app),
                        "tray_shelf" => {
                            let _ = commands::show_tray(app.clone());
                        }
                        "tray_quit" => {
                            WANTS_QUIT.store(true, Ordering::SeqCst);
                            app.exit(0);
                        }
                        _ => {}
                    });
                if let Some(icon) = app.default_window_icon() {
                    tray = tray.icon(icon.clone());
                }
                let _tray = tray.build(app)?;
            }

            // App menu. macOS routes Cmd+Q through the menu's Quit item, which
            // terminates WITHOUT firing RunEvent::ExitRequested — so prevent_exit()
            // never runs. Own the menu instead: a custom Quit that HIDES to the menu
            // bar (⌥Space + tray stay alive), plus the standard Edit items so
            // Cmd+C/V/X/A keep working in text fields. A real quit is the tray's "Quit".
            {
                use tauri::menu::{Menu, MenuItem, PredefinedMenuItem, Submenu};
                let quit_hide = MenuItem::with_id(app, "app_quit_hide", "Quit quickboard", true, Some("CmdOrCtrl+Q"))?;
                let app_menu = Submenu::with_items(
                    app,
                    "quickboard",
                    true,
                    &[
                        &PredefinedMenuItem::hide(app, None)?,
                        &PredefinedMenuItem::hide_others(app, None)?,
                        &PredefinedMenuItem::show_all(app, None)?,
                        &PredefinedMenuItem::separator(app)?,
                        &quit_hide,
                    ],
                )?;
                let edit_menu = Submenu::with_items(
                    app,
                    "Edit",
                    true,
                    &[
                        &PredefinedMenuItem::undo(app, None)?,
                        &PredefinedMenuItem::redo(app, None)?,
                        &PredefinedMenuItem::separator(app)?,
                        &PredefinedMenuItem::cut(app, None)?,
                        &PredefinedMenuItem::copy(app, None)?,
                        &PredefinedMenuItem::paste(app, None)?,
                        &PredefinedMenuItem::select_all(app, None)?,
                    ],
                )?;
                let window_menu = Submenu::with_items(
                    app,
                    "Window",
                    true,
                    &[&PredefinedMenuItem::minimize(app, None)?, &PredefinedMenuItem::close_window(app, None)?],
                )?;
                app.set_menu(Menu::with_items(app, &[&app_menu, &edit_menu, &window_menu])?)?;
                app.on_menu_event(|app, event| {
                    if event.id() == "app_quit_hide" {
                        use tauri::Manager;
                        if let Some(main) = app.get_webview_window("main") {
                            let _ = main.hide();
                        }
                        #[cfg(target_os = "macos")]
                        let _ = app.set_dock_visibility(false);
                    }
                });
            }

            // Background-app behavior: the main window starts hidden (config) so a
            // login launch is silent. Show it on a normal launch; closing it just
            // hides it (the app keeps running so the summon stays available).
            if let Some(main) = app.get_webview_window("main") {
                let hidden_launch = std::env::args().any(|a| a == "--hidden");
                let m = main.clone();
                main.on_window_event(move |e| {
                    if let tauri::WindowEvent::CloseRequested { api, .. } = e {
                        api.prevent_close();
                        let _ = m.hide();
                    }
                });
                if !hidden_launch {
                    let _ = main.show();
                    let _ = main.set_focus();
                } else {
                    // Silent login launch: no window is shown, so live in the menu bar
                    // only (no dock icon) until the user opens quickboard.
                    #[cfg(target_os = "macos")]
                    let _ = app.handle().set_dock_visibility(false);
                }
            }
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
            commands::clip_history_save,
            commands::clip_history_load,
            commands::add_file_item,
            commands::file_to_temp,
            commands::get_image_data_url,
            commands::list_environments,
            commands::set_environment,
            commands::update_item,
            commands::read_image_as_data_url,
            commands::rename_category,
            commands::delete_category,
            commands::rename_environment,
            commands::delete_environment,
            commands::summon_paste,
            commands::summon_paste_image,
            commands::summon_hide,
            commands::set_autostart,
            commands::get_autostart,
            commands::write_drag_icon,
            commands::stage_text_file,
            commands::stage_blob_file,
            commands::persist_staged_file,
            commands::existing_paths,
            commands::sweep_staged_files,
            commands::start_multi_drag,
            commands::set_clipboard_watch,
            commands::show_tray,
            commands::open_commit,
            commands::hide_tray,
            commands::tray_paste,
            commands::tray_paste_image,
            commands::summon_paste_image_path,
            commands::accessibility_trusted,
            commands::open_accessibility_settings,
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app, event| {
            use tauri::Manager;
            match event {
                // Clicking the dock icon (with the main window hidden) re-opens it.
                tauri::RunEvent::Reopen { .. } => {
                    #[cfg(target_os = "macos")]
                    let _ = app.set_dock_visibility(true);
                    if let Some(main) = app.get_webview_window("main") {
                        let _ = main.show();
                        let _ = main.set_focus();
                    }
                }
                // Background menu-bar utility: Cmd+Q (and last-window-closed) request an
                // app exit, but we keep the process alive — just hide the main window —
                // so the ⌥Space summon and the tray stay available. Only the tray's
                // "Quit quickboard" (which sets WANTS_QUIT) is a real quit; everything
                // else is prevented.
                // Defensive: the tray's "Quit" sets WANTS_QUIT before app.exit(0) (a
                // real quit, let through). Anything else that reaches an app-level exit
                // request — e.g. the last window closing — is kept alive. (Cmd+Q no
                // longer lands here; the app menu hides instead — see setup.)
                tauri::RunEvent::ExitRequested { api, .. } => {
                    if !WANTS_QUIT.load(Ordering::SeqCst) {
                        api.prevent_exit();
                        if let Some(main) = app.get_webview_window("main") {
                            let _ = main.hide();
                        }
                        #[cfg(target_os = "macos")]
                        let _ = app.set_dock_visibility(false);
                    }
                }
                _ => {}
            }
        });
}

/// Show/hide the floating tray (shelf) window.
fn toggle_tray(app: &tauri::AppHandle) {
    use tauri::Manager;
    if let Some(win) = app.get_webview_window("tray") {
        if win.is_visible().unwrap_or(false) {
            // ask the webview to animate out; it hides the window when done
            use tauri::Emitter;
            let _ = win.emit("tray:close", ());
        } else {
            let _ = commands::show_tray(app.clone());
        }
    }
}

/// Show/hide the always-available quick-find panel window.
fn toggle_summon(app: &tauri::AppHandle) {
    use tauri::Manager;
    if let Some(win) = app.get_webview_window("summon") {
        if win.is_visible().unwrap_or(false) {
            let _ = win.hide();
        } else {
            // Remember the app the user is in (safety net for the paste).
            crate::summon::capture_frontmost();
            // AppKit must be touched on the main thread: position on the cursor's
            // screen, show as a key panel WITHOUT activating the app, then reset.
            let w = win.clone();
            let _ = app.run_on_main_thread(move || {
                use tauri::{Emitter, Manager};
                crate::summon::position_on_cursor_screen(&w);
                let _ = w.show();
                crate::summon::make_key(&w);
                // global emit so the onboarding (main window) can react to the summon too
                let _ = w.app_handle().emit("summon:open", ());
            });
        }
    }
}
