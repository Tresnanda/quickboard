// SPIKE: throwaway, removed/replaced in Plan 2.
//
// Feasibility spike for Task 3: prove that the Rust backend can store a key in
// the macOS keychain behind a biometric / user-presence access-control gate,
// such that *reading* the item triggers a Touch ID (or device-passcode) prompt.
//
// API used (security-framework v3.7.0):
//   - `PasswordOptions::new_generic_password(service, account)`
//   - `PasswordOptions::set_access_control_options(AccessControlOptions::USER_PRESENCE)`
//       -> maps to `kSecAccessControlUserPresence`, i.e. an item whose access
//          requires biometry (Touch ID / Face ID) OR the device passcode.
//   - `set_generic_password_options(secret, options)` to create the item.
//   - `generic_password(options)` to read it back. THIS read is the call that
//       should surface the Touch ID prompt, because LocalAuthentication evaluates
//       the access-control object when the protected data is returned.
//
// The round-trip returns Ok(true) iff the secret read back matches the secret
// written. Any keychain failure is mapped to a String error.

#[cfg(target_os = "macos")]
use security_framework::passwords::{
    delete_generic_password, generic_password, set_generic_password_options, AccessControlOptions,
    PasswordOptions,
};

/// Stable identifiers for the spike keychain item.
#[cfg(target_os = "macos")]
const SPIKE_SERVICE: &str = "quickboard-spike";
#[cfg(target_os = "macos")]
const SPIKE_ACCOUNT: &str = "biometric-gate";
#[cfg(target_os = "macos")]
const SPIKE_SECRET: &[u8] = b"quickboard-ck-spike";

/// SPIKE round-trip: write a user-presence-gated generic password, then read it
/// back. The read call is what should trigger Touch ID. Returns Ok(true) when
/// the secret survives the round-trip unchanged.
#[cfg(target_os = "macos")]
pub fn biometric_roundtrip() -> Result<bool, String> {
    // Start clean: ignore "not found" so reruns don't fail on a stale item.
    // (delete itself does not require user presence.)
    let _ = delete_generic_password(SPIKE_SERVICE, SPIKE_ACCOUNT);

    // Build the create options with a user-presence / biometry access control.
    // USER_PRESENCE == kSecAccessControlUserPresence: biometry OR passcode.
    let mut options = PasswordOptions::new_generic_password(SPIKE_SERVICE, SPIKE_ACCOUNT);
    options.set_access_control_options(AccessControlOptions::USER_PRESENCE);

    // Create the protected item. This write does not prompt for Touch ID.
    set_generic_password_options(SPIKE_SECRET, options)
        .map_err(|e| format!("keychain write failed: {e} (code {})", e.code()))?;

    // Read it back. THIS is the call expected to prompt for Touch ID, because
    // the data is gated by the access-control object created above. We must
    // rebuild a fresh query (the create options were consumed by the write).
    let read_back = generic_password(PasswordOptions::new_generic_password(
        SPIKE_SERVICE,
        SPIKE_ACCOUNT,
    ))
    .map_err(|e| format!("keychain read failed: {e} (code {})", e.code()))?;

    Ok(read_back == SPIKE_SECRET)
}

/// Non-macOS fallback so the crate still compiles on other targets. The spike is
/// macOS-only; elsewhere it is simply unsupported.
#[cfg(not(target_os = "macos"))]
pub fn biometric_roundtrip() -> Result<bool, String> {
    Err("biometric spike is only supported on macOS".to_string())
}
