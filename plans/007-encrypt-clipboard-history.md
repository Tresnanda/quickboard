# Plan 007: Move clipboard history off plaintext localStorage into encrypted storage

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat 0b0d4bb..HEAD -- src/lib/clipboard.ts src-tauri/src/store.rs src-tauri/src/commands.rs src-tauri/src/crypto.rs src/components/AppShell.tsx`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: M-L
- **Risk**: MED (persistence swap + cross-window sync + migration)
- **Depends on**: plans/002-test-ci-baseline.md (clipboard.ts characterization
  tests must exist first — they define the behavior this refactor must keep)
- **Category**: security
- **Planned at**: commit `0b0d4bb`, 2026-07-03

## Why this matters

Every item in quickboard's board is AES-256-GCM encrypted at rest — but the
clipboard history (up to 100 recent copies, including anything the
password-manager skip heuristic misses) is written as **plaintext JSON to the
webview's localStorage** and survives restarts. It is the single most
sensitive data class in the app and the only one stored unencrypted. Fix:
persist the clip buffer through the Rust side, encrypted with the existing
DEK, keeping the synchronous in-memory API the UI depends on.

## Current state

- `src/lib/clipboard.ts` — the whole module (229 lines; read it fully).
  Persistence core:

```ts
// src/lib/clipboard.ts:21,27-51
const KEY = "qb_clipboard_v1";
let cache: ClipEntry[] | null = null;
function read(): ClipEntry[] {
  if (cache) return cache;
  ...JSON.parse(localStorage.getItem(KEY) || "[]")...
}
function write(next: ClipEntry[]): void {
  cache = next;
  try { localStorage.setItem(KEY, JSON.stringify(next)); } catch {}
  listeners.forEach((l) => l());
}
```

  Consumers use `useClipboard()` (a `useSyncExternalStore` over `getClipboard`,
  lines 210-219) and imperative helpers (`addClip`, `removeClip`,
  `clearClipsSince`, `restoreClips`, `clearClipboard`). `read()` is
  **synchronous** — keep that: the swap is at the persistence layer, the
  in-memory `cache` remains the source of truth.
- Cross-window sync today: a `storage` event listener (lines 221-228)
  invalidates `cache` in other windows. Moving off localStorage removes this —
  replace with a Tauri event (`emit`/`listen` from `@tauri-apps/api/event`;
  exemplar: `board:changed` emitted in `src/lib/ipc.ts:5-13` and consumed in
  `src/lib/items-store.tsx:113-118`).
- Which windows write: capture happens ONLY in the main window
  (`src/components/AppShell.tsx:118-148` listens for the Rust
  `clipboard:copied` event and calls `addClip`). The tray and summon windows
  read history and call `removeClip`/`clearClipsSince`/`restoreClips`
  (undo) — so writes can originate from any window; the persistence command
  must be callable from all three (the `default` capability already covers
  `main`, `summon`, `tray`).
- Suppression keys (`qb_clipboard_suppress_v1`, `qb_clipboard_img_suppress_v1`,
  `qb_clipboard_img_seq_v1`) hold seconds-lived coordination values and a
  counter, **not secrets** — leave them on localStorage.
- Rust side available primitives:
  - `src-tauri/src/crypto.rs` — `encrypt`/`decrypt` with the DEK (AES-256-GCM,
    fresh nonce per encrypt; see its `mod tests` ~line 57 for usage shape).
  - `Store` is managed as `State<Mutex<Store>>`; the DEK lives inside it —
    read `store.rs` to find how commands access the key material, and add the
    two new methods on `Store` (Step 1) rather than passing the key around.
  - App-data dir pattern: `staged_root` in `commands.rs` (~line 320) shows
    `app.path().app_data_dir()`.

## Commands you will need

| Purpose         | Command                                            | Expected on success |
|-----------------|----------------------------------------------------|---------------------|
| Typecheck       | `pnpm typecheck`                                   | exit 0              |
| Frontend tests  | `pnpm test`                                        | all pass — especially the clipboard.ts characterization suite from plan 002 |
| Rust tests      | `cargo test --manifest-path src-tauri/Cargo.toml`  | all pass            |

## Scope

**In scope**:
- `src/lib/clipboard.ts` (persistence swap + async hydrate + tauri-event sync)
- `src-tauri/src/store.rs` (two methods: `save_clips(json)` / `load_clips()`)
- `src-tauri/src/commands.rs` (two thin commands wrapping them)
- `src-tauri/src/lib.rs` (register the commands)
- `src/lib/ipc.ts` (two wrappers)
- `src/components/AppShell.tsx` ONLY if hydration needs an explicit kick there

**Out of scope**:
- The capture pipeline (Rust poll thread, `clipboard:copied` event) — unchanged.
- The suppression/seq localStorage keys — unchanged.
- Retention policy / cap changes — `CLIPBOARD_CAP = 100` stays.
- The concealed-type skip heuristic — separate finding.

## Git workflow

- Branch: `advisor/007-encrypt-clipboard-history`
- Commit style: imperative sentence (match `git log`).
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Rust — encrypted clip persistence on Store

Add to `store.rs` (using the existing crypto helpers and matching existing
method style): `save_clips(&self, json: &str) -> Result<(), String>` encrypts
the JSON with the DEK and writes it to `<app_data_dir>/clips.enc` (the Store
already knows its data dir or receives paths — follow how the DB path is
handled; if Store doesn't know the dir, take the path as a parameter from the
command layer like `staged_root` does). `load_clips(&self) -> Result<String, String>`
reads + decrypts; return `Ok("[]")` when the file doesn't exist.
Unit tests in `store.rs` `mod tests`: round-trip, missing-file → `[]`,
tampered ciphertext → `Err`.

**Verify**: `cargo test --manifest-path src-tauri/Cargo.toml` → all pass.

### Step 2: Commands + registration + ipc wrappers

`#[tauri::command] clip_history_save(store, json: String)` and
`clip_history_load(store) -> String`, registered in `lib.rs`'s
`generate_handler![]`. In `src/lib/ipc.ts`:

