use rusqlite::Connection;

use crate::crypto::{decrypt, encrypt, DataKey};
use crate::model::{now_unix, Item, Kind};

pub struct Store {
    conn: Connection,
    key: DataKey,
}

impl Store {
    pub fn open_in_memory(key: DataKey) -> Result<Self, String> {
        Self::init(
            Connection::open_in_memory().map_err(|e| e.to_string())?,
            key,
        )
    }

    pub fn open(path: &str, key: DataKey) -> Result<Self, String> {
        Self::init(
            Connection::open(path).map_err(|e| e.to_string())?,
            key,
        )
    }

    fn init(conn: Connection, key: DataKey) -> Result<Self, String> {
        conn.execute_batch(
            "CREATE TABLE IF NOT EXISTS items(
               id TEXT PRIMARY KEY, label TEXT, kind TEXT, category TEXT,
               confidential INTEGER, pinned INTEGER, body BLOB,
               created_at INTEGER, updated_at INTEGER, last_used_at INTEGER, use_count INTEGER);",
        )
        .map_err(|e| e.to_string())?;
        Ok(Self { conn, key })
    }

    pub fn add_text(
        &self,
        label: &str,
        category: &str,
        confidential: bool,
        value: &str,
    ) -> Result<String, String> {
        self.add_text_at(label, category, confidential, value, now_unix())
    }

    pub fn add_text_at(
        &self,
        label: &str,
        category: &str,
        confidential: bool,
        value: &str,
        now: i64,
    ) -> Result<String, String> {
        let id = uuid::Uuid::new_v4().to_string();
        let body = encrypt(&self.key, value.as_bytes())?;
        self.conn
            .execute(
                "INSERT INTO items VALUES(?1,?2,'Text',?3,?4,0,?5,?6,?6,?6,0)",
                rusqlite::params![id, label, category, confidential as i64, body, now],
            )
            .map_err(|e| e.to_string())?;
        Ok(id)
    }

    pub fn set_pinned(&self, id: &str, pinned: bool) -> Result<(), String> {
        self.conn
            .execute(
                "UPDATE items SET pinned=?1, updated_at=?2 WHERE id=?3",
                rusqlite::params![pinned as i64, now_unix(), id],
            )
            .map_err(|e| e.to_string())?;
        Ok(())
    }

    pub fn delete(&self, id: &str) -> Result<(), String> {
        self.conn
            .execute("DELETE FROM items WHERE id=?1", [id])
            .map_err(|e| e.to_string())?;
        Ok(())
    }

    pub fn touch_used(&self, id: &str) -> Result<(), String> {
        self.conn
            .execute(
                "UPDATE items SET last_used_at=?1, use_count=use_count+1 WHERE id=?2",
                rusqlite::params![now_unix(), id],
            )
            .map_err(|e| e.to_string())?;
        Ok(())
    }

    pub fn list(&self) -> Result<Vec<Item>, String> {
        let mut stmt = self
            .conn
            .prepare(
                "SELECT id,label,category,confidential,pinned,created_at,updated_at,last_used_at,use_count FROM items",
            )
            .map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map([], |r| {
                Ok(Item {
                    id: r.get(0)?,
                    label: r.get(1)?,
                    kind: Kind::Text,
                    category: r.get(2)?,
                    confidential: r.get::<_, i64>(3)? != 0,
                    pinned: r.get::<_, i64>(4)? != 0,
                    created_at: r.get(5)?,
                    updated_at: r.get(6)?,
                    last_used_at: r.get(7)?,
                    use_count: r.get(8)?,
                })
            })
            .map_err(|e| e.to_string())?;
        rows.collect::<Result<_, _>>().map_err(|e| e.to_string())
    }

    pub fn get_text(&self, id: &str) -> Result<String, String> {
        let body: Vec<u8> = self
            .conn
            .query_row("SELECT body FROM items WHERE id=?1", [id], |r| r.get(0))
            .map_err(|e| e.to_string())?;
        let pt = decrypt(&self.key, &body)?;
        String::from_utf8(pt).map_err(|e| e.to_string())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::crypto::new_key;

    #[test]
    fn add_then_list_and_decrypt() {
        let key = new_key();
        let store = Store::open_in_memory(key).unwrap();
        let id = store
            .add_text("BCA IBAN", "Finance", false, "ID1234567890")
            .unwrap();
        let items = store.list().unwrap();
        assert_eq!(items.len(), 1);
        assert_eq!(items[0].label, "BCA IBAN");
        assert_eq!(store.get_text(&id).unwrap(), "ID1234567890"); // decrypts
    }

    #[test]
    fn timestamps_are_set_and_update_pins() {
        let s = Store::open_in_memory(crate::crypto::new_key()).unwrap();
        let id = s.add_text_at("Plate", "Home", false, "B1234XYZ", 1_700_000_000).unwrap();
        let items = s.list().unwrap();
        assert_eq!(items[0].created_at, 1_700_000_000);
        assert!(!items[0].pinned);
        s.set_pinned(&id, true).unwrap();
        assert!(s.list().unwrap()[0].pinned);
        s.delete(&id).unwrap();
        assert_eq!(s.list().unwrap().len(), 0);
    }
}
