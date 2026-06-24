// The Soft Paper wardrobe — a curated, desaturated tint palette. Each tint is a
// full set of tokens (card surface, icon tile, pin, sidebar badge) so an item
// "dressed" in a tint is coherent everywhere it appears. Tasteful by
// construction: a fixed palette, never a raw color picker.

import type { Item } from "./types";

export type TintName =
  | "sand" | "amber" | "clay" | "rose" | "lilac" | "violet"
  | "slate" | "sky" | "mint" | "sage" | "stone" | "graphite";

export type Tint = {
  name: TintName;
  label: string;
  card: string;     // card surface
  tile: string;     // icon-tile background
  tileInk: string;  // icon-tile glyph
  pin: string;      // pin nub
  badgeBg: string;  // sidebar count badge bg
  badgeInk: string; // sidebar count badge text
};

export const TINTS: Record<TintName, Tint> = {
  sand:     { name: "sand",     label: "Sand",     card: "#f3eee2", tile: "#e8ddc4", tileInk: "#8a7340", pin: "#b89b54", badgeBg: "#ece2c8", badgeInk: "#85702f" },
  amber:    { name: "amber",    label: "Amber",    card: "#f7efda", tile: "#ece0bd", tileInk: "#8f7320", pin: "#c6a23f", badgeBg: "#f1e6c6", badgeInk: "#8a6f1f" },
  clay:     { name: "clay",     label: "Clay",     card: "#f4e8df", tile: "#ead7cb", tileInk: "#95684c", pin: "#b07e5e", badgeBg: "#eddccf", badgeInk: "#8a6047" },
  rose:     { name: "rose",     label: "Rose",     card: "#f6eaee", tile: "#efdce0", tileInk: "#a35e6c", pin: "#b86a78", badgeBg: "#f0dce1", badgeInk: "#a25c6a" },
  lilac:    { name: "lilac",    label: "Lilac",    card: "#efeaf6", tile: "#e4ddf2", tileInk: "#6b5ca8", pin: "#8674c4", badgeBg: "#e8e0f5", badgeInk: "#6a5aa6" },
  violet:   { name: "violet",   label: "Violet",   card: "#ece7f6", tile: "#ddd4ef", tileInk: "#5f4fa0", pin: "#7a68c0", badgeBg: "#e7e1f3", badgeInk: "#6a59ad" },
  slate:    { name: "slate",    label: "Slate",    card: "#e8edf3", tile: "#d8dfe8", tileInk: "#4f5b6b", pin: "#5b6678", badgeBg: "#dee4ed", badgeInk: "#4f5b6b" },
  sky:      { name: "sky",      label: "Sky",      card: "#e4eef5", tile: "#d3e3ee", tileInk: "#3c6783", pin: "#5b88a6", badgeBg: "#d8e6f0", badgeInk: "#3c6783" },
  mint:     { name: "mint",     label: "Mint",     card: "#e6f2ea", tile: "#d2e7d9", tileInk: "#437a58", pin: "#5a9b6f", badgeBg: "#d8ecde", badgeInk: "#3f7a57" },
  sage:     { name: "sage",     label: "Sage",     card: "#ecf0e6", tile: "#dde6cf", tileInk: "#5f7344", pin: "#7e9456", badgeBg: "#e2ead3", badgeInk: "#5d7142" },
  stone:    { name: "stone",    label: "Stone",    card: "#edecea", tile: "#dededa", tileInk: "#6b6a63", pin: "#8d8c84", badgeBg: "#e6e5e1", badgeInk: "#6b6a63" },
  graphite: { name: "graphite", label: "Graphite", card: "#e4e4e2", tile: "#d3d3cf", tileInk: "#4a4a47", pin: "#6b6b66", badgeBg: "#dcdcd8", badgeInk: "#4a4a47" },
};

export const TINT_NAMES = Object.keys(TINTS) as TintName[];

// Deterministic default tint for a category, so an undressed item still reads as
// "this is Work / Finance". Stable per category name (FNV-1a → palette index).
function hash(seed: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

// A pleasant default rotation that avoids neutral stone/graphite for real
// categories (those read as "uncategorised").
const DEFAULT_ROTATION: TintName[] = [
  "violet", "amber", "slate", "mint", "clay", "sky", "rose", "sage", "lilac", "sand",
];

export function categoryTint(category?: string): TintName {
  const name = (category ?? "").trim();
  if (!name) return "stone";
  return DEFAULT_ROTATION[hash(name.toLowerCase()) % DEFAULT_ROTATION.length];
}

import { getAppearance } from "./appearance";

/** The tint an item should wear: explicit override, else its category default. */
export function itemTint(item: Item): TintName {
  return getAppearance(item.id).tint ?? categoryTint(item.category);
}
