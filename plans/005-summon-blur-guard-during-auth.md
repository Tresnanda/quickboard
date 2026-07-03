# Plan 005: Keep the summon panel open while a Touch ID prompt is in flight

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat 0b0d4bb..HEAD -- src/components/SummonPanel.tsx`
> If the file changed since this plan was written, compare the "Current
> state" excerpts against the live code before proceeding; on a mismatch,
> treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: MED (must not break "click away dismisses")
- **Depends on**: plans/004-touchid-failure-feedback.md (touches the same
  `pick` catch block — land 004 first to avoid conflicts)
- **Category**: bug / ux
- **Planned at**: commit `0b0d4bb`, 2026-07-03

## Why this matters

The summon panel dismisses itself whenever its window loses focus — the
Spotlight-style "click away to dismiss." But retrieving a **confidential**
item raises the system Touch ID prompt, which steals focus and fires that same
`blur`, hiding the panel mid-operation. The paste flow breaks for exactly the
security-sensitive items where reliability matters most. Fix: suppress the
blur-hide while a biometric/paste round-trip is in flight.

## Current state

- `src/components/SummonPanel.tsx` — the summon window's root component.

```tsx
// src/components/SummonPanel.tsx:76-82
// Spotlight-style: dismiss when focus leaves the panel (click away / switch app).
useEffect(() => {
  const onBlur = () => void invoke("summon_hide");
  window.addEventListener("blur", onBlur);
  return () => window.removeEventListener("blur", onBlur);
}, []);
```

- The confidential retrieval paths in the same file that can raise Touch ID:
  - `pick(it)` (~line 245-261): `await getTextValue(it.id)` then clipboard
    write then `invoke("summon_paste")`.
  - `copyHighlighted()` (~line 181-196): `await getTextValue(result.item.id)`.
- There is already a `busy` state variable in the component (`setBusy(true)`
  at the start of both functions) — but `busy` is React state, and the blur
  listener is registered once with an empty dependency array, so it closes
  over stale state. Use a **ref**, not the state, for the guard.

## Commands you will need

| Purpose   | Command                    | Expected on success |
|-----------|----------------------------|---------------------|
| Typecheck | `pnpm exec tsc --noEmit`   | exit 0              |

## Scope

**In scope** (the only file you should modify):
- `src/components/SummonPanel.tsx`

**Out of scope** (do NOT touch):
- `src-tauri/src/summon.rs` / any Rust — the fix is frontend-only.
- The auto-hide-after-paste behavior (`summon_paste` hides the panel from the
  Rust side after a successful paste — leave that).
- `use-reveal.ts` lockOnBlur behavior — different surface.

## Git workflow

- Branch: `advisor/005-summon-blur-guard`
- Commit style: imperative sentence (match `git log`).
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Add an auth-in-flight ref and guard the blur handler

```tsx
const authBusyRef = useRef(false);

useEffect(() => {
  const onBlur = () => {
    if (authBusyRef.current) return; // Touch ID prompt owns focus — stay open
    void invoke("summon_hide");
  };
  window.addEventListener("blur", onBlur);
  return () => window.removeEventListener("blur", onBlur);
}, []);
```

### Step 2: Set/clear the ref around every `getTextValue`/paste round-trip

In `pick` and `copyHighlighted` (and any other call site of `getTextValue` or
`summon_paste_image` in this file — grep for both), wrap the awaited section:

```tsx
authBusyRef.current = true;
try {
  const value = await getTextValue(it.id);
  ...
} finally {
  authBusyRef.current = false;
}
```

Set it BEFORE the first await and clear in `finally` so a thrown/cancelled
prompt can't leave the panel permanently un-dismissable. Only guard paths
that can prompt (the item paths); plain clip-entry paths (`pasteClip`,
`result.kind === "clip"`) don't prompt and must keep current behavior.

**Verify**: `pnpm exec tsc --noEmit` → exit 0.

### Step 3: Re-dismiss if focus never returns

Edge case: user authenticates, but the paste target app keeps focus (that is
the normal success path — `summon_paste` hides the panel itself). But on
**cancel**, focus returns to the panel; on **failure with panel kept open**
(plan 004 behavior), the user may then click away — the guard is already
false by then (finally ran), so click-away works. No extra code needed; just
verify this reasoning against the final code and note it in your report.

## Test plan

No unit-test harness reaches this window reliably; verification is manual
(run `pnpm tauri dev` on a Touch ID Mac):
1. ⌥Space → select a confidential item → Return. Touch ID appears; the panel
   must remain visible behind it. Authenticate → paste completes.
2. Same, but cancel the prompt → panel still open; press Esc → panel hides.
3. Non-confidential item paste and plain click-away-to-dismiss still work.
If you cannot run the app, say so in the report; typecheck is the hard gate.

## Done criteria

- [ ] `pnpm exec tsc --noEmit` exits 0
- [ ] `grep -n "authBusyRef" src/components/SummonPanel.tsx` shows: 1 declaration, a guard in the blur handler, and set/finally-clear around every prompting call site
- [ ] No files outside the in-scope list are modified (`git status`)
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- The blur effect or `pick`/`copyHighlighted` no longer match the excerpts
  (plan 004 may have altered the catch blocks — reconcile with the live code;
  if the structure diverges materially, stop).
- You find the Touch ID prompt does NOT blur the panel window on the current
  macOS (i.e. the bug doesn't reproduce) — report; don't add the guard
  speculatively without confirming the mechanism.

## Maintenance notes

- Any new prompting call site added to SummonPanel must set `authBusyRef`;
  reviewers should check for this whenever `getTextValue`/`get_image_data_url`
  usage appears in this file.
- If summon gains image-paste for confidential images later, the same guard
  applies around `summonPasteImage`.
