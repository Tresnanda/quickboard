# Plan 008: Stop refetching the whole board on every mutation

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat 0b0d4bb..HEAD -- src/lib/ipc.ts src/lib/items-store.tsx`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: MED (three windows sync board state through this event)
- **Depends on**: plans/002-test-ci-baseline.md (test runner)
- **Category**: perf
- **Planned at**: commit `0b0d4bb`, 2026-07-03

## Why this matters

Every mutating IPC wrapper emits `board:changed`, and the single listener
responds by refetching **all** items + categories + environments and replacing
the `items` array identity — so pinning one item re-decrypts every file's
metadata in Rust, re-ships the whole board over IPC, and remounts every
card (which also re-triggers every image thumbnail fetch — see plan 009).
Cost is O(board size) per single-item action and it compounds with board
growth. Fix: coalesce refetches, and skip the refetch in the window that
originated the change by applying the mutation locally.

## Current state

- `src/lib/ipc.ts:5-13` — every mutator wraps in `boardChanged`:

```ts
const boardChanged = async <T>(operation: Promise<T>): Promise<T> => {
  const result = await operation;
  try {
    await emit("board:changed");
  } catch { /* ... */ }
  return result;
};
```

  Wrapped mutators (grep `boardChanged(` in ipc.ts): `setPinned`,
  `deleteItem`, `renameCategory`, `addText`, `addFileItem`, `updateItem`, and
  others — enumerate them all before starting.
- `src/lib/items-store.tsx` — the provider (160 lines; full file read at
  planning time):

```tsx
// src/lib/items-store.tsx:113-118
useEffect(() => {
  const un = listen("board:changed", () => void reload());
  return () => { void un.then((f) => f()); };
}, [reload]);
```

  `reload()` (lines 91-107) runs `listItems() + listCategories() +
  listEnvironments()` and replaces all three arrays.
- The event exists because **three windows** (main `index.html`, summon
  `panel.html`, tray `tray.html`) each mount their own ItemsProvider (or
  read items) and must observe each other's writes. Any change must keep
  cross-window consistency.
- `emit` comes from `@tauri-apps/api/event` and broadcasts to ALL windows
  including the sender.

## Commands you will need

| Purpose        | Command          | Expected on success |
|----------------|------------------|---------------------|
| Typecheck      | `pnpm typecheck` | exit 0              |
| Frontend tests | `pnpm test`      | all pass            |

## Scope

**In scope**:
- `src/lib/ipc.ts`
- `src/lib/items-store.tsx`
- `src/lib/board-sync.test.ts` (create)

**Out of scope**:
- `src-tauri/**` — no Rust changes; `list_items` stays as-is.
- Splitting the ItemsContext into sub-contexts (separate finding; don't mix
  the two refactors).
- Component call sites — several components call `reload()` directly after
  mutations (e.g. `ItemCard.onFav` does `await setPinned(...); await reload()`).
  Leave those calls; Step 3 makes `reload` cheap to repeat. Removing the
  redundant calls is follow-up, not this plan.

## Git workflow

- Branch: `advisor/008-targeted-board-updates`
- Commit style: imperative sentence (match `git log`).
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Tag the event with its source window

In `ipc.ts`, include the sender:

```ts
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
const boardChanged = async <T>(operation: Promise<T>): Promise<T> => {
  const result = await operation;
  try {
    await emit("board:changed", { source: getCurrentWebviewWindow().label });
  } catch { /* keep existing comment */ }
  return result;
};
```

(Confirm the import path against how other files in `src/lib/` get the
current window — grep `getCurrentWebview` under `src/`.)

### Step 2: Skip self-originated events in the listener

In `items-store.tsx`, the listener ignores events from its own window:

```tsx
const label = getCurrentWebviewWindow().label;
const un = listen<{ source?: string }>("board:changed", (e) => {
  if (e.payload?.source === label) return; // local mutation already handled
  void reload();
});
```

Backward compatibility: an event with no payload (older code paths, Rust-side
emits if any — grep `src-tauri/src` for `board:changed` to check) must still
trigger `reload()`.

### Step 3: Coalesce bursts

Wrap `reload` scheduling in a trailing debounce (~80ms) inside the provider so
a burst (bulk delete, lane commit, clipboard capture storm) causes one
refetch, not N. Implement with a ref-held timer; make sure the debounced call
still runs after the last event and is cleaned up on unmount.

### Step 4: Local application for the originating window

Because the originating window no longer reloads via the event, its own state
must be correct: audit each mutation call site pattern. Most components
already `await reload()` themselves after mutating (grep `reload()` under
`src/components` and `src/routes` and list them in your report). For any
mutator call site that does NOT follow with a local `reload()` or local state
update, add `await reload()` there. (This keeps the plan mechanical; true
optimistic patching is deferred.) Net effect: one reload in the acting
window, zero-or-debounced reloads elsewhere — versus N full reloads in every
window today.

**Verify** (after each step): `pnpm typecheck` → exit 0.

## Test plan

`src/lib/board-sync.test.ts` (Vitest, mock `@tauri-apps/api/event` and
`@tauri-apps/api/webviewWindow` with `vi.mock`):

1. `boardChanged` emits `board:changed` with the current window label.
2. Listener ignores own-label events, reloads on foreign-label events, and
   reloads on payload-less events.
3. Debounce: three rapid foreign events → exactly one `reload` call
   (use `vi.useFakeTimers`).

Testing the provider directly needs React testing tools; if
`@testing-library/react` is not installed, factor the listener decision into
an exported pure function `shouldReload(payload, ownLabel)` and the debounce
into a small exported utility, and test those — do NOT add new heavy
devDependencies without noting it in the report.

**Verify**: `pnpm test` → all pass.

## Done criteria

- [ ] `pnpm typecheck` exits 0
- [ ] `pnpm test` exits 0 with the new board-sync tests
- [ ] `emit("board:changed")` no longer called without a source payload in ipc.ts
- [ ] Listener has self-skip + debounce; payload-less events still reload
- [ ] Call-site audit from Step 4 recorded in the executor report
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- Rust code also emits `board:changed` (grep first) with semantics that the
  self-skip would break.
- Any window turns out NOT to mount ItemsProvider (check `src/panel.tsx`,
  `src/tray.tsx`, `src/main.tsx`) — the sync model differs from this plan's
  assumption; report the actual wiring.
- The Step 4 audit finds a mutator call site whose correctness silently
  depended on the cross-window event refreshing its own window.

## Maintenance notes

- Future mutators added to ipc.ts must use `boardChanged` (source-tagged);
  reviewers should check any new `invoke(` mutation goes through it.
- Deferred follow-ups: optimistic per-item patching (needs mutators to return
  the updated row), and the ItemsContext split (re-render blast radius) —
  both are separate audited findings.
- Interacts with plan 009: once thumbnails are cached, the residual cost of a
  reload drops further; land both for the full effect.
