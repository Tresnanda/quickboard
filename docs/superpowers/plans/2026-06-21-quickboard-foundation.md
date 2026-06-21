# Quickboard Foundation & Spikes — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Scaffold the Tauri/React project, prove the two highest-risk capabilities (file drag-out, Touch ID-gated decrypt), and build a tested encrypted item store with core IPC — the foundation later UI plans build on.

**Architecture:** Tauri v2 app — Rust backend owns storage (SQLite via `rusqlite`), crypto (`aes-gcm`), the Data Encryption Key (`keyring`), the Confidential Key behind biometrics (`security-framework`), and file drag-out (community plugin). The React/Vite frontend talks to it over Tauri IPC commands. This plan ends with a throwaway harness UI that exercises the backend end-to-end; the real UI comes in Plan 2.

**Tech Stack:** Tauri v2, Rust (`rusqlite`, `aes-gcm`, `keyring`, `security-framework`), React 18 + TypeScript + Vite + TanStack Router + shadcn/ui + Tailwind + Lucide, pnpm 11.

**Spec:** `docs/superpowers/specs/2026-06-21-quickboard-design.md`

---

## File structure (locked here)

```
quickboard/
  src-tauri/
    Cargo.toml
    src/
      lib.rs            # Tauri builder, command registration
      crypto.rs         # AES-256-GCM encrypt/decrypt, DEK handling
      keyring_dek.rs    # store/load the Data Encryption Key in OS keyring
      confidential.rs   # Confidential Key behind biometric access control (macOS)
      store.rs          # SQLite schema + Item CRUD (ciphertext bodies)
      commands.rs       # IPC commands (add_item, list_items, get_value, ...)
      model.rs          # Item / Category structs shared by store + commands
  src/                  # React frontend
    main.tsx
    router.tsx
    harness/Harness.tsx # throwaway end-to-end test UI (deleted in Plan 2)
  package.json
  .npmrc
  .gitignore
```

---

### Task 1: Project scaffold + supply-chain hardening

**Files:**
- Create: whole `quickboard/` Tauri project, `.gitignore`, `.npmrc`

- [ ] **Step 1: Scaffold Tauri v2 + React/TS/Vite with pnpm**

Run from `/Users/mymac/projects/quickboard` (dir already exists; scaffold in place into a temp then move, or scaffold into `.`):
```bash
corepack enable
corepack use pnpm@11
pnpm config set save-exact true
pnpm create tauri-app@latest . --template react-ts --manager pnpm
```
If the dir-not-empty prompt appears (the `docs/` and `.superpowers/` dirs exist), choose to proceed/merge.

- [ ] **Step 2: Add the supply-chain guards**

Create `.npmrc`:
```
save-exact=true
ignore-scripts=true
```
Then in `package.json`, ensure no `^`/`~` on any version (pin exact), and add an allowlist for build scripts you trust as you add them:
```json
"pnpm": { "onlyBuiltDependencies": ["esbuild"] }
```

- [ ] **Step 3: Add `.gitignore`**

Create `.gitignore`:
```
node_modules/
dist/
src-tauri/target/
.superpowers/
.DS_Store
*.log
```

- [ ] **Step 4: Verify the app runs**

Run: `pnpm tauri dev`
Expected: a window opens with the default Tauri+React page. Close it.

- [ ] **Step 5: Add Tailwind + shadcn + TanStack Router + Lucide**

```bash
pnpm add -D tailwindcss@latest postcss@latest autoprefixer@latest
pnpm add @tanstack/react-router lucide-react
pnpm dlx shadcn@latest init
```
Configure Tailwind per shadcn output. Add Plus Jakarta Sans via `@fontsource/plus-jakarta-sans` (`pnpm add @fontsource/plus-jakarta-sans`) and import it in `main.tsx`.

- [ ] **Step 6: Commit**

```bash
git init
git config user.name "Treshnanda"
git config user.email "treshnanda@gmail.com"
git add -A
git commit -m "chore: scaffold Tauri v2 + React/Vite, supply-chain guards, design spec"
```

---

### Task 2: SPIKE — file drag-out of the Tauri window

**Goal:** Prove a file drags out of the webview into Finder / a browser upload field. This is a feasibility spike, not TDD — definition of done is a working manual demo.

**Files:**
- Modify: `package.json` (add drag plugin), `src/harness/Harness.tsx`

- [ ] **Step 1: Vet and add the drag plugin**