```ts
export const clipHistorySave = (json: string) => invoke<void>("clip_history_save", { json });
export const clipHistoryLoad = () => invoke<string>("clip_history_load");
```

**Verify**: `cargo check` exit 0; `pnpm typecheck` exit 0.

### Step 3: Swap clipboard.ts persistence

- `read()`: return `cache ?? []` (no localStorage). Add an async
  `hydrate()` run once at module load (each window):
  `clipHistoryLoad().then(json => { cache = JSON.parse(json) fallback []; listeners.forEach(l => l()); })`.
- `write(next)`: keep `cache = next; listeners.forEach(...)` synchronous;
  persist fire-and-forget with a trailing 250ms debounce:
  `clipHistorySave(JSON.stringify(next))`, and emit a Tauri event
  `clips:changed` with payload `{ source: <window label> }` (get the label
  via `getCurrentWebviewWindow().label` or equivalent — check how other files
  in `src/lib/` get the current window, e.g. `drag.ts` or `tray.ts`).
- Replace the `storage` listener (lines 221-228) with a `listen("clips:changed")`
  that ignores events whose `source` is this window and otherwise re-runs
  `hydrate()`.
- **Migration**: in `hydrate()`, after loading, if
  `localStorage.getItem("qb_clipboard_v1")` exists: parse it, merge via the
  existing `restoreClips` logic semantics (de-dupe by id, sort by ts, cap),
  persist, then `localStorage.removeItem("qb_clipboard_v1")`. Only the main
  window should migrate (guard on window label) to avoid a 3-way race.

**Verify**: `pnpm typecheck` → exit 0; `pnpm test` → the plan-002
clipboard characterization tests pass **unchanged** except tests that
asserted localStorage persistence directly — update only those, keeping the
behavioral assertions (de-dupe, labels, suppression) untouched.

### Step 4: Confirm empty-loop behavior

With history disabled (default), `hydrate` loads `[]` and nothing writes.
Grep for any remaining `localStorage.setItem(KEY` / `getItem(KEY` — only the
one-shot migration read/remove may remain.

**Verify**: `grep -n "qb_clipboard_v1" src/lib/clipboard.ts` → matches only
inside the migration block.

## Test plan

- Rust: 3 tests from Step 1.
- Frontend: plan-002 characterization suite green; add one new test that
  `write` schedules `clipHistorySave` (mock `ipc` module with `vi.mock`).
- Manual (if runnable): copy text with history on → appears in tray lane;
  quit + relaunch → entry still there; `~/Library/Application Support/<app>/clips.enc`
  exists and `strings clips.enc | grep <copied text>` finds nothing.

## Done criteria

- [ ] `pnpm typecheck` && `pnpm test` exit 0
- [ ] `cargo test --manifest-path src-tauri/Cargo.toml` exits 0 with 3+ new tests
- [ ] Clip history no longer persists plaintext: grep check from Step 4
- [ ] Cross-window: `clips:changed` emitted on write, consumed elsewhere
- [ ] Migration path present and main-window-guarded
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- `Store` cannot reach the DEK or a data-dir path without a signature change
  that ripples beyond the in-scope files — report the actual shape of
  `Store`'s construction first.
- The characterization tests from plan 002 don't exist (dependency not landed)
  — stop; landing this without them is how regressions ship.
- Tauri event emit/listen is unavailable in one of the three windows'
  capability set — report which permission is missing rather than editing
  `capabilities/default.json` yourself.

## Maintenance notes

- The 250ms debounce means a force-quit can lose the last quarter-second of
  history — acceptable; do not "fix" by making writes synchronous over IPC.
- Reviewer should scrutinize: the migration guard (main window only), and
  that `hydrate` failure (e.g. keychain locked → decrypt fails) degrades to
  an empty lane rather than crashing the window.
- Follow-up (separate finding): the concealed-type skip heuristic is
  best-effort; consider defaulting retention shorter. Also image `thumb`
  data-URLs now live encrypted, but full-res image bytes still sit in
  `quickboard-clip` temp files — plan 006 sweeps them.
