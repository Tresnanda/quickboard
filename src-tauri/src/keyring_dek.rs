//! Persistence of the Data Encryption Key (DEK) in the OS keyring.
//!
//! The DEK (a 256-bit [`DataKey`] from [`crate::crypto`]) is the symmetric key
//! used to encrypt secrets at rest. We never write it to disk in plaintext;
//! instead it lives in the OS-native credential store (the macOS login
//! keychain via keyring's `apple-native` backend), base64-encoded because the
//! keychain stores passwords as UTF-8 strings.
//!
//! [`load_or_create_dek`] is idempotent per service: the first call mints a
//! fresh key and stores it; every later call returns the same stored key.

use crate::crypto::{new_key, DataKey};
use base64::{engine::general_purpose::STANDARD, Engine};
use keyring::Entry;

/// Username component stored alongside the service in the keyring entry. The
/// DEK is a singleton per service, so a fixed account name is sufficient.
const ACCOUNT: &str = "dek";

/// Load the DEK for `service` from the OS keyring, creating and persisting a
/// fresh one on first use.
///
/// Returns the same 32-byte key on every call for a given `service`. Errors if
/// the keyring is unreachable, the stored value is malformed, or it does not
/// decode to exactly 32 bytes.
pub fn load_or_create_dek(service: &str) -> Result<DataKey, String> {
    let entry = Entry::new(service, ACCOUNT).map_err(|e| e.to_string())?;
    load_or_create_in(&entry)
}

/// Core load-or-create logic against an already-constructed [`Entry`].
///
/// Split out so tests can drive a single shared `Entry`: keyring's in-memory
/// mock store gives every `Entry::new` call a fresh, empty credential
/// (`CredentialPersistence::EntryOnly`), so reusing one `Entry` is the only way
/// to exercise the load-after-create round-trip without the real keychain. The
/// real OS backends persist by service/account, so production callers see the
/// same idempotent behaviour through [`load_or_create_dek`].
fn load_or_create_in(entry: &Entry) -> Result<DataKey, String> {
    match resolve_dek(entry.get_password())? {
        Some(k) => Ok(k),
        None => {
            let k = new_key();
            entry
                .set_password(&STANDARD.encode(k))
                .map_err(|e| e.to_string())?;
            Ok(k)
        }
    }
}

/// Interpret a keyring read into a non-destructive decision, performing no
/// writes of its own.
///
/// - `Ok(Some(key))` — a valid 32-byte DEK was decoded; use it as-is.
/// - `Ok(None)` — the keyring reports genuinely no stored entry
///   ([`keyring::Error::NoEntry`]); the caller may mint and persist a fresh key.
/// - `Err(_)` — the read failed for any other reason (locked keychain, denied
///   access prompt, transient platform failure) or the stored value is
///   malformed. The caller must **not** mint a new key: an existing DEK may
///   simply be unreadable right now, and overwriting it would permanently
///   brick the vault. The error string never contains key material.
fn resolve_dek(read: Result<String, keyring::Error>) -> Result<Option<DataKey>, String> {
    match read {
        Ok(b64) => {
            let bytes = STANDARD.decode(b64).map_err(|e| e.to_string())?;
            if bytes.len() != 32 {
                return Err("bad DEK length".into());
            }
            let mut k = [0u8; 32];
            k.copy_from_slice(&bytes);
            Ok(Some(k))
        }
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(e) => Err(format!("keychain read failed: {e}")),
    }
}

/// Delete the persisted DEK for `service` from the OS keyring.
///
/// Returns `Err` if the keyring is unreachable; deleting a non-existent entry
/// surfaces the backend's "no entry" error.
pub fn delete_dek(service: &str) -> Result<(), String> {
    Entry::new(service, ACCOUNT)
        .map_err(|e| e.to_string())?
        .delete_credential()
        .map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Install keyring's in-memory mock credential store so these tests never
    /// touch the real macOS keychain (which would pop a GUI "allow access"
    /// dialog and hang a headless run). keyring 3.2.0 ships `mock` without a
    /// cargo feature gate. `set_default_credential_builder` is process-global
    /// and idempotent across tests in this binary.
    fn install_mock_store() {
        keyring::set_default_credential_builder(keyring::mock::default_credential_builder());
    }

    #[test]
    fn loads_same_key_twice() {
        install_mock_store();
        // keyring's mock store hands every `Entry::new` a fresh, empty
        // credential, so we share one `Entry` to exercise create-then-load.
        // On the real OS backend `load_or_create_dek(service)` is idempotent on
        // its own because the keychain persists by service/account.
        let entry = Entry::new("quickboard-test", ACCOUNT).unwrap();
        let k1 = load_or_create_in(&entry).unwrap(); // create + persist
        let k2 = load_or_create_in(&entry).unwrap(); // load existing
        assert_eq!(k1, k2);
        entry.delete_credential().ok();
    }

    #[test]
    fn bad_dek_length_is_rejected() {
        install_mock_store();
        let entry = Entry::new("quickboard-badlen", ACCOUNT).unwrap();
        // 16 bytes, not 32 — must be rejected on load.
        entry.set_password(&STANDARD.encode([7u8; 16])).unwrap();
        assert!(load_or_create_in(&entry).is_err());
        entry.delete_credential().ok();
    }

    #[test]
    fn no_entry_read_signals_mint() {
        // A genuine "no stored credential" is the ONLY case that permits
        // minting a fresh key: resolve_dek returns Ok(None).
        assert_eq!(resolve_dek(Err(keyring::Error::NoEntry)).unwrap(), None);
    }

    #[test]
    fn non_noentry_error_is_not_swallowed() {
        // Any read failure other than NoEntry must surface as Err so the caller
        // aborts instead of overwriting an existing, merely-unreadable DEK.
        // NoStorageAccess stands in for a locked keychain / denied prompt.
        let err = resolve_dek(Err(keyring::Error::NoStorageAccess(Box::new(
            std::io::Error::new(std::io::ErrorKind::PermissionDenied, "locked"),
        ))));
        assert!(err.is_err());
    }

    /// Round-trips the public API against the REAL OS keychain. Ignored so
    /// `cargo test` stays non-interactive: on macOS this can pop a GUI "allow
    /// access" dialog. Run manually with:
    ///   cargo test keyring_dek -- --ignored --exact \
    ///     keyring_dek::tests::real_keychain_round_trip
    #[test]
    #[ignore] // requires interactive session — run manually; uses real OS keychain
    fn real_keychain_round_trip() {
        let service = "quickboard-real-keychain-test";
        let k1 = load_or_create_dek(service).unwrap();
        let k2 = load_or_create_dek(service).unwrap();
        assert_eq!(k1, k2);
        delete_dek(service).unwrap();
    }
}
