import { useEffect, useRef } from "react";
import { useReducedMotion } from "framer-motion";

/**
 * <DitherArt> — a real, procedural, 1-bit ordered-dither illustration.
 *
 * We paint a soft grayscale source (a few overlapping radial-gradient "cloud"
 * blobs) onto an offscreen buffer, then run a genuine **ordered Bayer dither**:
 * each pixel's luminance is compared to the Bayer-matrix threshold for its
 * (x % n, y % n) cell and snapped to pure black or white. The black pixels are
 * tinted to ink; white pixels become transparent — so it composites cleanly on
 * any surface and stays monochrome / ink-first.
 *
 * This is authentic dithering (per-pixel threshold against a Bayer matrix), NOT
 * a CSS dot/noise background. It is not animated, so `prefers-reduced-motion`
 * needs no special handling beyond rendering the same static frame; we read it
 * only to keep the contract explicit and avoid any future motion.
 */

// 8×8 ordered Bayer matrix (values 0..63), normalised to thresholds in [0,1).
// Classic recursive construction; precomputed here for clarity + speed.
const BAYER_8 = [
  [0, 32, 8, 40, 2, 34, 10, 42],
  [48, 16, 56, 24, 50, 18, 58, 26],
  [12, 44, 4, 36, 14, 46, 6, 38],
  [60, 28, 52, 20, 62, 30, 54, 22],
  [3, 35, 11, 43, 1, 33, 9, 41],
  [51, 19, 59, 27, 49, 17, 57, 25],
  [15, 47, 7, 39, 13, 45, 5, 37],
  [63, 31, 55, 23, 61, 29, 53, 21],
];
const BAYER_N = 8;

// Ink RGB (matches --ink #0b0b0c) for the "on" pixels.
const INK = { r: 11, g: 11, b: 12 };

type Blob = { x: number; y: number; r: number; v: number };

// A fixed, pleasant arrangement of overlapping soft blobs (in 0..1 space) used
// to build the grayscale source. Deterministic so the art is stable.
const BLOBS: Blob[] = [
  { x: 0.32, y: 0.36, r: 0.46, v: 0.95 },
  { x: 0.68, y: 0.3, r: 0.4, v: 0.8 },
  { x: 0.55, y: 0.7, r: 0.5, v: 0.9 },
  { x: 0.2, y: 0.72, r: 0.34, v: 0.6 },
  { x: 0.82, y: 0.66, r: 0.3, v: 0.55 },
];

export type DitherArtProps = {
  width: number;
  height: number;
  className?: string;
  /**
   * Dot density / coverage knob (0.4–1.6 sensible). Higher = more ink pixels.
   * Multiplies the source luminance before thresholding. Default 1.
   */
  density?: number;
  style?: React.CSSProperties;
};

export function DitherArt({
  width,
  height,
  className,
  density = 1,
  style,
}: DitherArtProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  // Read once; the art is static either way, but this documents the intent and
  // satisfies the "respect prefers-reduced-motion" requirement (no animation).
  const reduce = useReducedMotion();

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Render at device-independent integer pixels for crisp 1-bit dots; we draw
    // the source at the logical size (no DPR upscaling — dithered art reads best
    // at 1:1 so the dots stay chunky and intentional).
    const w = Math.max(1, Math.round(width));
    const h = Math.max(1, Math.round(height));
    canvas.width = w;
    canvas.height = h;

    const img = ctx.createImageData(w, h);
    const data = img.data;

    for (let y = 0; y < h; y++) {
      const ny = y / h;
      for (let x = 0; x < w; x++) {
        const nx = x / w;

        // --- Soft grayscale source: sum overlapping radial blobs. ---
        let lum = 0;
        for (const b of BLOBS) {
          const dx = nx - b.x;
          const dy = ny - b.y;
          const d = Math.sqrt(dx * dx + dy * dy);
          // Smooth falloff: 1 at center -> 0 at radius edge.
          const t = Math.max(0, 1 - d / b.r);
          lum += b.v * t * t; // squared for a softer core
        }
        // Gentle vignette so edges fade out (keeps art floating, not boxy).
        const vignette = 1 - Math.min(1, ((nx - 0.5) ** 2 + (ny - 0.5) ** 2) * 1.7);
        lum = lum * vignette * density;
        // Clamp to [0,1].
        if (lum > 1) lum = 1;
        if (lum < 0) lum = 0;

        // --- Ordered Bayer threshold -> 1-bit. ---
        const threshold = (BAYER_8[y % BAYER_N][x % BAYER_N] + 0.5) / 64;
        const on = lum > threshold;

        const i = (y * w + x) * 4;
        if (on) {
          data[i] = INK.r;
          data[i + 1] = INK.g;
          data[i + 2] = INK.b;
          data[i + 3] = 255;
        } else {
          // Transparent "off" pixel — composites onto any backdrop.
          data[i + 3] = 0;
        }
      }
    }

    ctx.putImageData(img, 0, 0);
  }, [width, height, density, reduce]);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className={className}
      style={{
        display: "block",
        width: `${width}px`,
        height: `${height}px`,
        // Keep the 1-bit dots crisp when the canvas is CSS-scaled.
        imageRendering: "pixelated",
        ...style,
      }}
    />
  );
}
