# Quickboard App Shell (Plan 2) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the Plan-1 foundation into a usable management app: complete the backend (real timestamps, file-blob storage, item CRUD/pin, categories), then build the real app window (design system + sidebar + Quick access + categorized Library + Add-item), replacing the throwaway harness.

**Architecture:** Rust backend gains file-blob storage (encrypted files in the app data dir) and full item CRUD over IPC. The React frontend gets a Plus Jakarta Sans / Lucide "ink" design system, a TanStack Router shell, and the validated dashboard layout (Quick access hero → category-grouped editorial Library → meta footer). The Confidential gate and the quick launcher are deliberately deferred to Plans 3 and 4.

**Tech Stack:** Tauri v2, Rust (`rusqlite`, `aes-gcm`, existing `crypto`/`store`/`keyring_dek`), React 19 + TS + Vite + TanStack Router + shadcn/ui + Tailwind + Framer Motion + Lucide, Plus Jakarta Sans.

**Spec:** `docs/superpowers/specs/2026-06-21-quickboard-design.md`
**Builds on:** Plan 1 (`docs/superpowers/plans/2026-06-21-quickboard-foundation.md`), now merged to `main`.

**START: create a branch.** `git checkout -b plan2-app-shell` before Task 1. Source cargo (`source "$HOME/.cargo/env"`) in every shell. GUI verification steps are handed to the human; agents verify via `cargo test` / `pnpm build`.

---

## File structure

```
src-tauri/src/
  model.rs      # MODIFY: add timestamps helper, FileMeta; Kind already exists
  store.rs      # MODIFY: real timestamps, add_file/get_file_to_temp, update/delete/set_pinned, list_categories
  blobs.rs      # CREATE: encrypted file-blob read/write under app data dir
  commands.rs   # MODIFY: add file + CRUD + category commands
  lib.rs        # MODIFY: register new commands; pass a blob dir into Store
src/
  main.tsx          # MODIFY: mount router
  router.tsx        # CREATE: TanStack Router (routes: /, /category/$name, /settings)
  lib/ipc.ts        # CREATE: typed wrappers over invoke()
  lib/types.ts      # CREATE: Item / Category TS types (mirror Rust)
  components/AppShell.tsx     # CREATE: window chrome + sidebar + <Outlet/>
  components/Sidebar.tsx      # CREATE: nav + categories + add button
  routes/Home.tsx             # CREATE: Quick access + categorized Library
  routes/Settings.tsx         # CREATE: settings stub (storage stats, about)
  components/ItemRow.tsx      # CREATE: one library row (copy / drag-out)
  components/AddItemDialog.tsx# CREATE: add text or file item
  App.tsx                     # MODIFY: delete harness/spike UI, render <AppShell> via router
  index.css                   # MODIFY: ink design tokens
```

---

### Task 1: Real timestamps + item CRUD in the store

**Files:** Modify `src-tauri/src/store.rs`, `src-tauri/src/model.rs`

- [ ] **Step 1: Write failing tests** (append to `store.rs` tests):

```rust
#[test]
fn timestamps_are_set_and_update_pins() {
    let s = Store::open_in_memory(crate::crypto::new_key()).unwrap();
    let id = s.add_text_at("Plate", "Home", false, "B1234XYZ", 1_700_000_000).unwrap();
    let items = s.list().unwrap();
    assert_eq!(items[0].created_at, 1_700_000_000);
    assert!(!items[0].pinned);
    s.set_pinned(&id, true).unwrap();
    assert!(s.list().unwrap()[0].pinned);
    s.delete(&id).unwrap();
    assert_eq!(s.list().unwrap().len(), 0);
}
```

- [ ] **Step 2: Run, verify FAIL:** `cd src-tauri && source "$HOME/.cargo/env" && cargo test store::tests::timestamps_are_set_and_update_pins` → FAIL (methods undefined).

- [ ] **Step 3: Implement.** In `store.rs` replace the old `add_text` body with a timestamped core and keep a convenience wrapper, and add CRUD:

