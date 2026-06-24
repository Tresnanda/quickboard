import { AnimatePresence, motion } from "framer-motion";
import { Check, Copy } from "lucide-react";

const ANIM = {
  initial: { scale: 0.25, opacity: 0, filter: "blur(4px)" },
  animate: { scale: 1, opacity: 1, filter: "blur(0px)" },
  exit: { scale: 0.25, opacity: 0, filter: "blur(4px)" },
  transition: { type: "spring", duration: 0.3, bounce: 0 },
} as const;

/** Copy → Check with a contextual icon cross-fade (scale + opacity + blur). */
export function CopyCheck({ copied, size = 14 }: { copied: boolean; size?: number }) {
  return (
    <span className="relative grid place-items-center" style={{ width: size, height: size }}>
      <AnimatePresence initial={false}>
        {copied ? (
          <motion.span key="check" className="absolute" {...ANIM}>
            <Check size={size} className="text-[#3f7a57]" />
          </motion.span>
        ) : (
          <motion.span key="copy" className="absolute" {...ANIM}>
            <Copy size={size} />
          </motion.span>
        )}
      </AnimatePresence>
    </span>
  );
}
