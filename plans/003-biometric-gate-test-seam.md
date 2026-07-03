# Plan 003: Make the Touch ID gate testable and lock it with regression tests

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat 0b0d4bb..HEAD -- src-tauri/src/commands.rs src-tauri/src/confidential.rs src-tauri/src/store.rs`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: MED (touches the auth path — must not weaken the real gate)
- **Depends on**: none (plan 002 provides the CI that will keep these tests running)
- **Category**: tests / security
- **Planned at**: commit `0b0d4bb`, 2026-07-03

## Why this matters

The app's core security promise is "a confidential item never leaves the vault
without a successful Touch ID unlock." That invariant is enforced in four IPC
egress paths, but has **zero automated coverage** — a refactor could drop one
`if confidential { require_biometric() }` guard and nothing would fail. The
biometric prompt is interactive, so the fix is a seam: route the "is this
release authorized?" decision through a function that tests can drive with a
stubbed authorizer, then write tests asserting each egress path refuses on
auth failure and proceeds on success.

## Current state

- `src-tauri/src/commands.rs` — all `#[tauri::command]` handlers. The gate:

```rust
// src-tauri/src/commands.rs:9-14
async fn require_biometric() -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(crate::confidential::biometric_roundtrip)
        .await
        .map_err(|e| format!("biometric task failed: {e:?}"))?
        .map(|_| ())
}
```

- The four gated egress commands, all following this exact shape (confirmed at
  commit 0b0d4bb):
  - `get_text_value` (~line 57): `let confidential = { store.lock().unwrap().is_confidential(&id)? }; if confidential { require_biometric().await?; } let value = { store.lock().unwrap().get_text(&id)? };`
  - `get_image_data_url` (~line 137): same pattern, then `read_file`.
  - `file_to_temp` (~line 147): same pattern, then `read_file_bytes` and a
    plaintext write to a temp dir.
  - `summon_paste_image` (search for it in commands.rs): same pattern.
- `src-tauri/src/confidential.rs` — `biometric_roundtrip()` does the real
  LocalAuthentication round-trip; returns `Err` on cancel/failure/no-biometrics.
- Existing test module: `commands.rs` line ~857 `mod tests` — currently tests
  only pure staged-file helpers (`write_staged`, `existing_paths` logic,
  `sweep_dir`). Model new tests after its style.
- `src-tauri/src/store.rs` — `Store` has `open_in_memory` used by its own
  tests (line ~345), so a store with a confidential item can be constructed in
  tests without the filesystem or keychain.

## Commands you will need

| Purpose    | Command                                            | Expected on success |
|------------|----------------------------------------------------|---------------------|
| Rust tests | `cargo test --manifest-path src-tauri/Cargo.toml`  | all pass            |
| Rust check | `cargo check --manifest-path src-tauri/Cargo.toml` | exit 0              |

## Scope

**In scope** (the only files you should modify):
- `src-tauri/src/commands.rs`
- `src-tauri/src/confidential.rs` (only if the seam naturally lives there)

**Out of scope** (do NOT touch):
- `src-tauri/src/crypto.rs`, `keyring_dek.rs` — unrelated.
- The frontend — no TS changes.
- Do not change WHAT is gated (the four commands) or add/remove gates —
  this plan only makes the existing gating testable and tested.

## Git workflow

- Branch: `advisor/003-biometric-gate-test-seam`
- Commit style: imperative sentence (match `git log`).
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Extract a gated-release helper with an injectable authorizer

Create in `commands.rs` (or `confidential.rs` if cleaner) a helper that
captures the pattern shared by all four commands, e.g.:

```rust
/// Release a confidential value only after `authorize` succeeds.
/// `authorize` is the biometric round-trip in production; tests inject stubs.
async fn gate_confidential<F>(confidential: bool, authorize: F) -> Result<(), String>
where
    F: std::future::Future<Output = Result<(), String>>,
{
    if confidential {
        authorize.await?;
    }
    Ok(())
}
```

Rewrite the four commands to call
`gate_confidential(confidential, require_biometric()).await?` in place of
their inline `if confidential { require_biometric().await?; }`. Behavior must
be byte-for-byte equivalent: gate BEFORE any decrypt/read of the body.

**Verify**: `cargo check --manifest-path src-tauri/Cargo.toml` → exit 0, and
`grep -c "gate_confidential" src-tauri/src/commands.rs` → ≥5 (1 definition +
4 call sites).

### Step 2: Test the helper's decision table

In `commands.rs` `mod tests`, add async tests (use `tauri::async_runtime::block_on`
or `#[tokio::test]` if tokio is already a transitive dev-dependency — check
`Cargo.toml`; if neither is available for tests, make `gate_confidential`
synchronous taking `FnOnce() -> Result<(), String>` and have callers pass a
closure that blocks on `require_biometric` — choose whichever compiles
cleanly, the seam matters more than the exact shape):

1. `confidential=false` + authorizer that panics if called → `Ok(())`
   (proves non-confidential items never prompt).
2. `confidential=true` + authorizer returning `Ok` → `Ok(())`.
3. `confidential=true` + authorizer returning `Err("cancelled")` →
   `Err` (proves refusal on failed auth).

### Step 3: Guard against gate-ordering regressions

Add one test at the store level: using `Store::open_in_memory` (see
`store.rs` tests ~line 345 for construction), insert a confidential text item
and assert `is_confidential(&id)` returns `Ok(true)` — this is the input the
gate depends on. Then add a comment above each of the four commands:
`// SECURITY: gate_confidential must run before any read of the body.`

**Verify**: `cargo test --manifest-path src-tauri/Cargo.toml` → all pass,
including 4+ new tests.

## Test plan

Steps 2–3 above are the test plan. Pattern: existing `mod tests` in
`commands.rs` and `store.rs`.

## Done criteria

- [ ] `cargo test --manifest-path src-tauri/Cargo.toml` exits 0 with ≥4 new tests
- [ ] All four egress commands call the shared gate helper (grep check from Step 1)
- [ ] No inline `if confidential { require_biometric` remains: `grep -n "require_biometric().await" src-tauri/src/commands.rs` shows it only inside the helper wiring, not duplicated per command
- [ ] No files outside the in-scope list are modified (`git status`)
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- The four commands do not match the described pattern (drift).
- You cannot make the async seam compile without adding a new dependency —
  report; do not add tokio/futures crates on your own.
- Any change would alter WHEN the prompt fires from the user's perspective.

## Maintenance notes

- Every future command that returns confidential bytes MUST route through
  `gate_confidential`; reviewers should reject any new egress path that reads
  the body before the gate.
- If commands.rs is later split into modules (a known tech-debt candidate),
  the helper and its tests move together.