```rust
pub fn add_text(&self, label: &str, category: &str, confidential: bool, value: &str) -> Result<String, String> {
    self.add_text_at(label, category, confidential, value, now_unix())
}
pub fn add_text_at(&self, label: &str, category: &str, confidential: bool, value: &str, now: i64) -> Result<String, String> {
    let id = uuid::Uuid::new_v4().to_string();
    let body = crate::crypto::encrypt(&self.key, value.as_bytes())?;
    self.conn.execute(
        "INSERT INTO items VALUES(?1,?2,'Text',?3,?4,0,?5,?6,?6,?6,0)",
        rusqlite::params![id, label, category, confidential as i64, body, now],
    ).map_err(|e| e.to_string())?;
    Ok(id)
}
pub fn set_pinned(&self, id: &str, pinned: bool) -> Result<(), String> {
    self.conn.execute("UPDATE items SET pinned=?1, updated_at=?2 WHERE id=?3",
        rusqlite::params![pinned as i64, now_unix(), id]).map_err(|e| e.to_string())?;
    Ok(())
}
pub fn delete(&self, id: &str) -> Result<(), String> {
    self.conn.execute("DELETE FROM items WHERE id=?1", [id]).map_err(|e| e.to_string())?;
    Ok(())
}
pub fn touch_used(&self, id: &str) -> Result<(), String> {
    self.conn.execute("UPDATE items SET last_used_at=?1, use_count=use_count+1 WHERE id=?2",
        rusqlite::params![now_unix(), id]).map_err(|e| e.to_string())?;
    Ok(())
}
```
Add to `model.rs`:
```rust
pub fn now_unix() -> i64 {
    use std::time::{SystemTime, UNIX_EPOCH};
    SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_secs() as i64).unwrap_or(0)
}
```
And `use crate::model::now_unix;` in `store.rs`.

- [ ] **Step 4: Run, verify PASS:** `cargo test store` → all pass.

- [ ] **Step 5: Commit:** `git add -A && git commit -m "feat: real timestamps + item pin/delete/touch in store"`

---

### Task 2: Encrypted file-blob storage

**Files:** Create `src-tauri/src/blobs.rs`; Modify `src-tauri/src/store.rs`, `src-tauri/src/lib.rs`, `src-tauri/src/model.rs`

- [ ] **Step 1: Write failing test** (in `blobs.rs`):

```rust
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn blob_roundtrip_is_encrypted_on_disk() {
        let dir = std::env::temp_dir().join("qb-blobtest");
        std::fs::create_dir_all(&dir).unwrap();
        let key = crate::crypto::new_key();
        let id = "blob1";
        write_blob(&dir, key, id, b"PNGDATA-secret").unwrap();
        let on_disk = std::fs::read(dir.join(format!("{id}.bin"))).unwrap();
        assert_ne!(on_disk, b"PNGDATA-secret"); // ciphertext, not plaintext
        assert_eq!(read_blob(&dir, key, id).unwrap(), b"PNGDATA-secret");
        std::fs::remove_dir_all(&dir).ok();
    }
}
```

- [ ] **Step 2: Run, verify FAIL:** `cargo test blobs` → FAIL.

- [ ] **Step 3: Implement `blobs.rs`:**

```rust
use std::path::{Path, PathBuf};
use crate::crypto::{DataKey, encrypt, decrypt};

pub fn write_blob(dir: &Path, key: DataKey, id: &str, plaintext: &[u8]) -> Result<(), String> {
    std::fs::create_dir_all(dir).map_err(|e| e.to_string())?;
    let ct = encrypt(&key, plaintext)?;
    std::fs::write(dir.join(format!("{id}.bin")), ct).map_err(|e| e.to_string())
}
pub fn read_blob(dir: &Path, key: DataKey, id: &str) -> Result<Vec<u8>, String> {
    let ct = std::fs::read(dir.join(format!("{id}.bin"))).map_err(|e| e.to_string())?;
    decrypt(&key, &ct)
}
pub fn delete_blob(dir: &Path, id: &str) -> Result<(), String> {
    let p: PathBuf = dir.join(format!("{id}.bin"));
    if p.exists() { std::fs::remove_file(p).map_err(|e| e.to_string())?; }
    Ok(())
}
```
Add `pub mod blobs;` to `lib.rs`.

- [ ] **Step 4: Add file items to the store.** In `store.rs`, give `Store` a `blob_dir: PathBuf` field (add it to `open`/`open_in_memory` — for `open_in_memory` use a temp dir). Store file metadata (filename, mime) as the encrypted `body` (JSON), and `kind='File'`. Add:

