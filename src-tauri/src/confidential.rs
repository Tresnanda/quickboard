// The Confidential biometric gate (R3). Began as a feasibility spike; now the
// live path that gates decrypt / release of confidential items behind Touch ID.
//
// It proves the Rust backend can trigger a Touch ID prompt that works under an
// UNSIGNED `tauri dev` binary, with NO keychain entitlement and NO code-signing.
//
// WHY THIS APPROACH (Path A — LocalAuthentication / LAContext):
//   The previous approach stored a biometric-gated item in the macOS keychain
//   (security-framework, kSecAccessControlUserPresence) and tried to surface
//   Touch ID on read. That FAILED under unsigned `tauri dev` with
//   `-34018 errSecMissingEntitlement`: protected keychain items require a
//   code-signed app carrying a `keychain-access-groups` entitlement.
//
//   Instead we call LocalAuthentication directly:
//   `LAContext.evaluatePolicy(.deviceOwnerAuthenticationWithBiometrics)`.
//   That API only drives the biometric subsystem to show the system Touch ID
//   prompt — it touches no protected keychain data — so it needs neither an
//   entitlement nor a signed binary. It works in plain unsigned `tauri dev`.
//
// IMPLEMENTATION:
//   We use the `robius-authentication` crate (v0.1.1), which wraps
//   `objc2-local-authentication` (the LAContext binding). It is cross-platform
//   (Touch ID / Face ID / Windows Hello / polkit), which aligns with our future
//   cross-platform goal, and exposes a synchronous `blocking_authenticate` that
//   internally bridges the async LAContext completion handler for us — so we
//   don't have to block on a channel ourselves.

#[cfg(target_os = "macos")]
use robius_authentication::{
    AndroidText, BiometricStrength, Context, PolicyBuilder, Text, WindowsText,
};

/// Trigger a Touch ID system prompt via LocalAuthentication (LAContext).
///
/// Returns `Ok(true)` when the user authenticates successfully, and `Err(msg)`
/// on cancel or any failure. Requires NO keychain entitlement and NO
/// code-signing, so it works under unsigned `tauri dev`.
///
/// The live Confidential gate: callers require a successful return before
/// decrypting or releasing a confidential item.
#[cfg(target_os = "macos")]
pub fn biometric_roundtrip() -> Result<bool, String> {
    // Build a policy that requests biometrics (Touch ID). We also allow the
    // device-password fallback so a Mac without an enrolled finger (or after
    // too many failed scans) can still satisfy the prompt. On macOS the
    // `BiometricStrength` value is ignored (it only matters on Android).
    let policy = PolicyBuilder::new()
        .biometrics(Some(BiometricStrength::Strong))
        .password(true)
        .build()
        .ok_or_else(|| "failed to build a valid authentication policy".to_string())?;

    // `Text` is platform-agnostic, so all three platform fields must be
    // populated even though only `apple` is shown on macOS. The macOS Touch ID
    // prompt renders this as "<app> is trying to <text>", so phrase it as a
    // verb phrase / reason.
    let reason = "Unlock your confidential items";
    let text = Text {
        android: AndroidText {
            title: reason,
            subtitle: None,
            description: None,
        },
        apple: reason,
        windows: WindowsText::new_truncated("QuickBoard", reason),
    };

    // `RawContext` is `()` on every current platform. `blocking_authenticate`
    // shows the system Touch ID prompt and blocks until the user responds.
    // Success => Ok(()); any failure/cancel => Err(Error) (Debug-only, no
    // Display), so format it with `{:?}`.
    match Context::new(()).blocking_authenticate(text, &policy) {
        Ok(()) => Ok(true),
        Err(e) => Err(format!("biometric auth failed: {e:?}")),
    }
}

/// Non-macOS fallback so the crate still compiles on other targets.
/// macOS-only; elsewhere it is simply unsupported.
#[cfg(not(target_os = "macos"))]
pub fn biometric_roundtrip() -> Result<bool, String> {
    Err("biometric spike is only supported on macOS".to_string())
}
