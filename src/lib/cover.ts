// Auto-generated covers for items without a photo. A flow-gradient *shader* bakes
// each cover once (see ./gradient-shader) for organic, noise-warped color that flat
// CSS radial blobs can't match; if WebGL is unavailable we fall back to a layered
// CSS mesh. Each tint walks a harmonious hue range so no two repeat. Pair with
// `qb-grain` for the risograph spray texture.

import type { TintName } from "./tints";
import { bakeCover, type RGB } from "./gradient-shader";

// [hueStart°, hueEnd°, saturation%] — a tasteful, analogous range per tint.
// The sweep stays inside the family, so blends read coherent, not a color wheel.
const TINT_RANGE: Record<TintName, [number, number, number]> = {
  sand: [36, 54, 46],
  amber: [28, 52, 56],
  clay: [10, 40, 52],
  rose: [320, 358, 52],
  lilac: [262, 320, 50],
  violet: [232, 314, 54],
  slate: [208, 258, 36],
  sky: [196, 248, 54],
  mint: [146, 178, 44],
  sage: [86, 128, 40],
  stone: [34, 50, 10],
  graphite: [28, 46, 7],
};

function hash(seed: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

function hsl(h: number, s: number, l: number): string {
  return `hsl(${(((h % 360) + 360) % 360).toFixed(1)} ${s}% ${l}%)`;
}

function hslHex(h: number, s: number, l: number): string {
  const [r, g, b] = hslToRgb(h, s, l);
  const to = (x: number) => Math.round(x * 255).toString(16).padStart(2, "0");
  return `#${to(r)}${to(g)}${to(b)}`;
}

/** Three hex colors across a tint's (widened) hue range — for the live ShaderGradient
 * on modal headers. Deterministic per (seed, tint). */
export function coverColors(seed: string, tint: TintName): [string, string, string] {
  const h = hash(seed);
  const [start, end, sat] = TINT_RANGE[tint];
  const rot = (((h >>> 0) & 0xff) / 255) * 28 - 14;
  const cx = start + (end - start) / 2;
  const half = ((end - start) / 2) * 1.4;
  let a = cx - half + rot;
  let b = cx + half + rot;
  if ((h & 0x10000) !== 0) [a, b] = [b, a];
  const at = (t: number) => a + (b - a) * t;
  // pastel: keep saturation low (ShaderGradient's 3D lighting amplifies it) but
  // lightness high, and let brightness do the lifting — soft, not dark, not vivid.
  const S = Math.min(54, Math.round(sat * 1.02));
  return [hslHex(at(0.12), S, 71), hslHex(at(0.5), Math.round(S * 0.88), 81), hslHex(at(0.86), Math.round(S * 0.72), 90)];
}

// HSL (deg, %, %) → linear-ish RGB in 0..1 for the shader uniforms.
function hslToRgb(h: number, s: number, l: number): RGB {
  h = ((((h % 360) + 360) % 360) / 360);
  s /= 100;
  l /= 100;
  if (s === 0) return [l, l, l];
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const c = (t: number) => {
    t = (t % 1 + 1) % 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  return [c(h + 1 / 3), c(h), c(h - 1 / 3)];
}

/**
 * A deterministic flow gradient for an item. Shader-baked (organic noise warp) with
 * a layered CSS-mesh fallback. Soft pastel — the grain carries the texture, not the
 * color. Stable per (seed, tint).
 */
export function coverGradient(seed: string, tint: TintName): string {
  const h = hash(seed);
  const [start, end, sat] = TINT_RANGE[tint];
  const f = (shift: number, lo: number, hi: number) => lo + (((h >>> shift) & 0xff) / 255) * (hi - lo);
  const i = (shift: number, lo: number, hi: number) => Math.round(f(shift, lo, hi));

  // widen the hue sweep ~45% for a smooth multi-hue blend (blue→lilac, coral→peach…)
  const rot = f(0, -14, 14);
  const cx = start + (end - start) / 2;
  const half = ((end - start) / 2) * 1.4;
  let a = cx - half + rot;
  let b = cx + half + rot;
  const flip = (h & 0x10000) !== 0 ? -1 : 1;
  if (flip < 0) [a, b] = [b, a];
  const at = (t: number) => a + (b - a) * t;

  // Luminous soft color — richer & more saturated than flat pastel, like a defocused
  // light blur. Stays tinted (not white) into the highlights; the shader sheen lifts it.
  const S = Math.min(68, Math.round(sat * 1.35));
  const L = { deep: 70, mid: 79, glow: 84, edge: 89 };
  const sEdge = Math.round(S * 0.82);
  const sGlow = Math.min(72, S + 2);

  // shader bake (preferred)
  const baked = bakeCover(
    `${seed}|${tint}`,
    hslToRgb(at(0.74), S, L.deep),
    hslToRgb(at(0.42), S, L.mid),
    hslToRgb(at(0.9), sGlow, L.glow),
    hslToRgb(at(0.06), sEdge, L.edge),
    ((h >>> 28) & 0xff) / 32, // seed offset for the noise field
    flip,
  );
  if (baked) return baked;

  // CSS-mesh fallback
  const col = (t: number, l: number, s = S) => hsl(at(t), s, l);
  const deep = col(0.74, L.deep);
  const mid = col(0.42, L.mid);
  const glow = col(0.92, L.glow, sGlow);
  const edge = col(0.06, L.edge, sEdge);
  const angle = i(24, 100, 210);
  return [
    `radial-gradient(80% 92% at ${i(2, 2, 26)}% ${i(5, 6, 30)}%, ${deep} 0%, transparent 56%)`,
    `radial-gradient(72% 86% at ${i(8, 72, 98)}% ${i(11, 4, 26)}%, ${glow} 0%, transparent 54%)`,
    `radial-gradient(88% 98% at ${i(14, 66, 99)}% ${i(17, 68, 99)}%, ${mid} 0%, transparent 58%)`,
    `radial-gradient(96% 104% at ${i(19, 2, 30)}% ${i(22, 66, 99)}%, ${deep} 0%, transparent 60%)`,
    `linear-gradient(${angle}deg, ${edge}, ${mid} 33%, ${deep} 60%, ${glow})`,
  ].join(", ");
}
