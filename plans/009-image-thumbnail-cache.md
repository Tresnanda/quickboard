# Plan 009: Cache image data-URLs so thumbnails aren't re-decrypted on every mount

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat 0b0d4bb..HEAD -- src/lib/ipc.ts src/components/ItemCard.tsx src/components/ItemRow.tsx src/components/SummonPanel.tsx src/components/TrayDock.tsx src/components/DetailModal.tsx src/lib/drag.ts`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none (compounds with plan 008)
- **Category**: perf
- **Planned at**: commit `0b0d4bb`, 2026-07-03

## Why this matters

Every image item's preview is fetched via `get_image_data_url`, which
decrypts the blob in Rust and ships the full base64 data-URL over IPC. Six
call sites each fetch in a mount effect with no cache, so every board reload
(today: every mutation — see plan 008), every Card↔Row view switch, and every
panel open re-decrypts and re-transfers every visible image. A module-level
memoizing loader keyed by item id fixes all six sites at once.

## Current state

- `src/lib/ipc.ts:38`:

```ts
export const getImageDataUrl = (id: string) => invoke<string>("get_image_data_url", { id });
```

- Consumer pattern (all six do a variant of this):

```tsx
// src/components/ItemCard.tsx:71-84
const [cover, setCover] = useState<string | null>(null);
const wantsCover = isImage && !item.confidential;
useEffect(() => {
  if (!wantsCover) { setCover(null); return; }
  let alive = true;
  void getImageDataUrl(item.id).then((u) => alive && setCover(u)).catch(() => {});
  return () => { alive = false; };
}, [item.id, wantsCover]);
```

  Call sites (grep `getImageDataUrl(` to confirm the exact list):
  `ItemCard.tsx:79`, `ItemRow.tsx:42`, `SummonPanel.tsx:606`,
  `TrayDock.tsx:876`, `DetailModal.tsx:79`, `src/lib/drag.ts:201`.
- **Confidential caution**: the Rust command Touch-ID-gates confidential
  items. Callers only request covers for non-confidential images (see
  `wantsCover` above), but the cache MUST NOT change that: never pre-fetch,
  and never serve a cached value for an item that has become confidential.
  Invalidation on update handles this (Step 2).
- Invalidation signals available: the mutating wrappers in `src/lib/ipc.ts`
  (`updateItem`, `deleteItem`) and the `board:changed` event
  (`src/lib/items-store.tsx:113-118`).

## Commands you will need

| Purpose        | Command          | Expected on success |
|----------------|------------------|---------------------|
| Typecheck      | `pnpm typecheck` | exit 0              |
| Frontend tests | `pnpm test`      | all pass            |

## Scope

**In scope**:
- `src/lib/image-cache.ts` (create)
- `src/lib/image-cache.test.ts` (create, if plan 002's runner exists)
- `src/lib/ipc.ts` (invalidation hooks in `updateItem`/`deleteItem` only)
- The six consumer files (swap `getImageDataUrl` → cached loader; no other
  changes in them)

**Out of scope**:
- `src-tauri/**` — no Rust changes.
- Downscaling thumbnails server-side (better long-term fix — deferred).
- Any refactor of the consumer components beyond the one-line swap.

## Git workflow

- Branch: `advisor/009-image-thumbnail-cache`
- Commit style: imperative sentence (match `git log`).
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: The cache module

`src/lib/image-cache.ts`:

```ts
import { getImageDataUrl } from "./ipc";

const cache = new Map<string, Promise<string>>();

/** Memoized image data-URL per item id. Failed fetches don't poison the cache. */
export function getCachedImageDataUrl(id: string): Promise<string> {
  const hit = cache.get(id);
  if (hit) return hit;
  const p = getImageDataUrl(id).catch((err) => {
    cache.delete(id); // don't cache failures (incl. cancelled Touch ID)
    throw err;
  });
  cache.set(id, p);
  return p;
}

export function invalidateImage(id: string): void {
  cache.delete(id);
}

export function clearImageCache(): void {
  cache.clear();
}
```

Memory note: data-URLs for full-size images can be large; 100+ image boards
would pin them all. Add a simple LRU cap of 64 entries (evict oldest
insertion on overflow — a Map preserves insertion order; delete+re-set on
hit to refresh recency).

### Step 2: Invalidation

In `src/lib/ipc.ts`, call `invalidateImage(id)` inside `updateItem` and
`deleteItem` after the operation resolves (import from `./image-cache` —
note: ipc.ts must not import anything that imports ipc.ts back except the
lazy function reference; `image-cache.ts` imports `getImageDataUrl` from
ipc.ts, so to avoid a cycle put the invalidation calls in `image-cache.ts`
re-exported wrappers OR pass invalidation via a registered callback. Simplest
cycle-free shape: `image-cache.ts` imports ipc; ipc does NOT import
image-cache; instead, `items-store.tsx`'s `board:changed` listener may
`clearImageCache()` only when the event is foreign-sourced (post-plan-008) —
but a full clear defeats the cache. Choose: export `invalidateImage` and call
it from the two component paths that edit/delete items (`DetailModal`,
`ConfirmDialog` flows) — grep `updateItem(`/`deleteItem(` call sites and add
the invalidation beside them. Record chosen wiring in your report.)

### Step 3: Swap the six consumers

Replace `getImageDataUrl(...)` with `getCachedImageDataUrl(...)` in the six
files. No other logic changes — the hooks/effects stay identical.

**Verify**: `pnpm typecheck` → exit 0, and
`grep -rn "getImageDataUrl(" src/components src/lib --include="*.tsx" --include="*.ts" | grep -v image-cache | grep -v ipc.ts` → no matches.

## Test plan

`src/lib/image-cache.test.ts` (mock `./ipc` with `vi.mock`):
1. Two calls for the same id → one underlying IPC call, same promise.
2. Rejection → cache entry removed; next call retries the IPC.
3. `invalidateImage` → next call re-fetches.
4. LRU cap: 65 distinct ids → first id evicted, re-fetches.

**Verify**: `pnpm test` → all pass.

## Done criteria

- [ ] `pnpm typecheck` exits 0; `pnpm test` exits 0 with 4 new tests
- [ ] Grep check from Step 3 shows all six consumers use the cache
- [ ] Edit/delete paths invalidate (wiring recorded in report)
- [ ] No files outside the in-scope list are modified (`git status`)
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- A seventh+ call site of `getImageDataUrl` exists that has different
  semantics (e.g. intentionally fresh reads) — list it and ask.
- The import-cycle resolution in Step 2 can't be done cleanly within the
  in-scope files.
- Any consumer relies on the per-mount fetch as an implicit "image updated"
  refresh — the invalidation wiring must cover that path first.

## Maintenance notes

- If image EDITING is ever added (replace bytes for an existing id), the
  editor MUST call `invalidateImage(id)` — reviewers watch for this.
- The right long-term fix is a Rust-side downscaled thumbnail command
  (decrypt once, ship ~10KB instead of full-size base64); this cache is the
  cheap 90% win and remains useful after that lands.