Check `socket.dev/npm/package/@crabnebula/tauri-plugin-drag` (and its Rust crate) for advisories before installing. Then:
```bash
pnpm add @crabnebula/tauri-plugin-drag
# add the matching Rust crate to src-tauri/Cargo.toml (pinned exact version)
```
Register the plugin in `src-tauri/src/lib.rs` builder and run `pnpm audit signatures`.

- [ ] **Step 2: Bundle a test file**

Place a small `sample-id.png` in `src-tauri/` resources (configure `tauri.conf.json` `bundle.resources`).

- [ ] **Step 3: Add a "Drag me out" element in the harness**

```tsx
import { startDrag } from "@crabnebula/tauri-plugin-drag";
// ...
<div
  draggable
  onDragStart={() => startDrag({ item: [absolutePathToSampleId], icon: absolutePathToSampleId })}
  className="border rounded p-3 w-40 text-center select-none"
>
  Drag sample-id.png out →
</div>
```

- [ ] **Step 4: Manually verify (definition of done)**

Run `pnpm tauri dev`. Drag the element into (a) Finder, (b) a browser file-upload field, (c) a Slack/Mail compose. Record results in a new `docs/superpowers/spikes/drag-out.md` (works? drag preview ok? multi-file?).
Expected: file lands in at least Finder + one upload field.

- [ ] **Step 5: Fallback note if it fails**

If the plugin can't drag into native targets, document it in the spike file and STOP — escalate to the user (this is the moment we'd reconsider Tauri vs Swift). Do not proceed to Task 3.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "spike: prove file drag-out from Tauri window"
```

---

### Task 3: SPIKE — Touch ID-gated key on macOS

**Goal:** Prove the Rust backend can store a key in the macOS keychain behind biometric access control such that reading it triggers Touch ID. Feasibility spike.

**Files:**
- Create: `src-tauri/src/confidential.rs`
- Modify: `src-tauri/Cargo.toml`, `src-tauri/src/lib.rs`, `src/harness/Harness.tsx`

- [ ] **Step 1: Add the crate**

In `src-tauri/Cargo.toml` (pinned exact):
```toml
[target.'cfg(target_os = "macos")'.dependencies]
security-framework = "=2.11.1"
```

- [ ] **Step 2: Write a biometric-gated store/read in `confidential.rs`**

```rust
// Stores a secret in the macOS keychain with biometric access control,
// then reads it back (the read triggers Touch ID).
#[cfg(target_os = "macos")]
pub fn spike_roundtrip(secret: &[u8]) -> Result<Vec<u8>, String> {
    use security_framework::access_control::{SecAccessControl, ProtectionMode};
    use security_framework::passwords_options::PasswordOptions;
    // Create access control requiring user presence / biometry.
    let ac = SecAccessControl::create_with_protection(
        Some(ProtectionMode::AccessibleWhenUnlockedThisDeviceOnly),
        // biometry-or-passcode flag:
        1 << 0, // kSecAccessControlUserPresence
    ).map_err(|e| e.to_string())?;
    let mut opts = PasswordOptions::new_generic_password("quickboard-spike", "ck");
    opts.set_access_control(ac);
    // set + get; the get call should prompt Touch ID
    security_framework::passwords::set_generic_password_options(secret, opts.clone())
        .map_err(|e| e.to_string())?;
    let got = security_framework::passwords::get_generic_password("quickboard-spike", "ck")
        .map_err(|e| e.to_string())?;
    Ok(got)
}
```
> Exact `security-framework` API names may differ by version — adjust to the installed version's signatures; the requirement is: keychain item created with a user-presence/biometry access-control flag, and a read that prompts Touch ID.

- [ ] **Step 3: Expose a temporary IPC command + harness button**

Add `#[tauri::command] fn spike_biometric() -> Result<bool, String>` calling `spike_roundtrip(b"hello")` and returning `Ok(got == b"hello")`. Add a harness button that invokes it.

- [ ] **Step 4: Manually verify (definition of done)**

Run `pnpm tauri dev`, click the button. Expected: a Touch ID prompt appears; on success the call returns true. Record in `docs/superpowers/spikes/biometric-gate.md`.

- [ ] **Step 5: Fallback note if it fails**

If no Touch ID prompt / unsupported in the Tauri process, document and escalate to the user before proceeding (we may need a small standalone Swift helper). 

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "spike: prove Touch ID-gated keychain read on macOS"
```

---

### Task 4: Crypto core (AES-256-GCM)

**Files:**
- Create: `src-tauri/src/crypto.rs`
- Test: inline `#[cfg(test)]` in `crypto.rs`

- [ ] **Step 1: Add crate**

