import { AnimatePresence, motion } from "framer-motion";
import { Check, Copy } from "lucide-react";

/**
 * Copy -> Check morph: Emil's blur-masked crossfade. The whole label
 * (icon + word) swaps between "copy"/Copy and "Copied"/Check with a short
 * blur + opacity crossfade. Reduced motion -> instant opacity swap only.
 *
 * Shared by the Library rows and the Quick-access cards.
 */
export function CopyMorph({
  copied,
  reduce,
  label = "copy",
  copiedLabel = "Copied",
  size = 13,
}: {
  copied: boolean;
  reduce: boolean;
  label?: string;
  copiedLabel?: string;
  size?: number;
}) {
  const key = copied ? "copied" : "copy";

  // Animated icon swap (copy -> check): cross-fade with opacity + scale(0.25->1)
  // + blur(4->0), spring {duration: 0.3, bounce: 0}. Reduced motion -> opacity.
  const enter = reduce
    ? { opacity: 0 }
    : { opacity: 0, scale: 0.25, filter: "blur(4px)" };
  const center = reduce
    ? { opacity: 1 }
    : { opacity: 1, scale: 1, filter: "blur(0px)" };
  const exit = reduce
    ? { opacity: 0 }
    : { opacity: 0, scale: 0.25, filter: "blur(4px)" };

  return (
    <span
      style={{
        position: "relative",
        display: "inline-flex",
        alignItems: "center",
      }}
    >
      {/* Invisible sizer keeps the button width stable across the swap. */}
      <span
        aria-hidden
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: "0.375rem",
          visibility: "hidden",
        }}
      >
        <Check size={size} />
        {copiedLabel}
      </span>
      <AnimatePresence initial={false} mode="popLayout">
        <motion.span
          key={key}
          initial={enter}
          animate={center}
          exit={exit}
          transition={
            reduce
              ? { duration: 0.16 }
              : { type: "spring", duration: 0.3, bounce: 0 }
          }
          style={{
            position: "absolute",
            inset: 0,
            display: "inline-flex",
            alignItems: "center",
            gap: "0.375rem",
          }}
        >
          {copied ? <Check size={size} /> : <Copy size={size} />}
          {copied ? copiedLabel : label}
        </motion.span>
      </AnimatePresence>
    </span>
  );
}
