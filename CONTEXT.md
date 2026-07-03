# Quickboard — Domain Context

Quickboard is a local-first macOS "command board" (Tauri 2 + React 19): save
notes, links, snippets, images, and files; summon them over any app with
⌥Space and paste at the cursor. Everything is encrypted at rest on the user's
Mac; nothing touches a server.

## Ubiquitous language

- **Item** — one saved thing (kind: `Text` or `File`; content type: note,
  link, code, image, file). Lives encrypted in SQLite (`store.rs`), file
  bodies as encrypted blobs on disk (`blobs.rs`).
- **Environment** — top-level board scope (e.g. Personal, Work). Every item
  belongs to exactly one.
- **Category** — folder within an environment. Cards get baked
  ShaderGradient covers keyed by name.
- **Confidential item** — Touch-ID-gated. The gate lives server-side in Rust
  (`gate_confidential` in `commands.rs`): every egress path (reveal, copy,
  drag, paste) must authorize before any decrypt. Never add an egress path
  that reads the body first.
- **DEK** — the single data-encryption key (AES-256-GCM), stored in the macOS
  keychain (`keyring_dek.rs`). A new DEK is minted ONLY on `NoEntry`;
  any other keychain error must abort startup, never re-key.
- **Summon panel** — the ⌥Space launcher (`panel.html` window). A
  non-activating NSPanel (`summon.rs`): it takes keyboard without stealing
  app focus; paste re-activates the remembered app and synthesizes ⌘V.
- **Tray** — floating staging inbox (`tray.html` window, ⌥⇧Space) with two
  lanes: **Shelf** (curated drops) and **Clipboard** (rolling opt-in copy
  history, encrypted at rest in `clips.enc`). Committing a lane batch-saves
  to the board.
- **Staged file** — tray-dropped bytes parked in app-data `staged/`
  (durable), swept on startup when unreferenced. Drag-out decrypts into
  `$TMPDIR/quickboard-drag/`, also swept on startup.

## Windows & sync

Three webview windows (main / summon / tray) each mount their own React
state. Board changes broadcast `board:changed` (source-tagged; self-skipped;
debounced) and clipboard changes broadcast `clips:changed`. Any new mutation
must go through the wrappers in `src/lib/ipc.ts`.

## Invariants worth defending in review

1. Confidential bytes never leave Rust without `gate_confidential`.
2. The DEK is never overwritten outside first-run `NoEntry`.
3. Plaintext never persists: clipboard history is encrypted, temp decrypts
   are swept, localStorage holds no secrets.
4. The summon panel never activates the app (focus stays where the user was).
5. Versions in `tauri.conf.json`, `package.json`, `Cargo.toml` move together
   (release.sh enforces).

Decisions with lasting consequences are recorded in `docs/adr/`.