`src-tauri/Cargo.toml` (pinned): `aes-gcm = "=0.10.3"`, `rand = "=0.8.5"`.

- [ ] **Step 2: Write the failing test**

```rust
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
        let n = bad.len() - 1; bad[n] ^= 0xff;
        assert!(decrypt(&key, &bad).is_err());
    }
}
```

- [ ] **Step 3: Run it (fails to compile / undefined)**

Run: `cargo test --manifest-path src-tauri/Cargo.toml crypto`
Expected: FAIL (functions undefined).

- [ ] **Step 4: Implement**

```rust
use aes_gcm::{Aes256Gcm, Key, Nonce, aead::{Aead, KeyInit}};
use rand::RngCore;

pub type DataKey = [u8; 32];

pub fn new_key() -> DataKey { let mut k = [0u8; 32]; rand::thread_rng().fill_bytes(&mut k); k }

pub fn encrypt(key: &DataKey, plaintext: &[u8]) -> Result<Vec<u8>, String> {
    let cipher = Aes256Gcm::new(Key::<Aes256Gcm>::from_slice(key));
    let mut nonce = [0u8; 12]; rand::thread_rng().fill_bytes(&mut nonce);
    let ct = cipher.encrypt(Nonce::from_slice(&nonce), plaintext).map_err(|e| e.to_string())?;
    let mut out = nonce.to_vec(); out.extend_from_slice(&ct); Ok(out) // nonce||ciphertext
}

pub fn decrypt(key: &DataKey, blob: &[u8]) -> Result<Vec<u8>, String> {
    if blob.len() < 12 { return Err("too short".into()); }
    let (nonce, ct) = blob.split_at(12);
    let cipher = Aes256Gcm::new(Key::<Aes256Gcm>::from_slice(key));
    cipher.decrypt(Nonce::from_slice(nonce), ct).map_err(|e| e.to_string())
}
```

- [ ] **Step 5: Run it (passes)**

Run: `cargo test --manifest-path src-tauri/Cargo.toml crypto`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "feat: AES-256-GCM crypto core with round-trip + tamper tests"
```

---

### Task 5: Data Encryption Key in OS keyring

**Files:**
- Create: `src-tauri/src/keyring_dek.rs`

- [ ] **Step 1: Add crate**

`src-tauri/Cargo.toml` (pinned): `keyring = "=3.2.0"`.

- [ ] **Step 2: Write the failing test**

```rust
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn loads_same_key_twice() {
        let k1 = load_or_create_dek("quickboard-test").unwrap();
        let k2 = load_or_create_dek("quickboard-test").unwrap();
        assert_eq!(k1, k2);
        delete_dek("quickboard-test").ok();
    }
}
```

- [ ] **Step 3: Run it — FAIL (undefined).** `cargo test --manifest-path src-tauri/Cargo.toml keyring_dek`

- [ ] **Step 4: Implement**

```rust
use crate::crypto::{DataKey, new_key};
use keyring::Entry;
use base64::{Engine, engine::general_purpose::STANDARD};

pub fn load_or_create_dek(service: &str) -> Result<DataKey, String> {
    let entry = Entry::new(service, "dek").map_err(|e| e.to_string())?;
    match entry.get_password() {
        Ok(b64) => {
            let bytes = STANDARD.decode(b64).map_err(|e| e.to_string())?;
            let mut k = [0u8; 32]; k.copy_from_slice(&bytes); Ok(k)
        }
        Err(_) => {
            let k = new_key();
            entry.set_password(&STANDARD.encode(k)).map_err(|e| e.to_string())?;
            Ok(k)
        }
    }
}
pub fn delete_dek(service: &str) -> Result<(), String> {
    Entry::new(service, "dek").map_err(|e| e.to_string())?.delete_credential().map_err(|e| e.to_string())
}
```
Add `base64 = "=0.22.1"` to Cargo.toml.

- [ ] **Step 5: Run it — PASS.** Same command. (May prompt keychain access on first run; allow.)

- [ ] **Step 6: Commit.** `git add -A && git commit -m "feat: persist Data Encryption Key in OS keyring"`

---

### Task 6: SQLite store + Item CRUD

**Files:**
- Create: `src-tauri/src/model.rs`, `src-tauri/src/store.rs`

- [ ] **Step 1: Add crate**

`src-tauri/Cargo.toml` (pinned): `rusqlite = { version = "=0.32.1", features = ["bundled"] }`, `serde = { version = "=1.0.210", features = ["derive"] }`, `uuid = { version = "=1.10.0", features = ["v4"] }`.

- [ ] **Step 2: Define the model (`model.rs`)**

```rust
use serde::{Serialize, Deserialize};

