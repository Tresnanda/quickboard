# Quickboard — v1 Design Spec

**Date:** 2026-06-21
**Status:** Approved design, pre-implementation
**One-liner:** *The personal things you summon to your cursor — facts and files — copy or drag, in two seconds.*

---

## 1. Summary

Quickboard is a local-first macOS desktop app (cross-platform-capable) that holds the small things you reach for constantly — **any pasteable fact or file about you** — and makes them retrievable in ~2 seconds via a global hotkey. It's a "clipboard of yourself": a permanent, curated, encrypted layer beneath the ephemeral system clipboard.

It is **not** a documents/archive app (that's arsip's lane — custody + expiry). Quickboard's job is *paste-it-now retrieval*, not storage and safekeeping.

## 2. Goals & non-goals

**Goals (v1)**
- Summon a known item (fact or file) in ~2s and copy it, or drag a file out into any native drop zone.
- Collect a transient set of files (a "shelf") and drag them out together.
- Hold sensitive data (IDs, passwords, API keys) safely: encrypted at rest, with a hard gate on confidential items.
- A clean, calm "ink" UI that feels like its own product, not arsip.

**Non-goals (explicitly out of v1 — YAGNI)**
Cloud/sync, mobile, sharing/multi-user, browser autofill, document-expiry tracking, OCR, tags beyond categories, and **self-population** (watching retyped strings to auto-suggest pins) — deferred to v2 as the future "magic," not load-bearing now.

## 3. The two surfaces

Quickboard has two surfaces sharing one data store and design language.

### 3a. Full app (home base) — opened like a normal window
Layout (validated in mockups), with a deliberate 3-level hierarchy:
- **Sidebar:** brand, search (⌘F), "Add item" (⌘N), nav (Home / All items / Shelf / Confidential / Settings), user-defined **Categories** (with color dots + counts), local-encrypted account footer.
- **Main — primary:** **Quick access** — your most-used / pinned items as elevated cards.
- **Main — secondary:** **Library** — items grouped **hierarchically by category** as an editorial list (section header + hairline rule + rows), *not* a uniform card grid.
- **Main — tertiary:** a quiet **meta footer** (item/file counts, storage, "Unlock confidential with Touch ID").

### 3b. Quick launcher — summoned by global hotkey (default ⌥Space)
Floats over anything, auto-hides on focus loss (optional pin-to-stay):
- **Search bar** (top) = keyboard fast-path: type → Enter copies the top hit.
- **Results list:** facts (copy) and files (drag out); confidential values masked.
- **Temp shelf** (bottom): drag files in to collect a working set → "Drag all" out → cleared on close. Ephemeral; separate from permanent items.

## 4. Item model

The fence: **"would I ever paste this?"** Yes → it belongs (address, IDs, IBAN, Wi-Fi password, API keys, env vars, SSH keys, signature, resume, snippets). No → different app (journals, tasks, notes get *read*, not pasted).

- **kind:** `text` | `file`. (An API key is just confidential `text`; an SSH key is a confidential `file`. No third kind.)
- **category:** user-defined (ships defaults: Identity, Finance, Work, Dev & Keys, Home & Car, Snippets).
- **confidential:** boolean — gates access behind device-auth (see §6).
- **pinned:** boolean — surfaces in Quick access.

## 5. Core interactions

- **Capture:** drag a file onto the app/launcher (→ pin as Item, or drop on shelf as transient); "Add item" form (label, value/file, category, confidential toggle); paste-to-add from clipboard.
- **Search:** fuzzy match on label (and category); Enter copies top result.
- **Copy:** click a fact / Enter → value to clipboard (confidential → auto-clear, see §6).
- **Drag out:** drag any file item (or shelf set) into a native drop target.
- **Shelf:** transient file collection in the launcher; "Drag all" + "Clear"; cleared on launcher close.

## 6. Security model

