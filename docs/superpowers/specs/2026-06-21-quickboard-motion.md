# Quickboard Motion & Microinteractions Spec

**Date:** 2026-06-21
**Applies to:** the Plan 2 app shell (Sidebar, Home, ItemRow, AddItemDialog, Settings).
**Sources:** emil-design-eng + motion-design skills.

## Motion identity (cohesion — apply consistently)

- **Personality: Premium** — elegant, crisp, restrained. NOT playful/bouncy (would cheapen the ink aesthetic). Reserve a single subtle pop for copy-success only.
- **Signature easing (CSS vars in `index.css`):**
  - `--ease-out: cubic-bezier(0.23, 1, 0.32, 1)` — entrances / UI.
  - `--ease-morph: cubic-bezier(0.77, 0, 0.175, 1)` — on-screen morphs.
- **Duration palette:** `--dur-quick: 140ms` (press/hover), `--dur-std: 220ms` (rows/dropdowns/dialog), `--dur-slow: 360ms` (shared-layout morphs).
- **Entrance pattern:** fade + ~7px rise, `--ease-out`, stagger 35ms (cap total < 500ms).

## Hard rules (do not violate)

- **Instant where it repeats:** search typing/filtering produces results immediately — no per-keystroke animation. (The list *reflow* may animate via FLIP/layout, but filtering itself is instant.)
- **Never animate** anything triggered 100+×/day with a flourish.
- **`prefers-reduced-motion: reduce`** → opacity/color transitions only, NO transform/position motion. Use `useReducedMotion()` for Framer Motion paths.
- **Hover effects** gated behind `@media (hover: hover) and (pointer: fine)`.
- **Performance:** animate `transform`/`opacity` only; CSS transitions for predetermined/interruptible UI, Framer Motion for dynamic/shared-layout morphs; prefer full `transform` strings for hardware accel.
- **No `transition: all`**, no `scale(0)` entrances (start `scale(0.96)`+opacity), no `ease-in` on UI.

## Microinteractions

1. **Pressables** (all buttons + action icons): `transform: scale(0.97)` on `:active`, `--dur-quick` `--ease-out`.
2. **ItemRow hover:** subtle bg tint (`--qb-hair`) + the row's actions fade + slide in (~6px), 160ms, hover-media-gated. Resting state shows a quiet affordance so it's discoverable without hover.
3. **Copy → Check morph:** on copy, the action morphs: `Copy` icon → `Check`, label "copy" → "Copied", `--qb-green` accent, Emil's blur-masked crossfade (`filter: blur(2px)` + opacity during swap, < 20px blur). Auto-revert after ~1200ms.
4. **AddItemDialog:** enter = scale `0.96`→`1` + opacity + subtle blur, `transform-origin: center` (modal), 240ms `--ease-out`; backdrop fade. Exit faster (160ms). Respect reduced-motion (opacity only).
5. **Entrance stagger:** Quick-access cards + library rows fade+rise with 35ms stagger on mount. Decorative — never block interaction.
6. **Add success:** the newly added row enters + a brief one-shot highlight fade (`--qb-amber`/`--qb-green` tint → transparent, ~600ms).

## Signature morphs (the "strong impressions")

1. **Pin → fly-to-Quick-access (headline):** use Framer Motion shared-layout (`layout` + a shared `layoutId` keyed by item id) so toggling `pinned` animates the row morphing into / out of the Quick-access grid. `--dur-slow` `--ease-morph`. Wrap in `LayoutGroup`. Reduced-motion → cross-fade instead of morph.
2. **Copy → Check** (see microinteraction #3) — counts as a morph.
3. **slot-text count rolls:** the Home meta-footer counts ("N items · M files · K confidential") and the Settings stat numbers use `slot-text` (`slot-text/react`) so they odometer-roll when they change (e.g., after add/delete). Import its `style.css`. Reduced-motion → plain number.
4. **Sidebar active-nav indicator:** a morphing indicator (pill/left-bar) that slides between Home/Settings using a shared `layoutId` (`motion.div` with `layout`), `--dur-std` `--ease-out`.
5. **List filter reflow:** when the search filter changes the visible set, rows reposition with Framer Motion `layout` (FLIP), not an instant jump.

## Verification
Visual only (human GUI run): each microinteraction present, the 4 morphs read clearly, reduced-motion path is calm, nothing janky under the search box. Review the morphs in slow-motion (temporarily 3× duration) per Emil before finalizing.