#[derive(Serialize, Deserialize, Clone, PartialEq, Debug)]
pub enum Kind { Text, File }

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct Item {
    pub id: String,
    pub label: String,
    pub kind: Kind,
    pub category: String,
    pub confidential: bool,
    pub pinned: bool,
    // body stored encrypted; for File this is the blob path's metadata JSON (also encrypted)
    pub created_at: i64,
    pub updated_at: i64,
    pub last_used_at: i64,
    pub use_count: i64,
}
```

- [ ] **Step 3: Write the failing test (`store.rs`)**

```rust
#[cfg(test)]
mod tests {
    use super::*;
    use crate::crypto::new_key;
    #[test]
    fn add_then_list_and_decrypt() {
        let key = new_key();
        let store = Store::open_in_memory(key).unwrap();
        let id = store.add_text("BCA IBAN", "Finance", false, "ID1234567890").unwrap();
        let items = store.list().unwrap();
        assert_eq!(items.len(), 1);
        assert_eq!(items[0].label, "BCA IBAN");
        assert_eq!(store.get_text(&id).unwrap(), "ID1234567890"); // decrypts
    }
}
```

- [ ] **Step 4: Run it — FAIL.** `cargo test --manifest-path src-tauri/Cargo.toml store`

- [ ] **Step 5: Implement the store**

```rust
use rusqlite::Connection;
use crate::crypto::{DataKey, encrypt, decrypt};
use crate::model::{Item, Kind};

pub struct Store { conn: Connection, key: DataKey }

impl Store {
    pub fn open_in_memory(key: DataKey) -> Result<Self, String> { Self::init(Connection::open_in_memory().map_err(|e| e.to_string())?, key) }
    pub fn open(path: &str, key: DataKey) -> Result<Self, String> { Self::init(Connection::open(path).map_err(|e| e.to_string())?, key) }

    fn init(conn: Connection, key: DataKey) -> Result<Self, String> {
        conn.execute_batch(
            "CREATE TABLE IF NOT EXISTS items(
               id TEXT PRIMARY KEY, label TEXT, kind TEXT, category TEXT,
               confidential INTEGER, pinned INTEGER, body BLOB,
               created_at INTEGER, updated_at INTEGER, last_used_at INTEGER, use_count INTEGER);"
        ).map_err(|e| e.to_string())?;
        Ok(Self { conn, key })
    }

    pub fn add_text(&self, label: &str, category: &str, confidential: bool, value: &str) -> Result<String, String> {
        let id = uuid::Uuid::new_v4().to_string();
        let body = encrypt(&self.key, value.as_bytes())?;
        let now = 0i64; // real timestamp injected by caller in command layer
        self.conn.execute(
            "INSERT INTO items VALUES(?1,?2,'Text',?3,?4,0,?5,?6,?6,?6,0)",
            rusqlite::params![id, label, category, confidential as i64, body, now],
        ).map_err(|e| e.to_string())?;
        Ok(id)
    }

    pub fn list(&self) -> Result<Vec<Item>, String> {
        let mut stmt = self.conn.prepare(
            "SELECT id,label,category,confidential,pinned,created_at,updated_at,last_used_at,use_count FROM items"
        ).map_err(|e| e.to_string())?;
        let rows = stmt.query_map([], |r| Ok(Item {
            id: r.get(0)?, label: r.get(1)?, kind: Kind::Text, category: r.get(2)?,
            confidential: r.get::<_,i64>(3)? != 0, pinned: r.get::<_,i64>(4)? != 0,
            created_at: r.get(5)?, updated_at: r.get(6)?, last_used_at: r.get(7)?, use_count: r.get(8)?,
        })).map_err(|e| e.to_string())?;
        rows.collect::<Result<_,_>>().map_err(|e| e.to_string())
    }

    pub fn get_text(&self, id: &str) -> Result<String, String> {
        let body: Vec<u8> = self.conn.query_row(
            "SELECT body FROM items WHERE id=?1", [id], |r| r.get(0)
        ).map_err(|e| e.to_string())?;
        let pt = decrypt(&self.key, &body)?;
        String::from_utf8(pt).map_err(|e| e.to_string())
    }
}
```
> `kind` is read back as `Text` here; File support lands when Plan 2 wires file blobs. Timestamps are set in the command layer (Task 7) where wall-clock is available.

- [ ] **Step 6: Run it — PASS.** Same command.

- [ ] **Step 7: Commit.** `git add -A && git commit -m "feat: encrypted SQLite item store with add/list/get_text + tests"`

---

### Task 7: Core IPC commands

**Files:**
- Create: `src-tauri/src/commands.rs`
- Modify: `src-tauri/src/lib.rs` (manage state, register commands)

- [ ] **Step 1: App state holding the open Store**

In `lib.rs`, on setup: `let key = keyring_dek::load_or_create_dek("quickboard")?; let store = Store::open(&db_path, key)?;` and `app.manage(Mutex::new(store));`. Compute `db_path` from `app.path().app_data_dir()`.

- [ ] **Step 2: Commands (`commands.rs`)**

```rust
use std::sync::Mutex;
use tauri::State;
use crate::store::Store;
use crate::model::Item;

