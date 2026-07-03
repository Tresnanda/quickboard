# Plan 001: Stop minting a new DEK on keychain read errors (vault-bricking bug)

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 0b0d4bb..HEAD -- src-tauri/src/keyring_dek.rs src-tauri/src/lib.rs`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: security
- **Planned at**: commit `0b0d4bb`, 2026-07-03

## Why this matters

Quickboard encrypts every item and file blob with a single data-encryption key
(DEK) stored in the macOS keychain. The load-or-create logic treats **every**
keychain read error — a locked keychain, a denied access prompt, a transient
Security-framework failure — the same as "no key exists yet": it generates a
brand-new random key and **overwrites** the stored one. If that ever happens on
a machine with existing data, the entire vault (all items, all confidential
data, all file blobs) becomes permanently undecryptable with no recovery path.
This is the single most dangerous latent bug in the app. The fix is to mint a
new key **only** when the keyring reports the entry genuinely does not exist,
and to fail startup loudly on any other error.

## Current state

- `src-tauri/src/keyring_dek.rs` — DEK load/create/delete against the OS
  keyring via the `keyring` crate (v3.2.0 per `Cargo.lock`). The bug is in
  `load_or_create_in`:

```rust
// src-tauri/src/keyring_dek.rs:39-58
fn load_or_create_in(entry: &Entry) -> Result<DataKey, String> {
    match entry.get_password() {
        Ok(b64) => {
            let bytes = STANDARD.decode(b64).map_err(|e| e.to_string())?;
            if bytes.len() != 32 {
                return Err("bad DEK length".into());
            }
            let mut k = [0u8; 32];
            k.copy_from_slice(&bytes);
            Ok(k)
        }
        Err(_) => {                          // <-- BUG: catches ALL errors
            let k = new_key();
            entry
                .set_password(&STANDARD.encode(k))
                .map_err(|e| e.to_string())?;
            Ok(k)
        }
    }
}
```

- The `keyring` crate distinguishes error variants: `keyring::Error::NoEntry`
  means "no stored credential" — that is the ONLY case where minting a new key
  is correct. All other variants (`Ambiguous`, `PlatformFailure`,
  `NoStorageAccess`, etc.) mean the read failed for another reason.
- `src-tauri/src/lib.rs` calls `load_or_create_dek` during app setup; if it
  returns `Err`, setup should abort (verify how the existing `Err` from
  "bad DEK length" is handled in `lib.rs` and match that behavior — do not
  invent a new error-handling style).
- Existing tests live in `keyring_dek.rs` under `#[cfg(test)] mod tests`
  (around line 72), driven through `load_or_create_in` with keyring's
  in-memory mock store. Match their style.

## Commands you will need

| Purpose    | Command                                   | Expected on success |
|------------|-------------------------------------------|---------------------|
| Rust tests | `cargo test --manifest-path src-tauri/Cargo.toml` | all pass     |
| Rust check | `cargo check --manifest-path src-tauri/Cargo.toml` | exit 0      |

## Scope

**In scope** (the only files you should modify):
- `src-tauri/src/keyring_dek.rs`

**Out of scope** (do NOT touch, even though they look related):
- `src-tauri/src/crypto.rs` — the AES-GCM core is correct.
- `src-tauri/src/lib.rs` — only read it to confirm error propagation; if the
  setup code swallows the `Err` instead of aborting, that is a STOP condition
  (report it; do not redesign startup here).
- Any key-rotation or recovery feature — separate concern.

## Git workflow

- Branch: `advisor/001-keyring-dek-error-handling`
- Commit style: imperative sentence, matching repo history (e.g. "Actually fix
  Cmd+Q: own the app menu, hide instead of terminate").
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Narrow the error match

In `load_or_create_in`, replace the catch-all `Err(_)` arm with:

- `Err(keyring::Error::NoEntry)` → keep the current behavior (mint `new_key()`,
  `set_password`, return it).
- `Err(e)` (anything else) → `return Err(format!("keychain read failed: {e}"))`
  — do NOT mint or overwrite anything.

**Verify**: `cargo check --manifest-path src-tauri/Cargo.toml` → exit 0.

### Step 2: Add tests for both error classes

In the existing `mod tests` in `keyring_dek.rs`, following the existing tests'
structure (they construct a shared `Entry` against keyring's mock store):

1. `no_entry_mints_and_persists` — likely already covered by the existing
   load-after-create test; if so, skip adding a duplicate.
2. `non_noentry_error_does_not_overwrite` — if the mock store can be made to
   return a non-`NoEntry` error, assert `load_or_create_in` returns `Err` and
   the stored password is unchanged. If the in-memory mock **cannot** produce a
   non-`NoEntry` error (this is plausible), instead extract the match into a
   small pure function `fn resolve_dek(read: Result<String, keyring::Error>) -> ...`
   that is trivially testable with constructed `keyring::Error` values, and
   have `load_or_create_in` call it. Keep the public API unchanged.

**Verify**: `cargo test --manifest-path src-tauri/Cargo.toml` → all pass,
including at least one new test asserting a non-`NoEntry` error yields `Err`.

## Test plan

- New test(s) in `keyring_dek.rs` `mod tests` as described in Step 2, modeled
  after the existing tests in that module.
- Verification: `cargo test --manifest-path src-tauri/Cargo.toml` → all pass.

## Done criteria

- [ ] `cargo test --manifest-path src-tauri/Cargo.toml` exits 0 with new test(s)
- [ ] `grep -n "Err(_)" src-tauri/src/keyring_dek.rs` returns no match inside `load_or_create_in`
- [ ] No files outside the in-scope list are modified (`git status`)
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- `load_or_create_in` no longer matches the excerpt above.
- The `keyring` crate version in `Cargo.lock` is not 3.x or lacks
  `Error::NoEntry`.
- You find that `lib.rs` setup ignores the `Err` return of the DEK load
  (meaning the loud-failure path doesn't actually abort startup) — report this;
  fixing lib.rs startup flow is out of scope.

## Maintenance notes

- Any future "reset vault" or key-rotation feature must be the ONLY code path
  allowed to replace an existing DEK; keep `load_or_create_in` strictly
  non-destructive.
- Reviewer should scrutinize: that the `NoEntry` arm still persists the new
  key (first-run must keep working), and that the error message doesn't
  include the key material.
- Deferred follow-up: a user-facing startup error dialog ("keychain locked —
  quickboard can't unlock your data") instead of whatever the current failure
  mode is; and a DEK backup/escrow story (see plans/README.md direction notes).
