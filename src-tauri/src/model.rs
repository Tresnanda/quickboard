use serde::{Deserialize, Serialize};

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
}
