// Stable category -> token color mapping, hashed by name so the same
// category always renders the same accent across Sidebar and Home.

const PALETTE = [
  "var(--accent)",
  "var(--green)",
  "var(--amber)",
  "var(--blue)",
  "var(--violet)",
  "var(--rose)",
  "var(--cyan)",
] as const;

// Concrete hex values parallel to PALETTE, used where we need a translucent
// tint (rgba) that CSS `var()` can't express on its own — e.g. the accent-
// tinted icon tiles on cards. Kept in sync with index.css.
const PALETTE_HEX = [
  "#4f46e5", // accent
  "#16a34a", // green
  "#d97706", // amber
  "#3b82f6", // blue
  "#7c3aed", // violet
  "#e11d48", // rose
  "#0891b2", // cyan
] as const;

function indexFor(name: string): number {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = (hash * 31 + name.charCodeAt(i)) | 0;
  }
  return Math.abs(hash) % PALETTE.length;
}

/** Solid token color (CSS var) for a category — dots, icon glyphs, accents. */
export function categoryColor(name: string): string {
  return PALETTE[indexFor(name)];
}

/** Concrete hex for a category (when rgba math is needed). */
export function categoryHex(name: string): string {
  return PALETTE_HEX[indexFor(name)];
}

/**
 * Accent-tinted surface for an icon tile in the category color: a soft
 * translucent wash + a matching hairline border, plus the solid glyph color.
 */
export function categoryTile(name: string): {
  bg: string;
  border: string;
  fg: string;
} {
  const hex = PALETTE_HEX[indexFor(name)];
  return {
    bg: hexToRgba(hex, 0.1),
    border: hexToRgba(hex, 0.22),
    fg: hex,
  };
}

function hexToRgba(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
