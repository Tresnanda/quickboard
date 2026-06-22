// Pinboard color (R-pinboard). The sticky-note board is the new design
// direction: notes carry a SOFT warm wash and a colored pushpin keyed off the
// item's category. Color here is the default category tint (a calm, premium
// palette); per-note custom colors are future personalization. Uncategorised
// items fall back to a neutral paper.

// A small, calm palette — saturated enough to read as "this note is Finance",
// soft enough to stay premium against the warm #fbfaf7 paper. Deterministically
// assigned from the category name so the same category always gets the same hue.
const PALETTE = [
  "#7a8cff", // indigo
  "#e0a01f", // amber
  "#2faf54", // green
  "#c98bb6", // mauve
  "#3b6fe2", // blue
  "#7a3be2", // violet
  "#e2683b", // coral
  "#0891b2", // cyan
];

// FNV-1a 32-bit hash → stable palette index per category name.
function hash(seed: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

const NEUTRAL = "#a1a1aa"; // --faint, used for uncategorised paper/pin.

function isUncategorised(name?: string): boolean {
  if (!name) return true;
  const n = name.trim().toLowerCase();
  return n.length === 0 || n === "uncategorized" || n === "uncategorised";
}

/**
 * The note's category color — drives the pushpin gradient and the soft paper
 * tint (`color-mix(... var(--catColor) 14% ...)`). Uncategorised items get a
 * neutral gray so they read as plain paper.
 */
export function categoryColor(name?: string): string {
  if (isUncategorised(name)) return NEUTRAL;
  return PALETTE[hash(name as string) % PALETTE.length];
}

/**
 * Monochrome icon-tile treatment (legacy helper kept for any non-board surface).
 * Neutral gray surface + ink glyph; `confidential` shifts to a subtly deeper ink
 * wash, never an amber/orange tile.
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
