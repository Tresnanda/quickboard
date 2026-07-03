//! macOS panel + focus handling for the "summon anywhere" panel.
//!
//! The panel is turned into a non-activating `NSPanel` (the Spotlight/Raycast
//! technique): it can receive keyboard WITHOUT activating quickboard, so the app
//! the user was in keeps focus and the main window never surfaces. We still
//! remember the frontmost app and re-activate it before pasting as a safety net.

#[cfg(target_os = "macos")]
static PREV_PID: std::sync::Mutex<Option<i32>> = std::sync::Mutex::new(None);

/// Remember the frontmost application (call before showing the panel).
#[cfg(target_os = "macos")]
pub fn capture_frontmost() {
    use objc2_app_kit::NSWorkspace;
    let pid = NSWorkspace::sharedWorkspace().frontmostApplication().map(|app| app.processIdentifier());
    *PREV_PID.lock().unwrap() = pid;
}

/// The PID captured by [`capture_frontmost`], if any.
#[cfg(target_os = "macos")]
pub fn prev_pid() -> Option<i32> {
    *PREV_PID.lock().unwrap_or_else(|e| e.into_inner())
}

/// PID of the currently frontmost application.
#[cfg(target_os = "macos")]
pub fn frontmost_pid() -> Option<i32> {
    use objc2_app_kit::NSWorkspace;
    NSWorkspace::sharedWorkspace().frontmostApplication().map(|app| app.processIdentifier())
}

/// Re-activate the remembered app so ⌘V (and focus) land back where they were.
#[cfg(target_os = "macos")]
pub fn reactivate_prev() {
    use objc2_app_kit::{NSApplicationActivationOptions, NSRunningApplication};
    let pid = *PREV_PID.lock().unwrap();
    if let Some(pid) = pid {
        if let Some(app) = NSRunningApplication::runningApplicationWithProcessIdentifier(pid) {
            let _ = app.activateWithOptions(NSApplicationActivationOptions::ActivateAllWindows);
        }
    }
}

// A non-activating NSPanel subclass. A borderless panel won't accept keyboard
// unless it opts into key-window status — but as a non-activating panel it does so
// WITHOUT activating the owning app.
#[cfg(target_os = "macos")]
objc2::define_class!(
    #[unsafe(super(objc2_app_kit::NSPanel))]
    #[name = "QuickboardPanel"]
    struct QuickboardPanel;

    impl QuickboardPanel {
        #[unsafe(method(canBecomeKeyWindow))]
        fn can_become_key_window(&self) -> bool {
            true
        }
    }
);

/// Convert the summon window into a non-activating NSPanel.
#[cfg(target_os = "macos")]
pub fn make_panel(win: &tauri::WebviewWindow) {
    use objc2::ClassType;
    use objc2_app_kit::{NSPanel, NSWindowCollectionBehavior, NSWindowStyleMask};
    let Ok(ptr) = win.ns_window() else { return };
    unsafe {
        objc2::ffi::object_setClass(ptr as *mut objc2::runtime::AnyObject, QuickboardPanel::class() as *const objc2::runtime::AnyClass);
        let panel: &NSPanel = &*(ptr as *const NSPanel);
        panel.setStyleMask(NSWindowStyleMask::NonactivatingPanel | NSWindowStyleMask::FullSizeContentView);
        panel.setCollectionBehavior(NSWindowCollectionBehavior::CanJoinAllSpaces | NSWindowCollectionBehavior::FullScreenAuxiliary);
        // No native (rectangular) window shadow — the rounded card draws its own.
        panel.setHasShadow(false);
    }
}

/// Show the panel as the key window WITHOUT activating quickboard.
#[cfg(target_os = "macos")]
pub fn make_key(win: &tauri::WebviewWindow) {
    use objc2_app_kit::NSPanel;
    let Ok(ptr) = win.ns_window() else { return };
    unsafe {
        let panel: &NSPanel = &*(ptr as *const NSPanel);
        panel.orderFrontRegardless();
        panel.makeKeyWindow();
    }
}

/// Center the panel (upper third) on whichever screen the cursor is on. Done in
/// pure AppKit coordinates (mouse + screen frames share one system) so it's
/// reliable across monitors — Tauri's cursor_position was landing on the primary.
#[cfg(target_os = "macos")]
pub fn position_on_cursor_screen(win: &tauri::WebviewWindow) {
    use objc2::MainThreadMarker;
    use objc2_app_kit::{NSEvent, NSPanel, NSScreen};
    use objc2_foundation::NSPoint;
    let Ok(ptr) = win.ns_window() else { return };
    let Some(mtm) = MainThreadMarker::new() else { return };
    let panel: &NSPanel = unsafe { &*(ptr as *const NSPanel) };
    let mouse = NSEvent::mouseLocation();
    for s in NSScreen::screens(mtm).iter() {
        let f = s.frame();
        if mouse.x >= f.origin.x && mouse.x < f.origin.x + f.size.width && mouse.y >= f.origin.y && mouse.y < f.origin.y + f.size.height {
            let win_size = panel.frame().size;
            let x = f.origin.x + (f.size.width - win_size.width) / 2.0;
            let top_y = f.origin.y + f.size.height - (f.size.height - win_size.height) / 3.0;
            panel.setFrameTopLeftPoint(NSPoint::new(x, top_y));
            return;
        }
    }
}

