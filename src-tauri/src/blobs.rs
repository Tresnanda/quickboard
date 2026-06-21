use std::path::{Path, PathBuf};
use crate::crypto::{DataKey, encrypt, decrypt};

pub fn write_blob(dir: &Path, key: DataKey, id: &str, plaintext: &[u8]) -> Result<(), String> {
    std::fs::create_dir_all(dir).map_err(|e| e.to_string())?;
    let ct = encrypt(&key, plaintext)?;
    std::fs::write(dir.join(format!("{id}.bin")), ct).map_err(|e| e.to_string())
}

pub fn read_blob(dir: &Path, key: DataKey, id: &str) -> Result<Vec<u8>, String> {
    let ct = std::fs::read(dir.join(format!("{id}.bin"))).map_err(|e| e.to_string())?;
    decrypt(&key, &ct)
}

pub fn delete_blob(dir: &Path, id: &str) -> Result<(), String> {
    let p: PathBuf = dir.join(format!("{id}.bin"));
    if p.exists() { std::fs::remove_file(p).map_err(|e| e.to_string())?; }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn blob_roundtrip_is_encrypted_on_disk() {
        let dir = std::env::temp_dir().join("qb-blobtest");
        std::fs::create_dir_all(&dir).unwrap();
        let key = crate::crypto::new_key();
        let id = "blob1";
        write_blob(&dir, key, id, b"PNGDATA-secret").unwrap();
        let on_disk = std::fs::read(dir.join(format!("{id}.bin"))).unwrap();
        assert_ne!(on_disk, b"PNGDATA-secret"); // ciphertext, not plaintext
        assert_eq!(read_blob(&dir, key, id).unwrap(), b"PNGDATA-secret");
        std::fs::remove_dir_all(&dir).ok();
    }
}
