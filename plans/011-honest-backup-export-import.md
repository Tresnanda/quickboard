# Plan 011: Make backup honest — export to a file, state exclusions, add import

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat 0b0d4bb..HEAD -- src/routes/Settings.tsx src/lib/ipc.ts`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: MED (import writes to the store; must not corrupt or duplicate)
- **Depends on**: none
- **Category**: ux / data-safety
- **Planned at**: commit `0b0d4bb`, 2026-07-03

## Why this matters

Settings has an "Export backup" action whose behavior would surprise anyone
relying on it: it exports **only non-confidential text values** (files and all
confidential items serialize with `value: null`), copies the JSON to the
clipboard rather than saving a file, and there is **no import** — the backup
cannot be restored even where it is complete. A user who trusts it and loses
their Mac loses everything. This plan makes the feature honest and closes the
loop: save to a JSON file via the OS save dialog, say exactly what's included
and excluded, and add an import that recreates text items. (A full encrypted
archive including files/confidential items is a separate, larger direction
item — deliberately out of scope here.)

## Current state

- `src/routes/Settings.tsx:49-74` — the current export:

```tsx
async function exportBackup() {
  ...
  const exported = await Promise.all(
    items.map(async (it) => {
      let value: string | null = null;
      if (it.kind === "Text" && !it.confidential) {
        try { value = await getTextValue(it.id); } catch { /* skip */ }
      }
      return { label: it.label, kind: it.kind, category: it.category,
               environment: it.environment, confidential: it.confidential,
               value, created_at: it.created_at };
    }),
  );
  const json = JSON.stringify({ exportedAt: ..., count: exported.length, items: exported }, null, 2);
  await navigator.clipboard.writeText(json);
  toast({ message: `Backup of ${exported.length} items copied`, ... });
}
```

- File save dialog: `@tauri-apps/plugin-dialog@2.7.1` is already a dependency
  (`package.json`). Its `save()` returns a path; writing the file needs a
  Rust command or the fs plugin — the fs plugin is NOT installed, so add a
  small Rust command (Step 2) rather than a new plugin. Exemplar of an
  existing dialog usage: grep `plugin-dialog` / `open(` under `src/` (e.g.
  file pickers in `NewItemSheet.tsx`) and follow its import style.
- Creating items from the frontend: `addText(label, category, environment,
  confidential, value)` in `src/lib/ipc.ts` returns the new id (exemplar
  usage: `SummonPanel.tsx:268` `const id = await addText(clip.label,
  "Uncategorized", env, false, value)`). Appearance (icon/type) is set
  separately via `setAppearance(id, { type: ... })` from
  `src/lib/appearance.ts` — read it to see what's persisted where; note
  appearance lives client-side and is NOT part of the current export shape.
- Toast + confirm patterns: `useToast` (`Toast.tsx`), `confirm` from
  `ConfirmDialog.tsx` — exemplar `Settings.tsx:77-79` (`clearAll`).

## Commands you will need

| Purpose    | Command                                            | Expected on success |
|------------|----------------------------------------------------|---------------------|
| Typecheck  | `pnpm typecheck` (or `pnpm exec tsc --noEmit`)     | exit 0              |
| Tests      | `pnpm test`                                        | all pass            |
| Rust check | `cargo check --manifest-path src-tauri/Cargo.toml` | exit 0              |
| Rust tests | `cargo test --manifest-path src-tauri/Cargo.toml`  | all pass            |

## Scope

**In scope**:
- `src/routes/Settings.tsx` (export rework + import UI)
- `src/lib/backup.ts` (create — pure serialize/parse/validate)
- `src/lib/backup.test.ts` (create)
- `src/lib/ipc.ts` (wrapper for the new save command)
- `src-tauri/src/commands.rs` (one command: `save_text_file(path, contents)`)
- `src-tauri/src/lib.rs` (register it)

**Out of scope**:
- Encrypted/full archive including files + confidential values — direction
  item DIR-02 in `plans/README.md`; do not attempt it here.
- Changing the export of confidential/file items to include their bytes.
- Auto-backup scheduling.

## Git workflow

- Branch: `advisor/011-honest-backup-export-import`
- Commit style: imperative sentence (match `git log`).
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Pure backup module

`src/lib/backup.ts`:

- `const BACKUP_VERSION = 1;`
- `serializeBackup(items: ExportedItem[]): string` — JSON with
  `{ version: 1, exportedAt, appVersion?, includes: "text", excluded: { files: n, confidential: n }, items }`.
- `parseBackup(json: string): { items: ImportableItem[]; skipped: number }`
  — validates shape (version 1, array, per-item required fields
  `label/kind/category/environment/value`), returns only importable entries
  (`kind === "Text"` and non-null `value`); throws a descriptive `Error` on
  malformed JSON or wrong version.

### Step 2: Rust save command

In `commands.rs` (near the other small file helpers):

```rust
/// Write a UTF-8 text file to a user-chosen path (backup export).
#[tauri::command]
pub fn save_text_file(path: String, contents: String) -> Result<(), String> {
    std::fs::write(&path, contents).map_err(|e| e.to_string())
}
```

Register in `lib.rs`'s `generate_handler![]`. Add the ipc wrapper
`saveTextFile(path, contents)` in `src/lib/ipc.ts`.
Security note: the path comes from the OS save dialog (user-chosen), same
trust level as existing path-taking commands; do not add path restrictions
here (a repo-wide IPC path-hardening pass is a separate audited finding).

**Verify**: `cargo check --manifest-path src-tauri/Cargo.toml` → exit 0.

### Step 3: Rework export in Settings

- Use `save({ defaultPath: "quickboard-backup.json", filters: [{ name: "JSON", extensions: ["json"] }] })`
  from `@tauri-apps/plugin-dialog`; user cancel (null) → return silently.
- Build the payload with `serializeBackup` (unchanged per-item shape plus the
  new envelope), write via `saveTextFile`.
- Honest UI: relabel the button/copy to "Export text items…" (match Settings'
  existing label style) and add a one-line sublabel: files and confidential
  items aren't included. Success toast: `"Exported N text items"` — count
  only items whose value was included, not `items.length`.

**Verify**: `pnpm exec tsc --noEmit` → exit 0.

### Step 4: Import

Next to export in Settings, "Import backup…": `open()` dialog filtered to
.json; read the file (add `readTextFile` alongside `save_text_file` as
`read_text_file` command — same pattern, `fs::read_to_string`); `parseBackup`;
show a `confirm` summarizing (`Import N text items? M entries will be
skipped (files/confidential).`); on confirm, loop `addText(label, category,
environment, confidential, value)` — import confidential-FLAGGED text items
as confidential **only if** their value was exported (it wasn't, so they land
in the skipped count; assert this in tests). De-dupe: skip an import row when
an existing item matches on `label + category + environment + kind` (the
export carries no ids); report `imported/skipped/duplicates` in the final
toast. Reload the board after (`reload()` from `useItems`).

**Verify**: `pnpm exec tsc --noEmit` → exit 0.

## Test plan

`src/lib/backup.test.ts` (pure, no mocks): round-trip serialize→parse;
malformed JSON throws; wrong version throws; file/confidential entries
counted as skipped, not importable; duplicate-detection predicate (export it
from backup.ts) matches on the 4-field key.
Rust: one test for `save_text_file`/`read_text_file` round-trip in
`commands.rs` `mod tests` (temp dir, model on `scratch()` helper ~line 900).
Manual if runnable: export → file exists with envelope; re-import → duplicates
all skipped; import into a wiped store → items reappear with category/env.

## Done criteria

- [ ] `pnpm exec tsc --noEmit` and `pnpm test` exit 0 (new backup tests pass)
- [ ] `cargo test --manifest-path src-tauri/Cargo.toml` exits 0
- [ ] Export writes a versioned JSON file via the save dialog; no more clipboard-only export (`grep -n "clipboard.writeText" src/routes/Settings.tsx` → not in exportBackup)
- [ ] Export/import UI copy states the text-only limitation
- [ ] Import path exists with confirm + dedupe + result toast
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- `@tauri-apps/plugin-dialog`'s `save` is not permitted by the current
  capabilities (invoke fails) — report the missing permission; don't edit
  `capabilities/*.json` without flagging it (a one-line grant for
  `dialog:allow-save` is acceptable IF the file already grants other dialog
  permissions — check first and record what you did).
- `addText`'s signature differs from the exemplar.
- The export shape in Settings has drifted from the excerpt.

## Maintenance notes

- The `version` field is the migration hook: any future exporter change bumps
  it and `parseBackup` gains a branch. Never silently accept unknown versions.
- DIR-02 (passphrase-wrapped full encrypted archive incl. files +
  confidential values) supersedes this UX when it lands; keep `backup.ts`
  pure so the archive work can reuse the validation layer.
- Reviewer should scrutinize the dedupe key (label+category+env+kind) — it's
  heuristic; colliding legitimate items are skipped, which the result toast
  must make visible.