- **Encrypted at rest, always.** A random 256-bit **Data Encryption Key (DEK)** is generated on first run and stored in the OS keyring (Keychain / Windows Credential Manager). All item bodies and file blobs are encrypted with AES-256-GCM under the DEK.
- **Confidential gate.** Confidential items' bodies are encrypted under a separate **Confidential Key (CK)** held in the OS secure store **behind biometric / user-presence access control** (macOS Keychain `kSecAccessControlBiometryCurrentSet` / Windows Hello). Accessing a confidential item triggers **Touch ID**. A short **session window** (default 2 min, configurable; re-locks on app hide / sleep) caches CK in memory so grabbing the same item twice isn't two prompts.
- **Clipboard auto-clear.** Copying a confidential value wipes the clipboard after ~30s (configurable).
- **Drag-out & temp files.** Native drag needs a real file path, so on drag quickboard writes a **decrypted temp file** to a private dir, starts the drag, and deletes it on drop / app exit / periodic sweep. For a confidential file, device-auth happens *before* the temp file is produced.
  - `ponytail:` temp-file-on-drag is the known ceiling for v1; harden later (immediate unlink post-drop, secured temp dir).

## 7. Architecture & stack

- **Backend:** Tauri v2 (Rust) — store, crypto, OS keyring, global shortcut, file drag-out, clipboard.
- **Frontend:** React 18 + TypeScript, **Vite** (Tauri default; pure client SPA), **TanStack Router** (type-safe client routing — *not* TanStack Start, whose server features a webview can't use), **shadcn/ui** (Radix + Tailwind), **Framer Motion** (launcher open/close, list transitions), **Lucide** icons (**no emoji anywhere**), **Plus Jakarta Sans**. Visual direction per the `emil-design-eng` + `motion-design` taste — clean "ink" minimal.
- **Storage:** SQLite (via Tauri SQL plugin) holding item metadata + **ciphertext** body columns; encrypted file blobs in the app data dir. Full-DB encryption (SQLCipher) is an optional later hardening.
- **Data flow:** React UI ⇄ Rust via Tauri IPC commands (`list_items`, `get_value`, `add_item`, `start_drag`, `unlock_confidential`, …). No HTTP/server.
- **Tauri plugins:** global-shortcut, clipboard-manager, fs/dialog, sql, keyring (community), drag-out (community). All **pinned exact + vetted on socket.dev** before adding.

## 8. Data model (concrete)

```ts
type Item = {
  id: string;                 // uuid
  label: string;
  kind: 'text' | 'file';
  // text -> encrypted value; file -> encrypted blob + metadata
  body:
    | { type: 'text'; valueEnc: string }
    | { type: 'file'; blobId: string; filename: string; mime: string; sizeBytes: number };
  category: string;           // user-defined
  confidential: boolean;
  pinned: boolean;
  createdAt: number; updatedAt: number; lastUsedAt: number; useCount: number;
};

type Category = { name: string; color: string };

// Shelf items are transient file refs in the launcher — NOT persisted as Items.
type ShelfFile = { path: string; filename: string; mime: string };
```

## 9. Technical risks → first two build tasks (de-risk before building UI)

1. **Drag-out spike** — prove a file drags out of a Tauri v2 window into Finder / an upload field (community drag plugin or small Rust shim). Validate drag preview, multi-file, common drop targets.
2. **Biometric-gate spike** — prove a Touch ID-released key can decrypt a confidential item in Tauri. This is the most likely spot to need a small native (Swift/Security.framework) shim.

If either is infeasible, we learn it in ~an hour rather than after building on top.

## 10. Testing (lazy but real)

- Rust unit: crypto round-trip (encrypt→decrypt body); a confidential item **refuses** to decrypt without the CK/auth.
- Rust/TS unit: fuzzy search returns expected match order.
- Manual checklist for drag-out + biometric flows (not unit-testable).
No framework sprawl; one runnable check per non-trivial path.

## 11. Supply-chain (per project rules)

- Frontend deps via **pnpm 11** (Tauri is not Expo/RN), `save-exact`, postinstall scripts blocked by default → allowlist trusted ones via `pnpm.onlyBuiltDependencies`.
- Vet every community Tauri plugin (drag, keyring) on socket.dev before install; pin exact versions; Rust crates pinned in `Cargo.toml`.

## 12. Deferred to v2 (noted, not built)

Self-population (watch retyped strings → offer to pin), cloud sync, mobile companion, B-style master-detail preview pane on item open, sharing.
