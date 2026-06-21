//! AES-256-GCM authenticated encryption core.
//!
//! Layout of the on-disk/at-rest blob is `nonce (12 bytes) || ciphertext+tag`.
//! GCM appends a 16-byte authentication tag to the ciphertext, so any tampering
//! (including with the prepended nonce, which is fed in as the IV) causes
//! `decrypt` to return an `Err` rather than silently producing garbage plaintext.

use aes_gcm::{
    aead::{Aead, KeyInit},
    Aes256Gcm, Key, Nonce,
};
use rand::RngCore;

/// A 256-bit (32-byte) symmetric data-encryption key.
pub type DataKey = [u8; 32];

/// Generate a fresh random 256-bit key from the OS CSPRNG.
pub fn new_key() -> DataKey {
    let mut k = [0u8; 32];
    rand::thread_rng().fill_bytes(&mut k);
    k
}

/// Encrypt `plaintext` under `key`, returning `nonce || ciphertext+tag`.
///
/// A fresh random 96-bit nonce is generated per call and prepended to the
/// output. Returns `Err` if the underlying AEAD encryption fails.
pub fn encrypt(key: &DataKey, plaintext: &[u8]) -> Result<Vec<u8>, String> {
    let cipher = Aes256Gcm::new(Key::<Aes256Gcm>::from_slice(key));
    let mut nonce = [0u8; 12];
    rand::thread_rng().fill_bytes(&mut nonce);
    let ct = cipher
        .encrypt(Nonce::from_slice(&nonce), plaintext)
        .map_err(|e| e.to_string())?;
    let mut out = nonce.to_vec();
    out.extend_from_slice(&ct);
    Ok(out)
}

/// Decrypt a `nonce || ciphertext+tag` blob produced by [`encrypt`].
///
/// Returns `Err` if the blob is too short or if GCM authentication fails
/// (e.g. the ciphertext, tag, or nonce was tampered with, or the wrong key
/// was supplied).
pub fn decrypt(key: &DataKey, blob: &[u8]) -> Result<Vec<u8>, String> {
    if blob.len() < 12 {
        return Err("ciphertext too short: missing nonce".into());
    }
    let (nonce, ct) = blob.split_at(12);
    let cipher = Aes256Gcm::new(Key::<Aes256Gcm>::from_slice(key));
    cipher
        .decrypt(Nonce::from_slice(nonce), ct)
        .map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn roundtrip_and_tamper() {
        let key = new_key();
        let ct = encrypt(&key, b"sk-secret-value").unwrap();
        assert_eq!(decrypt(&key, &ct).unwrap(), b"sk-secret-value");
        // tampering the ciphertext must fail authentication
        let mut bad = ct.clone();
        let n = bad.len() - 1;
        bad[n] ^= 0xff;
        assert!(decrypt(&key, &bad).is_err());
    }
}
