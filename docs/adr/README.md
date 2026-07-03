# Architecture Decision Records

One file per decision, numbered (`0001-<slug>.md`), following the usual ADR
shape: Context → Decision → Consequences. Record decisions that constrain
future work (storage format, crypto/key handling, window/focus model, update
channel) — not routine implementation choices.

Existing decisions currently documented elsewhere (candidates to backfill):

- DEK in the macOS keychain, AES-256-GCM per item body (`src-tauri/src/crypto.rs`, `keyring_dek.rs`).
- Non-activating NSPanel for summon/tray so focus never leaves the user's app (`src-tauri/src/summon.rs`).
- Baked ShaderGradient covers instead of live GL per card (`src/components/ShaderBaker.tsx`).
- Staged tray files in app-data, not OS temp (commit `44debd7`).
- Self-signed stable code-signing identity for updates (commit `0acfa3c`).
