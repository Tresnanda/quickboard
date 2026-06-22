import gradientDither from "../assets/gradient-dither.png";

/**
 * GradientBrand — the ONE place the user's `gradient-dither.png` shader is
 * allowed. It is a BRAND-ONLY accent used in EXACTLY one spot: the minting-sheet
 * brand panel (`AddItemDialog`). It must NEVER appear on item seals, icons, note
 * tiles, covers, or empty states — those stay clean ink-first glyph tiles.
 *
 * Renders the gradient image as a `background-image` cover surface with a subtle
 * pure-black image outline (so it doesn't float borderless) and an optional
 * small "quickboard" wordmark (Plus Jakarta) overlaid in a corner. Pass
 * `fill` to make it stretch to its container's full height (used as the minting
 * sheet's full-panel background).
 */
export function GradientBrand({
  height = 96,
  fill = false,
  wordmark = true,
  wordmarkPlacement = "bottom-left",
  radius = "var(--r-card)",
  className,
  style,
  children,
}: {
  height?: number;
  fill?: boolean;
  wordmark?: boolean;
  wordmarkPlacement?: "bottom-left" | "top-left";
  radius?: string;
  className?: string;
  style?: React.CSSProperties;
  children?: React.ReactNode;
}) {
  const wordmarkPos: React.CSSProperties =
    wordmarkPlacement === "top-left"
      ? { left: "1rem", top: "0.9rem" }
      : { left: "0.875rem", bottom: "0.75rem" };

  return (
    <div
      className={`qb-img-outline${className ? ` ${className}` : ""}`}
      style={{
        position: "relative",
        height: fill ? "100%" : `${height}px`,
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
          style={{
            position: "absolute",
            fontFamily: "inherit",
            fontSize: "0.9375rem",
            fontWeight: 700,
            color: "#ffffff",
            textShadow: "0 1px 8px rgba(0,0,0,0.45)",
            letterSpacing: "-0.02em",
            zIndex: 1,
            ...wordmarkPos,
          }}
        >
          quickboard
        </span>
      )}
      {children}
    </div>
  );
}
