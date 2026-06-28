# Image clipboard capture for the tray

**Date:** 2026-06-28
**Status:** Approved, pending implementation plan

## Goal

Extend the **Clipboard lane** (the tray's rolling copy-history) to capture
*copied images*, not just text. Captured image clips reach full parity with text
clips: paste-at-cursor, Save-to-board, Stage-in-Shelf, and drag-out. Gated by the
existing `clipboardHistory` opt-in setting — no new setting, no new UI surface.

This completes a feature the codebase already half-scaffolds: `ClipEntry` already
declares `kind: "image"` and `thumb`, and `ClipRow` already renders an image
thumbnail. Today the watcher only reads the pasteboard's string type, `pasteClip`
explicitly bails on images (`// image paste lands with the capture step`), and
there is nowhere to store the full image bytes.

## Background — the two systems

- **Clipboard lane** (`src/lib/clipboard.ts`, `ClipEntry`): a rolling, capped
  (100) history of what the user copies. Captured by the background Rust poller
  `start_clipboard_watch`, which emits `clipboard:new`. Mirrored into a shared
  localStorage store by `AppShell.tsx`. Gated behind `settings.clipboardHistory`.
- **Shelf/Tray** (`src/lib/tray.ts`, `TrayEntry`): curated staging. Already
  handles `kind: "file"` entries (a `path` + `mime`) end-to-end: render with image
  preview, drag-out, and commit-to-board via `addFile`.

The key leverage: **an image clip that owns a temp-file path can become a
`kind:"file"` tray entry**, which reuses the entire existing file → stage → commit
→ drag pipeline for free.

## Storage model

Full-resolution image bytes are too large for the localStorage-backed rolling
buffer, so they live on disk:

- Full image → a temp file at `…/quickboard-clip/<stamp>/clip.png`.
- Only a small `thumb` (downscaled data-url, ~88px longest side) goes in
  localStorage for the lane preview.

`ClipEntry` (in `clipboard.ts`) gains two fields:

```ts
path?: string;  // kind "image" — temp file holding the full-res bytes
mime?: string;  // kind "image" — e.g. "image/png"
```

`value` stays text-only; `thumb` stays the small preview data-url.

## Capture — Rust (`start_clipboard_watch`)

After the existing concealed/transient-type guard, branch on what the pasteboard
holds:

1. **Usable string present** → emit the text payload exactly as today.
2. **Else image data present** (`NSPasteboardTypePNG` or `NSPasteboardTypeTIFF`):
   - Obtain PNG bytes (PNG type directly, or TIFF → `NSBitmapImageRep` → PNG).
   - Write to `…/quickboard-clip/<stamp>/clip.png`.
   - Emit `clipboard:new { kind: "image", path, sourceApp }`.

The emitted payload gains a `kind` field; absent/`"text"` keeps back-compat with
the existing text emit shape `{ value, isUrl, sourceApp }`.

**Scope of capture:** only genuine image *data* on the pasteboard is captured —
screenshots, browser/Preview "Copy Image", etc. Finder file-copies (which put a
file URL and no image data) do not match. This mirrors how text capture works and
is the intended scope.

## Mirror + thumbnail — frontend (`AppShell.tsx`)

The `clipboard:new` listener gains an image branch:

- On `kind === "image"`: `readImageAsDataUrl(path)` (existing IPC) → draw into an
  offscreen canvas → downscale to ~88px longest side → export a `thumb` data-url →
  `addClip({ kind:"image", path, thumb, mime, label:"Image", sourceApp })`.

## Self-paste suppression

Pasting an image re-writes the pasteboard, which the watcher would otherwise
re-capture — a feedback loop. Text already solves this with a value-keyed
suppress map (`suppressClipboardCapture` / `shouldSuppressClipboardCapture`).
Images have no stable text key, so add a timestamp-based pair in `clipboard.ts`:

```ts
suppressImageCapture(): void          // stamp "ignore the next image copy"
shouldSuppressImageCapture(): boolean  // true within a 5s TTL, then clears
```

Call `suppressImageCapture()` immediately before any Quickboard-originated image
write (paste / stage / save). The `AppShell` image branch checks
`shouldSuppressImageCapture()` and skips the add when set.

## Paste-back — Rust

One shared native helper performs: read file bytes → decode `NSImage` → write
TIFF to the general pasteboard → `paste_at_cursor`. It mirrors the existing
`summon_paste_image` (which is store-id based) but takes a path. Exposed as two
thin commands matching the existing tray/summon split:

- `tray_paste_image(app, path)` — hides the `tray` window, then paste.
- `summon_paste_image_path(app, path)` — hides the `summon` window, then paste.

The existing store-id `summon_paste_image` stays for board image items.
Both new commands are registered in `lib.rs`.

## Parity actions — frontend (reuses the file pipeline)

- **Paste** — `TrayDock.pasteClip` image branch: `suppressImageCapture()` then
  `invoke("tray_paste_image", { path: clip.path })`. Remove the early
  `clip.kind === "image"` bail.
- **Stage in Shelf** — `addToTray({ kind:"file", path: clip.path, mime: clip.mime,
  label: clip.label })`. Renders as a tray image; drag-out + commit already work.
- **Save to board** — same as Stage but with `transient:true`, then `open_commit`.
  `CommitSheet`/`addFile` already commit image file entries.
- **Drag-out** from the clip row — enable `draggable` for images and, on
  `onDragStart`, `dragPathOut(clip.path, true)`. Currently `canDrag` is
  text-only.
- **Action buttons** in `ClipRow` (paste/save/stage) — currently gated to
  `kind === "text"`; show them for images too.
- **Summon panel** — `SummonPanel.pasteClip` gets the same image branch
  (`suppressImageCapture()` + `summon_paste_image_path`) so image clips don't
  break when surfaced in panel search results.

`addClip` dedup is extended so a repeated image copy (same `thumb`) doesn't
double-insert at the head.

## Lifecycle

Clip temp files are **not** garbage-collected on eviction or removal — consistent
with the existing `quickboard-drag` and `quickboard-staged` temp dirs, which also
rely on OS temp-dir cleanup. A staged file entry shares the clip's temp path; both
are temp-area files the commit reads on demand.

Across an app restart the `thumb` persists (localStorage), so the lane still shows
the image. Paste-back is best-effort: if the OS purged the temp file, the paste
command silently no-ops. This is acceptable for a *temporary* rolling history.

## Files touched

- `src-tauri/src/commands.rs` — image branch in `start_clipboard_watch`; shared
  paste helper; `tray_paste_image` + `summon_paste_image_path`.
- `src-tauri/src/lib.rs` — register the two new commands.
- `src/lib/clipboard.ts` — `path`/`mime` on `ClipEntry`; image dedup in `addClip`;
  `suppressImageCapture` / `shouldSuppressImageCapture`.
- `src/lib/ipc.ts` — `trayPasteImage` / `summonPasteImagePath` thin wrappers.
- `src/components/AppShell.tsx` — image branch in the `clipboard:new` listener +
  canvas thumbnail generation.
- `src/components/TrayDock.tsx` — image branches in `pasteClip` / `stageClip` /
  `saveClip`; `ClipRow` drag + action buttons for images.
- `src/components/SummonPanel.tsx` — image branch in `pasteClip`.

## Testing

Image capture and paste are macOS-native (NSPasteboard / NSImage) and not
unit-testable; the repo has no JS test runner, and Rust tests cover only
`blobs`/`crypto`. Verification is a manual checklist:

1. Enable Clipboard history. Copy a screenshot → it appears in the Clipboard lane
   with a thumbnail and the source app.
2. Click it (or the Paste button) → the image pastes into another app at the
   cursor; it is **not** re-added to the history (suppression works).
3. Stage → it appears in the Shelf as an image and drags out to Finder/another app.
4. Save → it commits to the board as an image item.
5. Copy text → still captured as a text clip (no regression).
6. Toggle Clipboard history off → no image is captured.

## Open decisions (resolved)

- **Capture scope:** image *data* only, not Finder file-copies. ✓
- **Temp-file cleanup:** none beyond OS temp-dir reclamation. ✓
- **Action parity:** full parity with text (paste / save / stage / drag). ✓
