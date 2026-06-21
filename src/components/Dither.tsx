/**
 * Reusable monochrome 1-bit / halftone dither (R2.5).
 *
 * `DitherDefs` renders a single hidden <svg> holding the reusable filter; mount
 * it once near the app root. The filter chain is:
 *   feTurbulence (fractal noise) -> feColorMatrix (saturate 0 -> grayscale)
 *   -> feComponentTransfer (discrete threshold -> hard 1-bit black/white)
 * Applying it to a flat ink fill yields a stippled, low-contrast texture that
 * fits the ink-first system (no color).
 *
 * `DitherPanel` is a tasteful empty-state illustration that uses the filter:
 * a soft rounded card lit by the dither texture with a faint ink-line motif.
 */

export const DITHER_FILTER_ID = "qb-dither";

/** Mount once (e.g. in AppShell). Renders only the reusable SVG <filter>. */
export function DitherDefs() {
  return (
    <svg
      width="0"
      height="0"
      aria-hidden="true"
      focusable="false"
      style={{ position: "absolute", pointerEvents: "none" }}
    >
      <defs>
        <filter id={DITHER_FILTER_ID} x="0" y="0" width="100%" height="100%">
          {/* Fractal noise field — the source of the stipple pattern. */}
          <feTurbulence
            type="fractalNoise"
            baseFrequency="0.9"
            numOctaves="2"
            seed="7"
            stitchTiles="stitch"
            result="noise"
          />
          {/* Strip all color -> pure grayscale (saturate 0). */}
          <feColorMatrix in="noise" type="saturate" values="0" result="gray" />
          {/* Discrete threshold -> hard 1-bit (black/white) dither dots. */}
          <feComponentTransfer in="gray" result="bits">
            <feFuncR type="discrete" tableValues="0 0 1 1" />
            <feFuncG type="discrete" tableValues="0 0 1 1" />
            <feFuncB type="discrete" tableValues="0 0 1 1" />
            <feFuncA type="discrete" tableValues="0 1" />
          </feComponentTransfer>
          {/* Mask the dither by the element's own alpha so it stays in-shape. */}
          <feComposite in="bits" in2="SourceAlpha" operator="in" />
        </filter>
      </defs>
    </svg>
  );
}

/**
 * Monochrome dithered illustration for empty states. A rounded panel filled
 * with the 1-bit dither texture, framed by a faint ink hairline; subtle and
 * low-contrast by design.
 */
export function DitherPanel({ size = 132 }: { size?: number }) {
  return (
    <svg
      className="qb-dither"
      width={size}
      height={size}
      viewBox="0 0 132 132"
      role="img"
      aria-label="Empty"
    >
      {/* Dithered fill, clipped to a rounded square. */}
      <clipPath id="qb-dither-clip">
        <rect x="6" y="6" width="120" height="120" rx="22" />
      </clipPath>
      <g clipPath="url(#qb-dither-clip)">
        <rect
          x="0"
          y="0"
          width="132"
          height="132"
          fill="currentColor"
          filter={`url(#${DITHER_FILTER_ID})`}
        />
      </g>
      {/* Faint ink frame + a minimal "stacked cards" motif. */}
      <rect
        x="6"
        y="6"
        width="120"
        height="120"
        rx="22"
        fill="none"
        stroke="currentColor"
        strokeOpacity="0.5"
        strokeWidth="1.5"
      />
      <g
        fill="none"
        stroke="currentColor"
        strokeOpacity="0.7"
        strokeWidth="2"
        strokeLinejoin="round"
      >
        <rect x="38" y="50" width="56" height="34" rx="8" />
        <line x1="50" y1="62" x2="82" y2="62" />
        <line x1="50" y1="72" x2="70" y2="72" />
      </g>
    </svg>
  );
}
