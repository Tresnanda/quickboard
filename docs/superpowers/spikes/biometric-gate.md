# SPIKE: Touch ID-gated keychain read (Confidential-item gate feasibility)

**Goal:** Prove that the Rust backend can store a key in the macOS keychain
behind a biometric / user-presence access-control gate, such that **reading** it
triggers a Touch ID prompt. This is the second-highest project risk — the
Confidential-item gate (Plan 2) depends on it.

**Status:** code wired, builds pass. Awaiting physical human Touch ID test.

---

## What was wired

- **Rust crate:** `security-framework = "=3.7.0"` (exact pin), added under
  `[target.'cfg(target_os = "macos")'.dependencies]` in `src-tauri/Cargo.toml`.
  Pulls `security-framework-sys = 2.17.0` transitively.
- **Spike module:** `src-tauri/src/confidential.rs`, marked
  `// SPIKE: throwaway, removed/replaced in Plan 2.`
  Exposes `biometric_roundtrip() -> Result<bool, String>`.
- **Command:** `spike_biometric` in `src-tauri/src/lib.rs`, registered in the
  `invoke_handler` alongside `greet` and `spike_drag_paths`.
- **UI:** `src/App.tsx` gained a clearly-marked "Test Touch ID" button (the
  existing "Drag me out →" box is untouched). The button calls
  `invoke("spike_biometric")` and renders the boolean result or the error.

## The keychain API used (security-framework v3.7.0)

The access-control gate is created via `PasswordOptions`:

- `PasswordOptions::new_generic_password(service, account)` builds a
  generic-password query. Service = `"quickboard-spike"`, account =
  `"biometric-gate"`.
- `options.set_access_control_options(AccessControlOptions::USER_PRESENCE)`
  attaches a `SecAccessControl` to the item. `USER_PRESENCE` maps to
  **`kSecAccessControlUserPresence`** — access requires **biometry (Touch ID /
  Face ID) OR the device passcode**. (Stricter alternatives in the same enum:
  `BIOMETRY_ANY`, `BIOMETRY_CURRENT_SET`, `DEVICE_PASSCODE`.)
- `set_generic_password_options(secret, options)` creates the item
  (`SecItemAdd`). **This write does NOT prompt** for Touch ID.
- `generic_password(PasswordOptions::new_generic_password(...))` reads it back
  (`SecItemCopyMatching` with `kSecReturnData`). **This READ is the call expected
  to trigger Touch ID**, because LocalAuthentication evaluates the access-control
  object when the protected data is returned.

The secret is `b"quickboard-ck-spike"`. The round-trip deletes any stale item
first (delete needs no user presence), writes, then reads; it returns `Ok(true)`
only if the bytes read back equal the bytes written.

**Access-control flag used:** `AccessControlOptions::USER_PRESENCE`
(`kSecAccessControlUserPresence`).
**Protection class:** defaults to `kSecAttrAccessibleWhenUnlocked` (the
library's default for `SecAccessControl::create_with_flags`).

## Build results

- `cd src-tauri && source "$HOME/.cargo/env" && cargo build` — **succeeds**
  (no errors/warnings on the spike code).
- `pnpm build` (tsc + vite) — **succeeds**.

---

## Human test steps (requires a Mac with Touch ID enrolled)

1. `cd /Users/mymac/projects/quickboard`
2. `source "$HOME/.cargo/env" && pnpm tauri dev`
3. In the app window, click the green **"Test Touch ID"** button.
4. **Expected:** a system **Touch ID prompt** appears (the keychain READ
   triggers it). Authenticate with your fingerprint (or fall back to the device
   passcode).
5. **On success:** the UI shows `biometric status: result: true`.
6. **On cancel/failure:** the UI shows an `error:` line (e.g. user-cancelled
   maps to keychain code `-128` / `errSecUserCanceled`).

> Note: the prompt appears on the **read**, not the write. If you see no prompt
> at all and still get `result: true`, that is the key risk below — read on.

---

## RESULT: ⏳ pending human verification

---

## Risk note: signing / entitlements (IMPORTANT)

`pnpm tauri dev` builds an **unsigned / ad-hoc-signed** binary. Biometric
keychain access can behave differently for unsigned dev binaries:

- **Compile time:** No entitlement was required to compile. The spike builds
  clean with no `keychain-access-groups` entitlement and no code-signing config.
  `src-tauri/tauri.conf.json` currently has **no** `bundle.macOS.signingIdentity`
  and **no** `bundle.macOS.entitlements` — nothing was added.
- **Runtime (what the human test must reveal):** there are two plausible
  failure modes to watch for:
  1. **No prompt, still returns true.** Some macOS versions will satisfy a
     `kSecAccessControlUserPresence` read from an already-unlocked session
     without re-prompting, *or* for an ad-hoc binary the access-control
     constraint may be silently downgraded. If the UI shows `true` but **no
     Touch ID dialog appeared**, the gate is NOT actually enforcing biometry in
     dev — we cannot trust the unsigned-dev result and must re-test against a
     **properly code-signed** build.
  2. **Read fails with an error** (e.g. `errSecMissingEntitlement` / code
     `-34018`, or `-25291` `errSecNotAvailable`). This indicates the protected
     item genuinely needs the app to be **code-signed** and/or carry a
     **`keychain-access-groups`** entitlement. If so, the fix for Plan 2 is to
     add, in `tauri.conf.json`:
     - `bundle.macOS.signingIdentity` (a real Developer ID / Apple Development
       cert), and
     - `bundle.macOS.entitlements` pointing at a `.entitlements` plist that
       includes `keychain-access-groups` (and a matching App ID).
     Then re-run via a signed `tauri build`, not `tauri dev`.

**Bottom line:** a green `true` in `tauri dev` is necessary but **not
sufficient** — the human must confirm an actual Touch ID dialog appeared. The
authoritative proof that the gate holds requires a code-signed build, which is a
Plan 2 follow-up if dev shows any of the above.
