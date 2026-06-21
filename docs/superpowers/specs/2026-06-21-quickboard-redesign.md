# Quickboard Redesign + Completeness Spec (Plan 3)

**Date:** 2026-06-21
**Direction (chosen):** Dark sidebar + bright, layered content. High contrast, real depth, tasteful color. Premium like refs #4/#5/#10. Fixes "bare / gray / unreadable."
**Sources:** emil-design-eng + motion-design skills + the user's reference images.

## The problem we're fixing
The current UI is low-contrast warm-gray on white (text barely readable), bare (no depth, flat list), missing core actions (edit, category filter, controls), the confidential gate isn't enforced, and the motion update left the add-dialog overlay stuck (dims the whole app). This spec rebuilds the look and completes the functionality.

## Design tokens (replace the washed-out `--qb-*` set in `index.css`)

```css
:root{
  /* surfaces */
  --bg:#f4f4f5;            /* content canvas (cards pop on it) */
  --card:#ffffff;
  --side-bg:#17171a;       /* dark sidebar */
  --side-elev:#1f1f23;
  /* text — HIGH CONTRAST (the core fix) */
  --ink:#0b0b0c;           /* headings — near black */
  --text:#3f3f46;          /* body */
  --muted:#71717a;         /* secondary, use sparingly */
  --faint:#a1a1aa;
  --side-fg:#fafafa; --side-muted:#a1a1aa;
  /* lines + depth */
  --border:#e6e6e4; --hair:#efefed;
  --shadow-sm:0 1px 2px rgba(0,0,0,.05);
  --shadow-card:0 1px 3px rgba(0,0,0,.06), 0 10px 28px -12px rgba(0,0,0,.14);
  --shadow-pop:0 10px 34px rgba(0,0,0,.16);
  /* accent + semantic + category palette */
  --accent:#4f46e5;        /* primary (active, primary buttons) */
  --green:#16a34a; --amber:#d97706; --blue:#3b82f6; --violet:#7c3aed; --rose:#e11d48; --cyan:#0891b2;
  /* radii */
  --r-card:16px; --r-tile:10px; --r-pill:8px;
  /* motion (keep from before) */
  --ease-out:cubic-bezier(0.23,1,0.32,1); --ease-morph:cubic-bezier(0.77,0,0.175,1);
  --dur-quick:140ms; --dur-std:220ms; --dur-slow:360ms;
}
```
Typography: Plus Jakarta Sans. Headings 700–800 in `--ink` (big + bold, like the refs). Section labels 11px/700 uppercase tracked `--faint`. Item label 14–15px/600 `--ink`. Code/value previews in `ui-monospace`, `--muted`. Counts use `tabular-nums`.

## Component treatments

- **Sidebar (dark `--side-bg`):** brand mark + "quickboard" (light), search field (dark, subtle), a prominent **"+ Add item"** button (accent or white). Nav (Home / All items / Settings) where **active = a light/white pill** with dark text (ref #10), hover = `rgba(255,255,255,.06)`. Then sectioned, nested nav with **"+ Add"** affordances (refs #5/#10): **ENVIRONMENTS** (folders the user creates) and **CATEGORIES** (colored dot + count, **clickable → filters Home**). Footer: "Local · encrypted" (green lock) + account row (avatar).
- **Content canvas (`--bg`):** white cards with `--shadow-card` float on the light-gray canvas (depth). Big bold greeting heading in `--ink`. A **controls row** under it: filter chips / sort / view toggle.
- **Quick access cards:** elevated white cards, an **accent-tinted icon tile** (item's category color), bold `--ink` label, a value preview line, and clear **copy** + **drag** + a **"⋯" menu** (edit / customize / delete). Confidential → amber lock + gated.
- **Library:** grouped by category; each item is a high-contrast row (or card) with hover elevation, the colored icon tile, bold label, value/preview, and the same actions + ⋯ menu. Counts as small badges.
- **Item ⋯ menu:** Edit, Customize (accent color / icon), Pin/Unpin, Delete. (Edit reuses the add form prefilled.)
- **Dialog:** FIX the stuck overlay (AnimatePresence/forceMount exit must unmount). High contrast, `--shadow-pop`, scale-in from center, accent primary button.

## Functionality to complete (the missing basics)
1. **Fix:** add-dialog stuck overlay; Quick-access card copy not wired.
2. **Confidential gate (security):** copying/revealing a confidential item triggers **Touch ID** (LAContext `biometric_roundtrip`, made async via `spawn_blocking` to fix latency), with a short session unlock window; mask the value until unlocked. Backend command + UI flow.
3. **Edit** an item (reuse the form, prefilled) + **Delete** (with confirm).
4. **Click a category → filter** Home to it; an **"All items"** view; Home **controls** (sort by recent/name, filter by kind/confidential).
5. **Environments / Folders:** a folder layer above categories — create/rename/delete, assign items, nested nav, "+ Add". Data model + IPC + UI.
6. **Item cosmetics:** per-item accent color + icon (and optional cover later).
7. **a11y:** focus-visible rings, ARIA roles/labels, full keyboard nav, hit targets ≥ 32px, contrast (now satisfied by the palette), `prefers-reduced-motion` respected.

## Execution passes (each verified by the human GUI run)
- **R1:** design tokens overhaul + dark Sidebar (nav, clickable categories, nested-nav scaffold) + **dialog overlay fix** + global contrast. *(biggest visible change → verify the look)*
- **R2:** Home rebuild — layered cards, controls/filter, quick-access copy fix, ⋯ menu (edit/delete), on the new system.
- **R3:** Confidential Touch ID gate (backend async + UI).
- **R4:** Environments/Folders (model + nav + assign) + item cosmetics.
- **R5:** a11y + edit polish + final review.

Keep the motion from before (press, hover-reveal, copy→Check, pin fly-to-quick-access, slot-text counts, nav indicator) — re-applied on the new design, all with reduced-motion fallbacks.