/// Make a window a NON-activating floating panel (the tray). It becomes key ONLY
/// when a control actually needs typing (the lane-name field) via
/// `becomesKeyOnlyIfNeeded` — so clicking a row to paste never steals focus from
/// the app you're in (the ⌘V still lands there), but text fields can be typed into.
#[cfg(target_os = "macos")]
pub fn make_float_panel(win: &tauri::WebviewWindow) {
    use objc2::ClassType;
    use objc2_app_kit::{NSPanel, NSWindowCollectionBehavior, NSWindowStyleMask};
    let Ok(ptr) = win.ns_window() else { return };
    unsafe {
        // QuickboardPanel returns canBecomeKeyWindow = true; becomesKeyOnlyIfNeeded
        // keeps it from grabbing key on ordinary clicks, so paste behavior is intact.
        objc2::ffi::object_setClass(ptr as *mut objc2::runtime::AnyObject, QuickboardPanel::class() as *const objc2::runtime::AnyClass);
        let panel: &NSPanel = &*(ptr as *const NSPanel);
        panel.setStyleMask(NSWindowStyleMask::NonactivatingPanel | NSWindowStyleMask::FullSizeContentView);
        panel.setCollectionBehavior(NSWindowCollectionBehavior::CanJoinAllSpaces | NSWindowCollectionBehavior::FullScreenAuxiliary);
        panel.setBecomesKeyOnlyIfNeeded(true);
        panel.setHasShadow(false);
    }
}

/// Bring a panel to the front without activating the app.
#[cfg(target_os = "macos")]
pub fn order_front(win: &tauri::WebviewWindow) {
    use objc2_app_kit::NSPanel;
    let Ok(ptr) = win.ns_window() else { return };
    let panel: &NSPanel = unsafe { &*(ptr as *const NSPanel) };
    panel.orderFrontRegardless();
}

/// Park the tray in the top-right of whichever screen the cursor is on.
#[cfg(target_os = "macos")]
pub fn position_tray(win: &tauri::WebviewWindow) {
    use objc2::MainThreadMarker;
    use objc2_app_kit::{NSEvent, NSPanel, NSScreen};
    use objc2_foundation::NSPoint;
    let Ok(ptr) = win.ns_window() else { return };
    let Some(mtm) = MainThreadMarker::new() else { return };
    let panel: &NSPanel = unsafe { &*(ptr as *const NSPanel) };
    let mouse = NSEvent::mouseLocation();
    for s in NSScreen::screens(mtm).iter() {
        let f = s.frame();
        if mouse.x >= f.origin.x && mouse.x < f.origin.x + f.size.width && mouse.y >= f.origin.y && mouse.y < f.origin.y + f.size.height {
            let vf = s.visibleFrame();
            let size = panel.frame().size;
            let margin = 22.0;
            let x = vf.origin.x + vf.size.width - size.width - margin;
            let top_y = vf.origin.y + vf.size.height - margin;
            panel.setFrameTopLeftPoint(NSPoint::new(x, top_y));
            return;
        }
    }
}

/// Inset the macOS traffic lights so they sit roomily inside the sidebar card
/// instead of jammed against its top-left corner. `x`/`y` = inset from the top-left.
#[cfg(target_os = "macos")]
pub fn position_traffic_lights(win: &tauri::WebviewWindow, x: f64, y: f64) {
    use objc2_app_kit::{NSWindow, NSWindowButton};
    use objc2_foundation::NSRect;
    let Ok(ptr) = win.ns_window() else { return };
    unsafe {
        let nswin: &NSWindow = &*(ptr as *const NSWindow);
        let close = nswin.standardWindowButton(NSWindowButton::CloseButton);
        let mini = nswin.standardWindowButton(NSWindowButton::MiniaturizeButton);
        let zoom = nswin.standardWindowButton(NSWindowButton::ZoomButton);
        let (Some(close), Some(mini), Some(zoom)) = (close, mini, zoom) else { return };

        // grow the titlebar container so the buttons drop `y` down from the top
        if let Some(container) = close.superview().and_then(|s| s.superview()) {
            let button_h = close.frame().size.height;
            let bar_h = button_h + y;
            let win_h = nswin.frame().size.height;
            let mut r: NSRect = container.frame();
            r.size.height = bar_h;
            r.origin.y = win_h - bar_h;
            container.setFrame(r);
        }

        let spacing = mini.frame().origin.x - close.frame().origin.x;
        let buttons = [close, mini, zoom];
        for (i, button) in buttons.iter().enumerate() {
            let mut origin = button.frame().origin;
            origin.x = x + (i as f64) * spacing;
            button.setFrameOrigin(origin);
        }
    }
}

#[cfg(not(target_os = "macos"))]
pub fn make_float_panel(_win: &tauri::WebviewWindow) {}
#[cfg(not(target_os = "macos"))]
pub fn order_front(_win: &tauri::WebviewWindow) {}
#[cfg(not(target_os = "macos"))]
pub fn position_tray(_win: &tauri::WebviewWindow) {}
#[cfg(not(target_os = "macos"))]
pub fn position_traffic_lights(_win: &tauri::WebviewWindow, _x: f64, _y: f64) {}

#[cfg(not(target_os = "macos"))]
pub fn capture_frontmost() {}
#[cfg(not(target_os = "macos"))]
pub fn prev_pid() -> Option<i32> { None }
#[cfg(not(target_os = "macos"))]
pub fn frontmost_pid() -> Option<i32> { None }
#[cfg(not(target_os = "macos"))]
pub fn reactivate_prev() {}
#[cfg(not(target_os = "macos"))]
pub fn make_panel(_win: &tauri::WebviewWindow) {}
#[cfg(not(target_os = "macos"))]
pub fn make_key(_win: &tauri::WebviewWindow) {}
#[cfg(not(target_os = "macos"))]
pub fn position_on_cursor_screen(_win: &tauri::WebviewWindow) {}
