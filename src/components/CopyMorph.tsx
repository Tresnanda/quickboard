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

  const enter = reduce ? { opacity: 0 } : { opacity: 0, filter: "blur(2px)" };
  const center = reduce
    ? { opacity: 1 }
    : { opacity: 1, filter: "blur(0px)" };
  const exit = reduce ? { opacity: 0 } : { opacity: 0, filter: "blur(2px)" };

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
          transition={{ duration: 0.16, ease: [0.23, 1, 0.32, 1] }}
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
