import gradientDither from "../assets/gradient-dither.png";

/**
 * GradientBrand — the ONE place the user's `gradient-dither.png` shader is
 * allowed. It is a BRAND-ONLY accent: the minting-sheet art band and the Home
 * empty-state panel. It must NEVER appear on item seals, icons, bento tiles, or
 * covers — those stay ink-first monochrome (`DitherArt`).
 *
 * Renders the gradient image as a `background-image` cover band with a subtle
 * pure-black image outline (so it doesn't float borderless) and an optional
 * small serif "quickboard" wordmark overlaid in the corner.
 */
export function GradientBrand({
  height = 96,
  wordmark = true,
  radius = "var(--r-card)",
  className,
  style,
}: {
  height?: number;
  wordmark?: boolean;
  radius?: string;
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <div
      aria-hidden="true"
      className={`qb-img-outline${className ? ` ${className}` : ""}`}
      style={{
        position: "relative",
        height: `${height}px`,
        borderRadius: radius,
        overflow: "hidden",
        backgroundImage: `url(${gradientDither})`,
        backgroundSize: "cover",
        backgroundPosition: "center",
        ...style,
      }}
    >
      {wordmark && (
        <span
          className="font-serif-brand"
          style={{
            position: "absolute",
            left: "0.875rem",
            bottom: "0.75rem",
            fontSize: "0.9375rem",
            fontWeight: 600,
            color: "#ffffff",
            textShadow: "0 1px 8px rgba(0,0,0,0.45)",
            letterSpacing: "-0.015em",
          }}
        >
          quickboard
        </span>
      )}
    </div>
  );
}