#[tauri::command]
pub fn list_items(store: State<Mutex<Store>>) -> Result<Vec<Item>, String> {
    store.lock().unwrap().list()
}

#[tauri::command]
pub fn add_text_item(store: State<Mutex<Store>>, label: String, category: String, confidential: bool, value: String) -> Result<String, String> {
    store.lock().unwrap().add_text(&label, &category, confidential, &value)
}

#[tauri::command]
pub fn get_text_value(store: State<Mutex<Store>>, id: String) -> Result<String, String> {
    // Plan 2 will add: if item.confidential -> require biometric unlock before this returns.
    store.lock().unwrap().get_text(&id)
}
```
Register all three in the `invoke_handler` in `lib.rs`.

- [ ] **Step 3: Build check**

Run: `cargo build --manifest-path src-tauri/Cargo.toml`
Expected: compiles.

- [ ] **Step 4: Commit.** `git add -A && git commit -m "feat: core IPC commands (list/add/get text items)"`

---

### Task 8: End-to-end harness + manual verification

**Files:**
- Modify: `src/harness/Harness.tsx`, route it as the temporary home in `router.tsx`

- [ ] **Step 1: Harness UI calling the IPC**

```tsx
import { invoke } from "@tauri-apps/api/core";
import { useEffect, useState } from "react";
type Item = { id: string; label: string; category: string; confidential: boolean };

export function Harness() {
  const [items, setItems] = useState<Item[]>([]);
  const refresh = () => invoke<Item[]>("list_items").then(setItems);
  useEffect(() => { refresh(); }, []);
  return (
    <div className="p-6 space-y-3">
      <button onClick={async () => {
        await invoke("add_text_item", { label: "BCA IBAN", category: "Finance", confidential: false, value: "ID1234567890" });
        refresh();
      }}>Add sample item</button>
      <ul>{items.map(i => (
        <li key={i.id}>
          {i.label} — <button onClick={async () => navigator.clipboard.writeText(await invoke<string>("get_text_value", { id: i.id }))}>copy</button>
        </li>
      ))}</ul>
    </div>
  );
}
```

- [ ] **Step 2: Manually verify the full loop**

Run `pnpm tauri dev`. Click "Add sample item" → it appears in the list → click "copy" → paste elsewhere → value is `ID1234567890`. Restart the app → the item persists (came from disk + keyring DEK).
Expected: add → list → decrypt-copy → persist all work.

- [ ] **Step 3: Commit.** `git add -A && git commit -m "chore: end-to-end harness exercising the encrypted store over IPC"`

---

## Self-review (done)

- **Spec coverage:** scaffold ✓, drag-out spike ✓ (spec §9.1), biometric spike ✓ (§9.2), encryption-at-rest/DEK ✓ (§6), encrypted store + item model ✓ (§4, §8), core IPC ✓ (§7), supply-chain pnpm/pins ✓ (§11). UI surfaces, launcher, shelf, confidential session window, clipboard auto-clear, drag-out temp-file flow → **deferred to Plans 2–3 by design** (depend on spike outcomes).
- **Placeholders:** none — every code step has real code; spikes have explicit definition-of-done + fallback. The one flagged unknown (`security-framework` exact API names) is called out with the invariant to satisfy, not left blank.
- **Type consistency:** `Item`, `Kind`, `DataKey`, `Store::{open,open_in_memory,add_text,list,get_text}`, commands `list_items/add_text_item/get_text_value` are consistent across Tasks 4–8.

## Known follow-ups for Plan 2 (not this plan)
File-blob storage + `Kind::File` read path, confidential gate wired into `get_text_value`, confidential session window, clipboard auto-clear, real timestamps in the command layer, deleting the harness.
