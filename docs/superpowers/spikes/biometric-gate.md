# SPIKE: Touch ID gate via LocalAuthentication (Confidential-item gate feasibility)

**Goal:** Prove that the Rust backend can trigger a **Touch ID system prompt**
that works under an **unsigned `tauri dev`** binary — with NO keychain
entitlement and NO code-signing. This is the second-highest project risk: the
Confidential-item gate (Plan 2) depends on being able to demand a biometric
before revealing protected items.

**Status:** code rewired to LocalAuthentication (LAContext), builds pass.
Awaiting physical human Touch ID re-test.

---

## Why we switched (entitlement -34018 under unsigned dev)

The **first** attempt stored a biometric-gated item in the macOS keychain via
`security-framework` (`kSecAccessControlUserPresence`) and tried to surface
Touch ID on the keychain **read**. Under an unsigned `tauri dev` binary this
**FAILED** with:

> `-34018  errSecMissingEntitlement`

macOS only lets an app touch protected (access-control-gated) keychain data when
the app is **code-signed** and carries a **`keychain-access-groups`** entitlement
tied to a real App ID. `tauri dev` produces an unsigned / ad-hoc binary, so the
protected read is rejected before any prompt appears. Requiring a signing
identity just to run the dev spike was unacceptable, so we switched approaches.

## New approach — Path A: LocalAuthentication / LAContext

Instead of gating keychain data, we call LocalAuthentication **directly**:

```
LAContext.evaluatePolicy(.deviceOwnerAuthenticationWithBiometrics, reason)
```

This API only drives the biometric subsystem to display the system Touch ID
dialog — it reads **no** protected keychain data — so it needs **neither an
entitlement nor a signed binary**. It works in plain unsigned `tauri dev`.

In Plan 2 this becomes the user-facing gate: require a successful
`evaluatePolicy` before decrypting / revealing a Confidential item. (The DEK
itself can still live in the OS keyring; the biometric is the user-presence
check in front of it, decoupled from keychain ACL entitlements.)

## What was wired

- **Rust crate:** `robius-authentication = "=0.1.1"` (exact pin), added under
  `[target.'cfg(target_os = "macos")'.dependencies]` in `src-tauri/Cargo.toml`,
  **replacing** the removed `security-framework`. It is a cross-platform native
  auth abstraction (Touch ID / Face ID / Windows Hello / polkit), which aligns
  with our future cross-platform goal. On macOS it wraps the `objc2-local-`
  `authentication` LAContext binding. Chosen over calling
  `objc2-local-authentication` directly because it exposes a synchronous
  `blocking_authenticate` that bridges the async LAContext completion handler
  for us (no manual channel/blocking needed), and gives us the cross-platform
  surface for free.
- **macOS dependency surface added** (from `robius-authentication` 0.1.1, default
  features, `async` OFF): `objc2`, `objc2-foundation`,
  `objc2-local-authentication`, `block2`, `cfg-if` — all from the reputable
  `objc2` ecosystem. (Non-macOS deps such as `windows`, `polkit`, `jni` resolve
  into `Cargo.lock` but are `cfg`-gated and never compiled on macOS.)
- **Spike module:** `src-tauri/src/confidential.rs`, marked
  `// SPIKE: throwaway, removed/replaced in Plan 2.` Still exposes
  `biometric_roundtrip() -> Result<bool, String>` (name kept so the command/UI
  wiring is unchanged), now implemented via LAContext. Builds a
  `PolicyBuilder::new().biometrics(Some(Strong)).password(true)` policy, sets the
  prompt reason **"Unlock your confidential items"**, and calls
  `Context::new(()).blocking_authenticate(text, &policy)`. Returns `Ok(true)` on
  success, `Err(msg)` on cancel/failure.
- **Command:** `spike_biometric` in `src-tauri/src/lib.rs` (name unchanged),
  still registered in the `invoke_handler` alongside `greet` and
  `spike_drag_paths`.
