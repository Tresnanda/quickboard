import { useMemo } from "react";
import { ShieldCheck } from "lucide-react";

/**
 * Small shared generative-visual primitives for the premium pass.
 *
 *   - <GenerativeAvatar>  — a deterministic gradient avatar hashed from a seed
 *     string (stable angle + palette), with the feel-better hairline outline.
 *   - <ConfidentialFrost> — a pure CSS-blurred value preview with an amber
 *     "Touch ID to reveal" affordance. The `revealed` prop unblurs in place
 *     (R3); the in-card reveal swaps the real value in (see useReveal).
 *
 * All code-generated, monochrome-friendly, no external assets.
 */

// FNV-1a 32-bit hash → deterministic small integers for angle / hue selection.
function hash(seed: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/**
 * Deterministic gradient avatar. The seed picks a stable rotation angle and a
 * trio of soft pastel stops — same seed always renders the same avatar.
 */
export function GenerativeAvatar({
  seed,
  size = 30,
  radius = 8,
  className,
}: {
  seed: string;
  size?: number;
  radius?: number;
  className?: string;
}) {
  const { angle, a, b, c } = useMemo(() => {
    const h = hash(seed);
    const base = h % 360;
    // Three hues spaced around the wheel for a balanced, soft tri-tone.
    const hueA = base;
    const hueB = (base + 50) % 360;
    const hueC = (base + 110) % 360;
    // Soft, light pastels (high lightness, low-mid saturation) keep it premium
    // and on-brand rather than loud.
    const stop = (hue: number) => `hsl(${hue} 52% 86%)`;
    return {
      angle: 100 + (h % 80), // 100..180deg, stable per seed
      a: stop(hueA),
      b: stop(hueB),
      c: stop(hueC),
    };
  }, [seed]);

  return (
    <span
      aria-hidden="true"
      className={`qb-img-outline ${className ?? ""}`}
      style={{
        width: `${size}px`,
        height: `${size}px`,
        borderRadius: `${radius}px`,
        background: `linear-gradient(${angle}deg, ${a}, ${b}, ${c})`,
        flexShrink: 0,
        display: "inline-block",
      }}
    />
  );
}

/**
 * Frosted confidential value preview. Renders the masked placeholder under a
 * pure CSS blur, with an amber Touch-ID affordance beneath.
 *
 * `revealed` unblurs in place (CSS transition on `filter`) — the in-card reveal
 * (R3) toggles it once the value unlocks behind Touch ID.
 */
export function ConfidentialFrost({
  revealed = false,
}: {
  revealed?: boolean;
}) {
  return (
    <div>
      <div
        style={{
          position: "relative",
          display: "inline-flex",
          maxWidth: "100%",
          overflow: "hidden",
          borderRadius: "6px",
        }}
      >
        {/* The masked text under the frost — never the real value. */}
        <span
          className="qb-frost"
          data-revealed={revealed ? "true" : "false"}
          style={{
            fontSize: "0.75rem",
            fontFamily: "ui-monospace, SFMono-Regular, monospace",
            color: "var(--ink)",
            letterSpacing: "0.04em",
            userSelect: "none",
            filter: revealed ? "blur(0px)" : "blur(5px)",
            transition: "filter var(--dur-slow) var(--ease-out)",
            whiteSpace: "nowrap",
          }}
        >
          ••••••••••••
        </span>
      </div>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "0.3rem",
          marginTop: "0.35rem",
          fontSize: "0.6875rem",
          fontWeight: 600,
          color: "#b45309",
          letterSpacing: "-0.005em",
        }}
      >
        <ShieldCheck size={12} />
        Touch ID to reveal
      </div>
    </div>
  );
}
