// Ink-first / monochrome (R2.5). The earlier multi-color category palette is
// REMOVED from general use: tiles, dots and indicators are now neutral ink/gray
// so the UI reads ~95% grayscale like the references. Color is reserved for a
// rare, genuinely-meaningful signal (e.g. the "Local · encrypted" lock) and is
// NOT keyed off category here.

/**
 * Neutral dot color for a category indicator. Monochrome — a subtle gray, the
 * same for every category (no saturated reds/teals/violets). Kept as a function
 * so call sites don't need to change.
 */
export function categoryColor(_name?: string): string {
  return "var(--faint)";
}

/**
 * Monochrome icon-tile treatment. Neutral gray surface + ink glyph, NO colored
 * background and NO colored border. `confidential` shifts to a subtle ink lock
 * treatment (a touch darker), never an amber/orange tile.
 */
export function categoryTile(
  _name?: string,
  confidential = false,
): {
  bg: string;
  border: string;
  fg: string;
} {
  if (confidential) {
    return {
      // Subtle ink wash for the lock — still monochrome, just slightly deeper.
      bg: "rgba(11, 11, 12, 0.06)",
      border: "rgba(11, 11, 12, 0.12)",
      fg: "var(--ink)",
    };
  }
  return {
    bg: "var(--hair)",
    border: "var(--border)",
    fg: "var(--ink)",
  };
}