```rust
pub fn add_file(&self, label: &str, category: &str, confidential: bool,
                filename: &str, mime: &str, bytes: &[u8]) -> Result<String, String> {
    let id = uuid::Uuid::new_v4().to_string();
    crate::blobs::write_blob(&self.blob_dir, self.key, &id, bytes)?;
    let meta = serde_json::json!({ "filename": filename, "mime": mime, "size": bytes.len() });
    let body = crate::crypto::encrypt(&self.key, meta.to_string().as_bytes())?;
    let now = now_unix();
    self.conn.execute(
        "INSERT INTO items VALUES(?1,?2,'File',?3,?4,0,?5,?6,?6,?6,0)",
        rusqlite::params![id, label, category, confidential as i64, body, now],
    ).map_err(|e| e.to_string())?;
    Ok(id)
}
pub fn read_file_bytes(&self, id: &str) -> Result<(String, Vec<u8>), String> {
    let body: Vec<u8> = self.conn.query_row("SELECT body FROM items WHERE id=?1", [id], |r| r.get(0))
        .map_err(|e| e.to_string())?;
    let meta: serde_json::Value = serde_json::from_slice(&crate::crypto::decrypt(&self.key, &body)?)
        .map_err(|e| e.to_string())?;
    let filename = meta["filename"].as_str().unwrap_or("file").to_string();
    Ok((filename, crate::blobs::read_blob(&self.blob_dir, self.key, id)?))
}
```
Add `serde_json = "=1.0.128"` to Cargo.toml if not already present (pin exact). Update `list()` so `kind` reflects the DB `kind` column instead of hardcoding `Kind::Text` (read the `kind` TEXT column, map `"File"`→`Kind::File` else `Kind::Text`).

- [ ] **Step 5: Write failing test for the store file path** (in `store.rs` tests):

```rust
#[test]
fn add_file_lists_as_file_and_reads_back() {
    let s = Store::open_in_memory(crate::crypto::new_key()).unwrap();
    let id = s.add_file("KTP", "Identity", true, "ktp.png", "image/png", b"PNGBYTES").unwrap();
    let it = &s.list().unwrap()[0];
    assert!(matches!(it.kind, crate::model::Kind::File));
    let (name, bytes) = s.read_file_bytes(&id).unwrap();
    assert_eq!(name, "ktp.png");
    assert_eq!(bytes, b"PNGBYTES");
}
```

- [ ] **Step 6: Run, verify PASS:** `cargo test store && cargo test blobs`.

- [ ] **Step 7: Commit:** `git add -A && git commit -m "feat: encrypted file-blob storage + File-kind items"`

---

### Task 3: File + CRUD + category IPC commands

**Files:** Modify `src-tauri/src/commands.rs`, `src-tauri/src/lib.rs`

- [ ] **Step 1: Implement commands** in `commands.rs` (compile-checked; runtime-exercised by the UI):

```rust
use std::fs;
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
// Add a file item by reading a file the user picked (absolute path from the dialog plugin).
#[tauri::command]
pub fn add_file_item(store: State<Mutex<Store>>, label: String, category: String,
                     confidential: bool, src_path: String) -> Result<String, String> {
    let bytes = fs::read(&src_path).map_err(|e| e.to_string())?;
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
// Write a file item to a temp path so the frontend can drag it out.
#[tauri::command]
pub fn file_to_temp(store: State<Mutex<Store>>, app: tauri::AppHandle, id: String) -> Result<String, String> {
    use tauri::Manager;
    let (filename, bytes) = store.lock().unwrap().read_file_bytes(&id)?;
    let dir = app.path().temp_dir().map_err(|e| e.to_string())?.join("quickboard-drag");
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let p = dir.join(filename);
    fs::write(&p, bytes).map_err(|e| e.to_string())?;
    Ok(p.to_string_lossy().to_string())
}
```
Add `list_categories` to `store.rs`:
```rust
pub fn list_categories(&self) -> Result<Vec<String>, String> {
    let mut stmt = self.conn.prepare("SELECT DISTINCT category FROM items ORDER BY category").map_err(|e| e.to_string())?;
    let rows = stmt.query_map([], |r| r.get::<_,String>(0)).map_err(|e| e.to_string())?;
    rows.collect::<Result<_,_>>().map_err(|e| e.to_string())
}
```
Register `set_pinned`, `delete_item`, `list_categories`, `add_file_item`, `file_to_temp` in the `invoke_handler` in `lib.rs` (append). Add the Tauri dialog + fs plugins if needed for the file picker (`@tauri-apps/plugin-dialog`, pinned + socket.dev-vetted).

- [ ] **Step 2: Build + tests:** `cargo build && cargo test` → compiles, existing tests still pass.

