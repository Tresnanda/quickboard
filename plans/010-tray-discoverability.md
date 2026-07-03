# Plan 010: Make the tray discoverable — onboarding beat + persistent affordance

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat 0b0d4bb..HEAD -- src/components/Onboarding.tsx src/routes/Home.tsx src/components/AppShell.tsx`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: LOW
- **Depends on**: none
- **Category**: ux
- **Planned at**: commit `0b0d4bb`, 2026-07-03

## Why this matters

The tray (floating staging area with lanes + clipboard history) is the app's
largest feature by code size, and it is effectively invisible: onboarding
never mentions it, the main window has **zero** tray affordance (verified:
no "tray"/"Tray" string in `Home.tsx`, `Sidebar.tsx`, or `AppShell.tsx`), and
the only persistent hints are a menu-bar item ("Show tray (⌥⇧Space)") and a
"⇥ tray" footnote inside the summon panel. A user who finishes onboarding
will likely never find it. Two additive changes: an onboarding beat that
shows the tray, and a persistent tray button in the main window.

## Current state

- `src/components/Onboarding.tsx` — a beat-based flow (~32KB; read the
  sections you touch):

```tsx
// src/components/Onboarding.tsx:183-187
{beat === 0 && <Hello onNext={() => go(1)} />}
{beat === 1 && <SaveBeat onSaved={(item) => { setSaved(item); void reload(); ... }} />}
{beat === 2 && <SummonBeat item={saved} onNext={() => go(1)} />}
{beat === 3 && <SetupBeat onNext={() => go(1)} />}
{beat === 4 && <Finish item={saved} onDone={finish} />}
```

  A `BEATS` constant sets the count (`beat < BEATS - 1` at line 174; dot
  indicators around line 195). Each beat is a local component in the same
  file — read `SummonBeat` fully before writing the new beat; it is the
  structural template (title, body copy, visual, keyboard hint, Next button).
- Showing the tray from the frontend: `invoke("show_tray")` — exemplar in
  `src/components/SummonPanel.tsx:246` (`void invoke("show_tray");` after
  `addToTray`). The Rust side registers the global shortcut ⌥⇧Space and the
  menu item in `src-tauri/src/lib.rs` (~lines 91-93, 128).
- Main-window chrome candidates for the persistent affordance:
  `src/routes/Home.tsx` renders the board header (a "⌘K" chip in the search
  box ~line 184, an add button ~line 311). `src/components/AppShell.tsx` owns
  window-level wiring. Read `Home.tsx`'s header region and place the button
  where the existing header controls live, styled like its neighbors.
- Design conventions: pill geometry, warm off-white/charcoal palette,
  framer-motion transitions, `useReducedMotion()` respected across
  components, Tailwind classes throughout, lucide-react icons (`import { ... }
  from "lucide-react"` — pick an appropriate icon such as `Inbox` or
  `PanelBottom`; check which icons the codebase already uses via grep before
  introducing a new one). Keyboard hints render via the small `Kbd`-style
  chips (see the ⌘K chip in `Home.tsx:184` and the `Kbd` component inside
  `SummonPanel.tsx`).

## Commands you will need

| Purpose   | Command                  | Expected on success |
|-----------|--------------------------|---------------------|
| Typecheck | `pnpm exec tsc --noEmit` | exit 0              |
| Run app   | `pnpm tauri dev`         | app launches (manual visual check) |

## Suggested executor toolkit

- If the `treshnanda-taste` skill is available in your environment, invoke it
  before writing the beat/button UI — it encodes this owner's visual and
  motion taste (warm dual-mode premium aesthetic, pill geometry, bold-but-
  never-in-the-way motion).

## Scope

**In scope**:
- `src/components/Onboarding.tsx` (one new beat + BEATS bump)
- `src/routes/Home.tsx` (persistent tray button)

**Out of scope**:
- `src/components/TrayDock.tsx` — no tray-side changes.
- `src-tauri/**` — `show_tray` already exists.
- Onboarding re-runs / "what's new" tours — deferred.
- A shortcuts cheatsheet overlay — separate direction finding.
- Do NOT redesign existing beats or reorder them.

## Git workflow

- Branch: `advisor/010-tray-discoverability`
- Commit style: imperative sentence (match `git log`).
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Add a TrayBeat to onboarding

Insert a new beat between `SummonBeat` (2) and `SetupBeat` (3) — i.e. new
beat index 3, shifting Setup/Finish to 4/5 — and bump `BEATS`. Content,
modeled structurally on `SummonBeat`:

- Title: introduce the tray as the "staging area" (match the app's copy
  voice — short, warm, no exclamation marks; read existing beat copy first).
- Body: three capabilities in one or two sentences each: drop files/images in
  from anywhere; lanes to sort; commit a lane to the board in one step.
- Keyboard hint chip: ⌥⇧Space.
- A "Show me" button that calls `invoke("show_tray")` so the real tray
  appears live next to the onboarding window, plus the standard Next button.

Check how `finish`/`go` and the dot indicator derive from `BEATS` — they are
index-based and should adapt automatically once `BEATS` is bumped; verify by
reading lines 170-200.

**Verify**: `pnpm exec tsc --noEmit` → exit 0; manual: run onboarding (find
how it's triggered — grep for the setting/flag that gates it, e.g. in
`AppShell.tsx` or `settings.ts` — and reset that flag in dev) and step
through all six beats.

### Step 2: Persistent tray button in the board header

In `Home.tsx`'s header, next to the existing controls, add a button:
icon + label "Tray", with the ⌥⇧Space hint (as a `title` tooltip at minimum,
or the codebase's Tooltip component — `src/ui/tooltip.tsx` exists). onClick:
`void invoke("show_tray")`. Match the size/variant of the neighboring header
buttons exactly (copy their className pattern).

**Verify**: `pnpm exec tsc --noEmit` → exit 0; manual: button shows the tray.

## Test plan

Manual only (UI): step through onboarding fully (all beats reachable, dots
correct, Finish still works, "Show me" summons the tray); tray button in the
header summons the tray; both look native to the design (spacing, pill
radius, motion consistent with neighbors) in light and dark appearance if the
app supports both. State in your report which checks you ran.

## Done criteria

- [ ] `pnpm exec tsc --noEmit` exits 0
- [ ] Onboarding has 6 beats with the tray beat at index 3; `BEATS` updated
- [ ] `grep -n "show_tray" src/routes/Home.tsx src/components/Onboarding.tsx` → both present
- [ ] No files outside the in-scope list are modified (`git status`)
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- The beat machinery hardcodes indices beyond the `beat === N` renders
  (e.g. analytics, per-beat side effects keyed by number) such that inserting
  a beat silently breaks a later one — enumerate the couplings you find.
- `show_tray` requires a capability the main window lacks (invoke fails) —
  report; don't edit capabilities yourself.
- You cannot run the app to visually verify — complete the code + typecheck,
  and flag the missing visual check prominently in your report.

## Maintenance notes

- Any future feature of tray scale (e.g. a second dock) should get the same
  treatment from day one: an onboarding beat + a persistent affordance.
- Reviewer should scrutinize the onboarding copy tone against existing beats
  — this owner cares about voice consistency — and the button's visual match.
- Deferred siblings from the same audit finding: surfacing Tab-to-stage
  outside the summon panel, a confidential-items intro, and a "?" shortcuts
  overlay (direction item).
