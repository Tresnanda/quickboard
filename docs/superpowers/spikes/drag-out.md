# SPIKE: Drag a file OUT of the Tauri window into native drop targets

**Goal:** Prove that a file can be dragged out of the QuickBoard Tauri v2 window
into native OS drop targets (Finder, a browser file-upload field, Mail/Slack
compose). This is the highest-risk capability in the project — if it can't work,
we stop and reconsider the stack.

**Status:** code wired, builds pass. Awaiting physical human drag test.

---

## What was wired

- **JS plugin:** `@crabnebula/tauri-plugin-drag@2.1.0` (exact pin).
  - API used: `startDrag({ item: [absolutePath], icon: absoluteIconPath }, onEvent)`.
- **Rust crate:** `tauri-plugin-drag = "=2.1.1"` (exact pin), registered in
  `src-tauri/src/lib.rs` via `.plugin(tauri_plugin_drag::init())`.
- **Permission:** `drag:default` added to `src-tauri/capabilities/default.json`
  (this default set enables the `start_drag` command — identifier
  `drag:allow-start-drag`). Without it the IPC call is denied at runtime.
- **File + icon to drag:** a `spike_drag_paths` Tauri command embeds
  `src-tauri/sample-drag.txt` and `src-tauri/icons/128x128.png` at compile time
  (`include_bytes!`), writes them to `<temp>/quickboard-spike/` on demand, and
  returns their absolute paths to the frontend. This avoids any dependence on
  bundled-resource packaging, so the paths are valid under `tauri dev`.
  (`sample-drag.txt` is also declared in `tauri.conf.json` `bundle.resources`
  for completeness, but the embed path is what the spike actually uses.)
- **UI:** `src/App.tsx` is replaced with a minimal spike: a `draggable` box
  labeled "Drag me out →" whose `onDragStart` calls `startDrag(...)`. Marked
  `// SPIKE: throwaway drag-out test, removed in Plan 2`.

---

## Manual test steps (HUMAN — requires a GUI)

1. From the repo root, start the dev app:

   ```bash
   source "$HOME/.cargo/env" && pnpm tauri dev
   ```

2. The window shows "QuickBoard drag-out SPIKE" and a dashed box "Drag me out →".
   Confirm the `file` and `icon` paths under the box resolved (not "(resolving…)").

3. **Test (a) — Finder:** Drag the "Drag me out →" box and drop it onto an open
   Finder window or the Desktop. Expect a `sample-drag.txt` file to appear there.
   Open it; it should contain the spike sample text.

4. **Test (b) — Browser upload field:** Open any page with a file `<input>`
   (e.g. https://www.google.com/ via image search "drag an image here", or a
   Gmail attach dialog, or https://tmpfiles.org/). Drag the box onto the
   upload drop zone. Expect the file to be accepted as `sample-drag.txt`.

5. **Test (c) — Mail / Slack compose:** Open Mail.app (or Slack) and start a new
   message. Drag the box into the compose body / attachment area. Expect
   `sample-drag.txt` to attach.

6. Watch the in-window `status` line — the plugin reports `Dropped` or
   `Cancelled` via the drag callback after each attempt.

RESULT: ✅ VERIFIED — drag-out works into Finder, Gmail upload field, and Slack. Does NOT work into WhatsApp Desktop (known finicky drop target; non-blocking edge case).

---

## Supply-chain note

- `@crabnebula/tauri-plugin-drag@2.1.0` is published by the **CrabNebula** org
  (the company behind several Tauri tools). The matching Rust crate
  `tauri-plugin-drag@2.1.1` is from the same source.
- Before this plugin becomes load-bearing (i.e. ships in a real release rather
  than a throwaway spike), **run a socket.dev review**:
  `socket.dev/npm/package/@crabnebula/tauri-plugin-drag` and audit the Rust
  crate as well. Confirm no postinstall scripts and verify registry signatures
  (`pnpm audit signatures`, `cargo`/crates.io provenance).
- Repo guards remain intact: `.npmrc` keeps `save-exact=true` +
  `ignore-scripts=true`; both the JS and Rust deps are exact-pinned (no `^`).

---

## Verdict

If all three native targets accept the dropped file, the drag-out capability is
**proven** and the stack stands. If a target fails (esp. browser upload, which
is the strictest), record exactly which one and the error/status so we can
decide whether to adjust the approach before Plan 2.