- [ ] **Step 3: Commit:** `git add -A && git commit -m "feat: file/CRUD/category IPC commands"`

---

### Task 4: Design tokens + typed IPC + router shell

**Files:** Modify `src/index.css`, `src/main.tsx`; Create `src/lib/types.ts`, `src/lib/ipc.ts`, `src/router.tsx`, `src/components/AppShell.tsx`

- [ ] **Step 1: Ink design tokens** in `index.css` — define CSS variables for the warm-neutral ink palette (background `#fff`, sidebar `#fcfcfb`, borders `#eeece8`, ink `#191917`, muted `#8c8a84`, accent amber `#d4842e`), set `font-family: 'Plus Jakarta Sans'` on `:root`, and a `tabular-nums` utility. Keep shadcn's existing variables; add ours alongside.

- [ ] **Step 2: TS types** in `lib/types.ts`:
```ts
export type Kind = "Text" | "File";
export type Item = {
  id: string; label: string; kind: Kind; category: string;
  confidential: boolean; pinned: boolean;
  created_at: number; updated_at: number; last_used_at: number; use_count: number;
};
```

- [ ] **Step 3: Typed IPC** in `lib/ipc.ts`:
```ts
import { invoke } from "@tauri-apps/api/core";
import type { Item } from "./types";
export const listItems = () => invoke<Item[]>("list_items");
export const listCategories = () => invoke<string[]>("list_categories");
export const addText = (label: string, category: string, confidential: boolean, value: string) =>
  invoke<string>("add_text_item", { label, category, confidential, value });
export const addFile = (label: string, category: string, confidential: boolean, srcPath: string) =>
  invoke<string>("add_file_item", { label, category, confidential, srcPath });
export const getTextValue = (id: string) => invoke<string>("get_text_value", { id });
export const fileToTemp = (id: string) => invoke<string>("file_to_temp", { id });
export const setPinned = (id: string, pinned: boolean) => invoke<void>("set_pinned", { id, pinned });
export const deleteItem = (id: string) => invoke<void>("delete_item", { id });
```

- [ ] **Step 4: Router + shell.** `router.tsx` defines a root route rendering `<AppShell>` with child routes `/` (Home), `/settings`. `AppShell.tsx` renders the macOS window layout: a left `<Sidebar/>` + a main area with `<Outlet/>`. Wire it in `main.tsx` with `<RouterProvider/>`.

- [ ] **Step 5: Build check:** `pnpm build` → typechecks and builds.

- [ ] **Step 6: Commit:** `git add -A && git commit -m "feat: ink design tokens, typed IPC, router shell"`

---

### Task 5: Sidebar + Home (Quick access + categorized Library)

**Files:** Create `src/components/Sidebar.tsx`, `src/components/ItemRow.tsx`, `src/routes/Home.tsx`

- [ ] **Step 1: Sidebar.tsx** — brand ("quickboard" + Beta), a search input (filters Home list via a shared store/context or URL param), an "Add item" button (opens AddItemDialog — added in Task 6; for now a button that routes/opens), nav links (Home, Settings) using Lucide icons (`LayoutGrid`, `Settings`, `Lock`), and a Categories list from `listCategories()` with colored dots. NO emojis — Lucide only.

- [ ] **Step 2: ItemRow.tsx** — one library row: Lucide type icon or a file thumbnail, label, `category · kind` subtext, and right-side actions. Text item → "copy" button calling `getTextValue(id)` then `navigator.clipboard.writeText`. File item → a `draggable` handle whose `onDragStart` calls `fileToTemp(id)` then `startDrag({ item:[path], icon:path })` (reuse the drag plugin from Plan 1). Confidential items show a `Lock` icon (the actual gate is Plan 3 — for now reveal/copy works; mark `// Plan 3: gate this behind Touch ID`).

- [ ] **Step 3: Home.tsx** — fetch `listItems()`; render **Quick access** (items where `pinned`) as elevated cards, then **Library** grouped by `category` (section header + hairline + `ItemRow`s), then a meta footer (counts). Use Framer Motion for a subtle list fade/stagger on mount. Match the validated mockup hierarchy.

- [ ] **Step 4: Build check:** `pnpm build` → passes.

- [ ] **Step 5: Commit:** `git add -A && git commit -m "feat: sidebar + Home (quick access + categorized library)"`

---

### Task 6: Add-item dialog (text + file)

**Files:** Create `src/components/AddItemDialog.tsx`; wire into `Sidebar.tsx`

