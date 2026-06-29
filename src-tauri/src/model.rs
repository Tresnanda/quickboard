use serde::{Deserialize, Serialize};

pub fn now_unix() -> i64 {
    use std::time::{SystemTime, UNIX_EPOCH};
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0)
}

#[derive(Serialize, Deserialize, Clone, PartialEq, Debug)]
pub enum Kind {
    Text,
    File,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct Item {
    pub id: String,
    pub label: String,
    pub kind: Kind,
    pub category: String,
    pub confidential: bool,
    pub pinned: bool,
    pub created_at: i64,
    pub updated_at: i64,
    pub last_used_at: i64,
    pub use_count: i64,
    pub environment: String,
    /// File items only: the stored mime (e.g. "image/png"), surfaced so the UI can
    /// classify by the file's real type rather than its title. `None` for text items
    /// and confidential files (whose metadata isn't bulk-decrypted on list).
    #[serde(default)]
    pub mime: Option<String>,
}
