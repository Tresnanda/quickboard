# Plan 006: Sweep decrypted temp files so confidential bytes don't linger on disk

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat 0b0d4bb..HEAD -- src-tauri/src/commands.rs src-tauri/src/lib.rs`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: LOW-MED (must not delete a file the OS is still consuming mid-drag)
- **Depends on**: none
- **Category**: security
- **Planned at**: commit `0b0d4bb`, 2026-07-03

## Why this matters

Dragging a file item out of quickboard (or pasting an image) decrypts the
bytes and writes them in **plaintext** to `$TMPDIR/quickboard-drag/` (and
clipboard captures to `$TMPDIR/quickboard-clip/`). Nothing in the app ever
deletes these files — macOS's ~3-day temp reaping is the only cleanup, and the
codebase itself documents that reaping as unreliable. For a **confidential**
item this defeats encryption-at-rest: one authenticated drag leaves the secret
sitting in cleartext on disk indefinitely. Fix: sweep both temp dirs on app
startup with a freshness grace, reusing the sweep machinery that already
exists for the staged dir.

## Current state

- `src-tauri/src/commands.rs` — writers into the temp dirs (all confirmed at
  commit 0b0d4bb):
  - `file_to_temp` (~line 147-160) — decrypted item bytes (including
    confidential, post-Touch-ID) → `temp_dir()/quickboard-drag/<filename>`:

```rust
let dir = app.path().temp_dir().map_err(|e| e.to_string())?.join("quickboard-drag");
std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
let p = dir.join(filename);
std::fs::write(&p, bytes).map_err(|e| e.to_string())?;
Ok(p.to_string_lossy().to_string())
```

  - `write_drag_icon` (~line 280) — drag preview png → same dir.
  - `stage_text_file` (~line 295) — tray text → `.txt` in same dir.
  - `capture_clipboard_image` (~line 530-556) — clipboard image bytes →
    `temp_dir()/quickboard-clip/…`.
- The existing sweeper covers only the durable app-data `staged` dir:

```rust
// src-tauri/src/commands.rs:407-446 (abridged)
fn sweep_dir(root: &std::path::Path, keep: &HashSet<String>, grace: Duration) -> u32 { ... }