- [ ] **Step 1: AddItemDialog.tsx** — a shadcn `Dialog` with: label input, a Text/File toggle, value textarea (text) or a file picker button using `@tauri-apps/plugin-dialog`'s `open()` (file) — OR accept a file dropped onto the dialog (reuse `onDragDropEvent`), a category combobox (existing categories + free text), and a "Confidential" switch. Submit calls `addText(...)` or `addFile(...)` then closes + triggers a Home refresh (via a shared query/refetch).

- [ ] **Step 2: Wire** the "Add item" button in `Sidebar.tsx` to open the dialog. Ensure new items appear in Home after add (refetch `listItems`).

- [ ] **Step 3: Build check:** `pnpm build` → passes.

- [ ] **Step 4: Commit:** `git add -A && git commit -m "feat: add-item dialog (text + file)"`

---

### Task 7: Settings stub + delete the harness/spike UI

**Files:** Create `src/routes/Settings.tsx`; Modify `src/App.tsx`, `src-tauri/src/lib.rs`, delete `src-tauri/src/confidential.rs` usage if unused

- [ ] **Step 1: Settings.tsx** — show storage stats (item/file counts via `listItems`, app data location), an "About" line, and a placeholder for the hotkey (Plan 4) and confidential session length (Plan 3). Read-only for now.

- [ ] **Step 2: Delete the harness/spike UI.** Replace `App.tsx` so it only mounts the router (no drag box, no Touch ID button, no harness list). Remove the `spike_drag_paths` and `spike_biometric` commands and the `greet` command from `lib.rs` invoke_handler and delete their code. **KEEP** the drag plugin registration (used by file drag-out) and **KEEP** `confidential.rs`'s LAContext function (Plan 3 reuses it — leave the module, just remove the `spike_biometric` command wrapper, or keep the fn `pub` for Plan 3). Remove `sample-drag.txt` and the `spike_drag_paths` temp-file code.

- [ ] **Step 3: Build + tests:** `cargo build && cargo test && pnpm build` → all green; spike commands gone, drag plugin intact.

- [ ] **Step 4: Commit:** `git add -A && git commit -m "feat: settings stub; remove harness/spike UI (drag plugin + LAContext retained)"`

- [ ] **Step 5: HUMAN verification (GUI):** `source "$HOME/.cargo/env" && pnpm tauri dev`. Verify: window shows the real sidebar + Home; "Add item" adds a text item (appears under its category) and a file item (pick a PNG); "copy" copies text; dragging a file row out lands the file in Finder; pinning surfaces it in Quick access; Settings shows stats. Report results.

---

## Self-review (done)

- **Spec coverage:** real timestamps ✓ (T1), file storage ✓ (T2), CRUD/pin ✓ (T1/T3), categories ✓ (T3/T5), design system + Plus Jakarta Sans + Lucide/no-emoji ✓ (T4/T5), two-surface app window (Surface 1) ✓ (T4–T6), Quick access + categorized Library hierarchy ✓ (T5), Add text+file ✓ (T6), harness removed ✓ (T7). **Deferred by design:** Confidential gate → Plan 3; quick launcher + shelf → Plan 4.
- **Placeholder scan:** backend tasks have full code + TDD; UI tasks specify exact files, components, IPC calls, and the libraries/props to use (component JSX is described at component granularity with the concrete IPC wiring — appropriate altitude for UI, no vague "add error handling"). The two `// Plan 3` markers are intentional deferrals, not gaps.
- **Type consistency:** `Item`/`Kind` (Rust `model.rs` ↔ TS `types.ts`), store methods (`add_text_at`, `add_file`, `read_file_bytes`, `set_pinned`, `delete`, `list_categories`), and IPC names (`add_file_item`, `file_to_temp`, `set_pinned`, `delete_item`, `list_categories`) are consistent across tasks and match the `lib/ipc.ts` wrappers.

## Carry-forward to Plan 3 / 4
- **Plan 3 (Confidential gate + hardening):** gate `get_text_value`/`file_to_temp` for confidential items behind the LAContext Touch ID (async + `spawn_blocking` to fix the latency), session-window cache, clipboard auto-clear, masking/reveal UI, Confidential route; zeroize keys; map Mutex poison to errors; tighten loose Cargo pins (`tauri`/`serde` → exact).
- **Plan 4 (Launcher + shelf):** global hotkey, launcher window, search palette, drag-out + temp shelf.