- **UI:** `src/App.tsx` keeps the clearly-marked green **"Test Touch ID"** button
  (the existing "Drag me out →" box is untouched). Its description copy was
  updated from "keychain read" to "LocalAuthentication (LAContext)".

## The API used (robius-authentication v0.1.1)

- `PolicyBuilder::new().biometrics(Some(BiometricStrength::Strong)).password(true)`
  `.build()` → `Option<Policy>` — requests biometrics, allows device-password
  fallback. (On macOS the `BiometricStrength` value is ignored; it only matters
  on Android.)
- `Text { android, apple, windows }` — platform-agnostic, so all three fields
  must be populated even on macOS; only `apple: &str` is shown in the Touch ID
  prompt (rendered as "*<app> is trying to <text>*").
- `Context::new(())` — `RawContext` is `()` on every current platform.
- `Context::blocking_authenticate(text, &policy) -> Result<(), Error>` — shows
  the system Touch ID prompt and blocks until the user responds. `Ok(())` =
  success; any failure/cancel = `Err(Error)`. `Error` is `Debug`-only (no
  `Display`), so it is formatted with `{:?}`.

## Build results

- `cd src-tauri && source "$HOME/.cargo/env" && cargo build` — **succeeds**
  (no errors/warnings on the spike code). `security-framework` no longer appears
  in `Cargo.lock`.
- `pnpm build` (tsc + vite) — **succeeds**.

---

## Human re-test steps (requires a Mac with Touch ID enrolled)

1. `cd /Users/mymac/projects/quickboard`
2. `source "$HOME/.cargo/env" && pnpm tauri dev`
3. In the app window, click the green **"Test Touch ID"** button.
4. **Expected:** a system **Touch ID prompt** appears reading
   *"…is trying to Unlock your confidential items"*. This should now appear with
   **NO `-34018 errSecMissingEntitlement`** (the failure mode of the old
   keychain approach), because LAContext needs no entitlement and no signing.
   Authenticate with your fingerprint (or use the password fallback).
5. **On success:** the UI shows `biometric status: result: true`.
6. **On cancel/failure:** the UI shows an `error:` line, e.g.
   `biometric auth failed: UserCanceled` when you dismiss the prompt, or
   `NotEnrolled` / `Unavailable` if no biometry is set up.

> Sanity check the switch worked: you should see the prompt itself (not a silent
> `true`) and there should be **no -34018 / entitlement error** in the UI or the
> `pnpm tauri dev` console.

---

## RESULT: ✅ VERIFIED — Touch ID prompt appears and authenticates under unsigned `tauri dev`, NO -34018 error.

### KNOWN ISSUE (fix in Plan 2's real gate, do not polish spike code)
There is a noticeable lag between a successful fingerprint scan and the UI showing
`result: true`. Prime suspect: `spike_biometric` is a **synchronous** Tauri command
calling `robius-authentication`'s **`blocking_authenticate`**, so the auth result
contends with Tauri's command/IPC threading and doesn't flush back to the webview
until the blocked thread frees. **Fix in Plan 2:** make the gate command `async` and
run the blocking auth in `tauri::async_runtime::spawn_blocking` (or call LAContext
directly and deliver the completion via a channel). Re-measure after the change.

---

## Supply-chain note

- New crate `robius-authentication@0.1.1` is **exact-pinned** (`=0.1.1`) under the
  macOS target. Its macOS deps (`objc2`, `objc2-foundation`,
  `objc2-local-authentication`, `block2`, `cfg-if`) are from the well-known
  `objc2` ecosystem. There is one **build-only** transitive dep, `android-build`,
  pulled into the build graph even on macOS (it runs only for Android targets);
  worth a glance before this becomes load-bearing.
- Before this crate ships in a real release (not a throwaway spike), run a
  `socket.dev` / crates.io provenance review and `cargo`/`pnpm audit signatures`.
- Repo guards remain intact: `.npmrc` keeps `save-exact=true` +
  `ignore-scripts=true`; the removed `security-framework` was dropped from
  `Cargo.toml` and `Cargo.lock` to avoid a dead dependency.
