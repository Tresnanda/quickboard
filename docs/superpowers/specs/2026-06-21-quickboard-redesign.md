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

---

## REVISION — design corrections (SUPERSEDE the above where they conflict)

After R1+R2 the look was over-colored and had hard edges. Corrections:

1. **Ink-first / mostly monochrome.** The whole UI is ink — near-black, grays, white. Color is RARE and only "where it matters." Remove the multi-color category palette from tiles and general use. The **"+ Add item" primary button = ink/near-black** (NOT indigo `--accent`). Category indicators = a small **neutral/ink** dot or none — not saturated reds/teals/violets. Keep a single accent token but use it almost never (a lone meaningful signal). Match the references: they are ~95% grayscale.
2. **HARD BAN — colored icon tiles + colored borders.** Item icon tiles (the key/lock tiles) MUST be **monochrome**: neutral gray bg (`--hair`/`#f3f3f2`) + ink icon, NO colored background, NO colored border. Confidential = an **ink lock + subtle treatment**, never an amber/orange tile.
3. **Soft, floating, rounded shell — remove hard edges.** Add an outer **canvas** behind everything; the sidebar and the main content become **rounded floating panels** with a visible **gap** between them (refs #14/#15), not full-bleed rectangles meeting at a hard seam. Rounded outer corners (~16–20px), inset margins, soft shadows; content floats as a rounded card on the canvas. Keep the macOS traffic-light area clear at the top-left.
4. **Soft edges everywhere.** Cards, panels, inputs, buttons, tiles, menus all generously rounded; nothing meets at a hard seam.
5. **Dithered imagery.** Where the UI shows imagery (empty states now; item covers later), use a **monochrome dithered / halftone** treatment (refs #16/#17/#18). Implement a reusable dither (SVG `feTurbulence`→threshold, or a tiled 1-bit pattern) — subtle, low-contrast, black/white (fits ink-first). Apply to the empty state in this pass.
6. **Component libraries.** Continue with **Radix primitives** (dialog, dropdown-menu, and add tooltip/popover as needed), styled to the system.

---

## FINAL shell + dither motif (BUILD TO THIS — supersedes earlier shell attempts)

**Shell — match the mockup `.superpowers/brainstorm/35019-1782056093/content/target-final.html` exactly:**
- **Two separate rounded cards** (a **LIGHT sidebar card** + a white main card) on a thin neutral canvas (`#e7e7e5`), with a **small** ~8px gap between + ~8px margin around. NOT a big floating gap, NOT flat edge-to-edge.
- **Light sidebar card** (`#f6f6f4`, hairline border): a **logo mark** (ink rounded-square + glyph) + "quickboard" + BETA pill; a light search field; an **ink/near-black "Add item"** button; nav (Home / All items / Settings) where **active = an elevated WHITE pill with a soft shadow** (inactive = muted gray); CATEGORIES (neutral dots + counts, clickable→filter); ENVIRONMENTS label + "+ Add" (coming soon); footer = "Local · encrypted" (small green lock) + a **refined account row** (gradient avatar + "you / Local on this Mac" + a switcher chevron, in a bordered white pill).
- **Main card** (white): **two-tone heading** ("Good **evening**" — 2nd word dimmed), controls (segmented + chips), subtle quick-access cards, hairline-divided library list, meta footer with an **amber "N confidential" badge**.
- **Colored badges only where meaningful** (amber confidential, green encrypted) — everything else ink/neutral.

**Window: edge-to-edge + DRAGGABLE.** Keep `titleBarStyle: Overlay`. The move-window bug must be fixed: put `-webkit-app-region: drag` on the canvas margins/gaps and the sidebar's empty/brand area; `no-drag` on every interactive element. Traffic lights overlay the light sidebar top-left (clear of the brand).

**DITHER MOTIF — every modal & popup card.** Build a reusable **`<DitherArt>`** React component: a `<canvas>` that renders a soft procedural source (gradient / overlapping cloud blobs) and applies a **real ordered Bayer (4×4 or 8×8) 1-bit monochrome dither** — authentic dithering, NOT a CSS dot/noise background. Use it as a decorative header or side panel in **EVERY modal / popup card**: the Add-item dialog now; the confidential-unlock, edit, and customize dialogs as they're built (R3–R5); plus the empty state and (R4) default item covers. Monochrome, tasteful, subtle.

---

## PREMIUM + React design-power + full interactive layer (FINAL build target)

The app currently reads "generic admin panel." Make it premium + uniquely crafted + powerful, leveraging what only code/React can do.

**1. Premium visual — match `.superpowers/brainstorm/47183-1782062785/content/target-premium.html`:**
- **Depth:** every card/group uses layered soft `box-shadow` (shadows over hard borders). iOS **squircle** radii (16–20px); inset shadows on tiles.
- **Denser, richer Quick-access cards** (3-up): icon tile + label + **value preview** (mono) + a glassy copy button — not one giant half-empty card.
- **Library = iOS grouped-inset lists:** each category is a rounded container with hairline-divided rows (iOS Settings style).
- **iOS sheet** for the Add modal (slides up from bottom, grab handle, rounded top corners), springy press (`scale(0.96)`).

**2. React design-power (generative / dynamic visuals — what the user means by "power"):**
- **Generative per-item dither identity:** extend `DitherArt` with a `seed` param → a **unique deterministic** monochrome dithered pattern hashed from the item's label, used as the item's tile/cover art (every item visually distinct, all code-generated). The dither motif becomes the app's signature.
- **Confidential = animated frost:** confidential values render as a frosted/dithered blur + "Touch ID to reveal"; unlocking animates the frost away (sets up R3).
- **Generative avatar** (deterministic gradient/dither). **Reactive** hover/press effects; spring-driven shared-layout morphs (pin fly, copy morph).

**3. Full interactive layer (keyboard-driven power tool):**
- **⌘K command palette:** overlay, instant fuzzy search, `↑↓` nav, **Enter = copy**, `⌘Enter` = drag, Esc close.
- **Keyboard nav on Home:** `↑↓`/`j k` through items, `Enter`/`c` copy, `p` pin, `e` edit, `/` focus search, `⌘1–9` nav.
- **Live fuzzy search + match highlighting,** ranked by most-used (`last_used_at`/`use_count`).
- **Optimistic + animated state** (instant pin/add/delete with spring).
- **Inline quick-edit** (double-click a value → edit → save on blur) + **hover-to-peek**.

Apply **emil-design-eng + motion-design + make-interfaces-feel-better** throughout. Ink-first, no emoji, shadcn primitives, reduced-motion + a11y, exact-pin deps.