#[tauri::command]
pub fn sweep_staged_files(app: tauri::AppHandle, keep: Vec<String>) -> Result<u32, String> {
    let root = staged_root(&app)?;   // app_data_dir()/staged — NOT the temp dirs
    Ok(sweep_dir(&root, &keep.into_iter().collect(), Duration::from_secs(30)))
}
```

  Note `sweep_dir` iterates **subdirectories** of `root` (staged files live in
  stamp subdirs). The two temp dirs differ (verified at 0b0d4bb):
  - `quickboard-drag/` holds files directly at the top level (all three
    writers) → needs a flat variant (Step 1).
  - `quickboard-clip/` nests per-capture stamp subdirs —
    `capture_clipboard_image` writes `quickboard-clip/<stamp:x>/clip.png`
    (commands.rs:551-554) → the EXISTING `sweep_dir` matches this layout;
    reuse it, do not use the flat variant here.
- **Important complication — clipboard image paths are referenced**: clipboard
  history entries store `path` pointing into `quickboard-clip` (see
  `src/lib/clipboard.ts:13`, `path?: string // temp file holding the full-res
  bytes`) and tray entries can reference `quickboard-drag` text files. A sweep
  must therefore accept a `keep` list from the frontend, exactly like
  `sweep_staged_files` does. The frontend already computes the analogous keep
  list for staged files at startup — find that call (`sweepStagedFiles` in
  `src/lib/ipc.ts:37` and its caller, likely in `AppShell.tsx` or `tray.ts`)
  and mirror it.
- `sweep_dir` has unit tests (`commands.rs` ~lines 899-921) — model new tests
  on them.

## Commands you will need

| Purpose    | Command                                            | Expected on success |
|------------|----------------------------------------------------|---------------------|
| Rust tests | `cargo test --manifest-path src-tauri/Cargo.toml`  | all pass            |
| Rust check | `cargo check --manifest-path src-tauri/Cargo.toml` | exit 0              |
| Typecheck  | `pnpm exec tsc --noEmit`                           | exit 0              |

## Scope

**In scope**:
- `src-tauri/src/commands.rs` (new flat-sweep helper + command)
- `src-tauri/src/lib.rs` (register the new command in the handler list ONLY)
- `src/lib/ipc.ts` (one new wrapper)
- The frontend startup call site that already invokes `sweepStagedFiles`
  (extend it to also invoke the new temp sweep — same file, adjacent code)

**Out of scope** (do NOT touch):
- `staged_root` / `sweep_staged_files` behavior — already correct.
- Changing where `file_to_temp` writes (moving off the OS temp dir is a
  bigger design change — deferred; see Maintenance notes).
- Deleting on drag-end (event unreliable across apps) — startup sweep only.

## Git workflow

- Branch: `advisor/006-sweep-drag-temp-dirs`
- Commit style: imperative sentence (match `git log`).
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Add a flat sweep helper

In `commands.rs`, next to `sweep_dir`, add `sweep_flat_dir(root, keep, grace) -> u32`:
same keep/grace/best-effort semantics as `sweep_dir` (reuse its `young`
helper), but operating on files directly under `root` (non-recursive; skip
subdirectories). Do not modify `sweep_dir`.

**Verify**: `cargo check --manifest-path src-tauri/Cargo.toml` → exit 0.

### Step 2: Add the command

```rust
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
```

Register `sweep_temp_files` in the `generate_handler![...]` list in
`lib.rs` (find the existing list containing `sweep_staged_files` and add it
adjacently).

**Verify**: `cargo check --manifest-path src-tauri/Cargo.toml` → exit 0.

### Step 3: Unit tests

In `mod tests`, modeled on `sweep_removes_orphans_but_keeps_referenced`
(~line 899): `sweep_flat_dir` removes an old unreferenced file, keeps a
referenced one, keeps a fresh one (grace), and returns the removed count.

**Verify**: `cargo test --manifest-path src-tauri/Cargo.toml` → all pass.

### Step 4: Wire the frontend startup call

In `src/lib/ipc.ts`, next to `sweepStagedFiles` (line ~37), add:

```ts
export const sweepTempFiles = (keep: string[]) => invoke<number>("sweep_temp_files", { keep });
```

Find where `sweepStagedFiles` is called on startup (grep
`sweepStagedFiles(` under `src/`). In the same place, build the keep list for
temp files: every clipboard entry `path` (`getClipboard()` from
`src/lib/clipboard.ts` — entries with `kind === "image"` carry `path`) plus
any tray entry paths pointing under `quickboard-drag`/`quickboard-clip`
(inspect how the staged keep list is built from `src/lib/tray.ts` entries and
mirror the pattern), then call `void sweepTempFiles(keep)`.

**Verify**: `pnpm exec tsc --noEmit` → exit 0.

## Test plan

- Rust unit tests from Step 3 (≥3 cases).
- Manual (if you can run `pnpm tauri dev`): drag a file item to Finder, then
  relaunch the app after 5+ minutes → `$TMPDIR/quickboard-drag/` no longer
  contains the file; a clipboard image captured just before relaunch (in
  history, path referenced) survives.

## Done criteria

- [ ] `cargo test --manifest-path src-tauri/Cargo.toml` exits 0 with new sweep tests
- [ ] `pnpm exec tsc --noEmit` exits 0
- [ ] `grep -n "sweep_temp_files" src-tauri/src/lib.rs` shows registration
- [ ] The startup call site passes a keep list including clipboard image paths
- [ ] No files outside the in-scope list are modified (`git status`)
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- The temp-dir writers listed above don't match the live code.
- You cannot locate the frontend startup site that calls `sweepStagedFiles`
  — do not invent a new startup hook; report where you looked.
- Tray entries reference temp paths in a way the keep list can't express
  (e.g. renamed copies) — report the shape you found.

## Maintenance notes

- Grace is 300s: long enough for any real drag, short enough that plaintext
  doesn't outlive the session pattern. Reviewer should confirm no feature
  keeps quickboard-drag paths alive across restarts EXCEPT tray text files
  (which the keep list must cover).
- Deferred (bigger design): stop writing confidential decrypts to the shared
  OS temp dir at all — use an app-private dir wiped on launch/quit, or
  NSFilePromise-based drags that stream without a plaintext file.
