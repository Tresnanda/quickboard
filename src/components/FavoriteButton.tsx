import { useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Star } from "lucide-react";
import { useToast } from "./Toast";
import { useConfetti } from "./Confetti";

const GOLD = "#caa53f";
const SPARKS = 7;
const SPRING = { duration: 0.45, ease: [0.34, 1.56, 0.64, 1] } as const;

/** A favorite star that pops and throws a little spark-burst the moment you pin. */
export function FavoriteButton({
  pinned,
  onToggle,
  size = 14,
  className,
  idleColor = "#6b6b73",
}: {
  pinned: boolean;
  onToggle: () => void;
  size?: number;
  className?: string;
  idleColor?: string;
}) {
  const reduce = useReducedMotion();
  const toast = useToast();
  const fire = useConfetti();
  const [bursts, setBursts] = useState(0);

  return (
    <button
      type="button"
      aria-label={pinned ? "Unfavorite" : "Favorite"}
      onClick={(e) => {
        e.stopPropagation();
        if (!pinned) {
          if (!reduce) {
            setBursts((b) => b + 1);
            const r = e.currentTarget.getBoundingClientRect();
            fire(r.left + r.width / 2, r.top + r.height / 2);
          }
          toast({ message: "Pinned to favorites", icon: <Star size={13} fill="#caa53f" strokeWidth={0} />, tone: "gold" });
        } else {
          toast({ message: "Removed from favorites", icon: <Star size={13} strokeWidth={2} />, tone: "default" });
        }
        onToggle();
      }}
      className={className}
      style={{ color: pinned ? GOLD : idleColor }}
    >
      <span className="relative grid place-items-center">
        <motion.span
          className="grid place-items-center"
          animate={pinned && !reduce ? { scale: [1, 1.4, 1], rotate: [0, -14, 0] } : { scale: 1, rotate: 0 }}
          transition={SPRING}
        >
          <Star size={size} fill={pinned ? GOLD : "none"} strokeWidth={pinned ? 0 : 2} />
        </motion.span>

        <AnimatePresence>
          {bursts > 0 && (
            <span key={bursts} className="pointer-events-none absolute left-1/2 top-1/2">
              {Array.from({ length: SPARKS }).map((_, i) => {
                const a = (i / SPARKS) * Math.PI * 2;
                const dist = 12 + (i % 3) * 3;
                return (
                  <motion.span
                    key={i}
                    className="absolute rounded-full"
                    style={{ width: 3, height: 3, marginLeft: -1.5, marginTop: -1.5, background: GOLD }}
                    initial={{ x: 0, y: 0, scale: 0, opacity: 1 }}
                    animate={{ x: Math.cos(a) * dist, y: Math.sin(a) * dist, scale: [0.3, 1, 0], opacity: [1, 1, 0] }}
                    transition={{ duration: 0.5, ease: "easeOut" }}
                  />
                );
              })}
            </span>
          )}
        </AnimatePresence>
      </span>
    </button>
  );
}
