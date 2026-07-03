# Plan 004: Surface Touch ID failures to the user instead of failing silently

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat 0b0d4bb..HEAD -- src/lib/use-reveal.ts src/components/CommandPalette.tsx src/components/SummonPanel.tsx src-tauri/src/confidential.rs src/lib/use-copy.ts`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: bug / ux
- **Planned at**: commit `0b0d4bb`, 2026-07-03

## Why this matters

When Touch ID fails or is cancelled while revealing/copying/pasting a
confidential item, every frontend call site swallows the error: the action
silently does nothing. The user cannot distinguish "I mis-scanned," "the item
is empty," and "the app is broken." A deliberate user cancel should stay
quiet; a genuine failure should say so. The Rust side already returns
distinguishable error strings — the frontend just discards them.

## Current state

- `src-tauri/src/confidential.rs` (~line 74) returns error messages from the
  biometric round-trip; user-cancel and real failures produce different
  message text. **First task is to read `confidential.rs` and record the
  exact error strings for (a) user cancel and (b) other failures.**
- Frontend call sites that swallow the error:

```ts
// src/lib/use-reveal.ts:51-63
try {
  const v = await getTextValue(itemId); // Touch ID prompt for confidential
  setValue(v);
  ...
} catch {
  /* cancelled or failed — stay hidden */
} finally {
  setBusy(false);
}
```

```ts
// src/components/CommandPalette.tsx:44-59 (copyItem)
if (it.kind === "Text") {
  try {
    const v = await getTextValue(it.id);
    await navigator.clipboard.writeText(v);
  } catch {
    /* cancelled */
  }
  setPaletteOpen(false);   // closes as if it succeeded
}
```

```ts
// src/components/SummonPanel.tsx:252-261 (pick, confidential paste path)
try {
  const value = await getTextValue(it.id);
  suppressClipboardCapture(value);
  await navigator.clipboard.writeText(value);
  await invoke("summon_paste");
} catch {
  await invoke("summon_hide");   // hides with no message
}
```

- Also check `src/lib/use-copy.ts` (the shared copy hook used by
  ItemCard/ItemRow) for the same swallow pattern and fix it the same way.
- Toast system: `src/components/Toast.tsx` — `useToast()` returns
  `toast({ message, icon?, tone? })`; tones include `"rose"` for errors.
  Exemplar usage: `src/routes/Settings.tsx` line ~68:
  `toast({ message: "Couldn't copy backup", icon: <ClipboardCopy size={14} />, tone: "rose" })`.
- The SummonPanel is a separate window that does NOT mount `ToastProvider`
  from the main window — it has its own inline `showFlash(...)` feedback
  (see `SummonPanel.tsx:190-193`, `showFlash("Couldn't copy")`). Use
  `showFlash` there, not `useToast`.

## Commands you will need

| Purpose   | Command          | Expected on success |
|-----------|------------------|---------------------|
| Typecheck | `pnpm typecheck` (or `pnpm exec tsc --noEmit` if plan 002 hasn't landed) | exit 0 |
| Tests     | `pnpm test`      | all pass (if plan 002 landed) |

## Scope

**In scope** (the only files you should modify):
- `src/lib/use-reveal.ts`
- `src/lib/use-copy.ts`
- `src/components/CommandPalette.tsx`
- `src/components/SummonPanel.tsx`
- `src/lib/confidential-errors.ts` (create — the cancel/failure classifier)

**Out of scope** (do NOT touch):
- `src-tauri/**` — the Rust error strings are the contract; do not change them.
- `Toast.tsx` — no API changes needed (aria-live is a separate plan/finding).
- The blur/hide behavior of SummonPanel — that's plan 005.

## Git workflow

- Branch: `advisor/004-touchid-failure-feedback`
- Commit style: imperative sentence (match `git log`).
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Build the error classifier

Read `src-tauri/src/confidential.rs` and note the exact strings produced on
user cancel vs other failures. Create `src/lib/confidential-errors.ts`:

```ts
/** True when the user deliberately dismissed the Touch ID prompt. */
export function isAuthCancel(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err ?? "");
  return /<pattern derived from confidential.rs cancel string>/i.test(msg);
}
```

Use the actual cancel-message substring you found — do not guess. If
`confidential.rs` does NOT distinguish cancel from failure in its error
string, see STOP conditions.

**Verify**: `pnpm exec tsc --noEmit` → exit 0.

### Step 2: use-reveal.ts and use-copy.ts

These hooks are used by components inside the main window's `ToastProvider`.
In each `catch (err)`: if `isAuthCancel(err)` do nothing (current behavior);
otherwise surface feedback. Hooks can't call `useToast` conditionally — call
it at the top of the hook (both files' consumers are inside the provider).
Message: `"Couldn't unlock — try again"`, tone `"rose"`.

**Verify**: `pnpm exec tsc --noEmit` → exit 0.

### Step 3: CommandPalette.copyItem

On non-cancel error, `toast({ message: "Couldn't unlock — try again", tone: "rose" })`
and KEEP the palette open (do not `setPaletteOpen(false)` on failure — the
user will want to retry). On cancel, keep current close behavior.

### Step 4: SummonPanel.pick

In the `catch`, replace unconditional `summon_hide` with: on cancel →
`invoke("summon_hide")` (current behavior); on failure →
`showFlash("Couldn't unlock — try again")` and keep the panel open, `setBusy(false)`.
Confirm `busy` is reset on the failure path (currently `pick` has no
`finally` — add one).

**Verify**: `pnpm exec tsc --noEmit` → exit 0.

## Test plan

If plan 002 has landed: add `src/lib/confidential-errors.test.ts` asserting
`isAuthCancel` on the exact cancel string (copied from confidential.rs), a
generic failure string, `undefined`, and an `Error` instance. Otherwise note
the deferred test in your report.

Manual verification (requires a Mac with Touch ID, run `pnpm tauri dev`):
1. Mark an item confidential; click reveal; press Esc on the Touch ID prompt
   → nothing appears (quiet cancel).
2. Fail the scan (wrong finger repeatedly until the prompt errors) → a rose
   toast/flash appears; the surface stays open where specified.
If you cannot run the app, state that in your report; the typecheck + unit
test gates still apply.

## Done criteria

- [ ] `pnpm exec tsc --noEmit` exits 0
- [ ] `grep -n "catch {" src/lib/use-reveal.ts src/lib/use-copy.ts` → no bare swallowing catch remains in the auth paths (each catch binds `err` and branches on `isAuthCancel`)
- [ ] `pnpm test` exits 0 (if runner exists)
- [ ] No files outside the in-scope list are modified (`git status`)
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- `confidential.rs` does not produce distinguishable cancel-vs-failure
  strings — report the actual strings; the fallback design (toast on ALL
  errors including cancel) is a product decision for the owner, not yours.
- Any call site turns out to sit outside a `ToastProvider` (toast throws or
  no-ops) — report which one.
- The excerpts above don't match the live code.

## Maintenance notes

- If the Rust error strings ever change, `isAuthCancel` breaks silently —
  the unit test pinning the exact string is the tripwire; a sturdier
  follow-up is a structured error enum serialized over IPC (deferred).
- Reviewer should scrutinize: the palette/panel now staying open on failure —
  confirm no focus/blur regression (interacts with plan 005).
