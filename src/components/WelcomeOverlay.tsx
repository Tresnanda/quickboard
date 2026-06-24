import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useConfetti } from "./Confetti";

const FLAG = "qb_welcomed_v1";
const EASE = [0.23, 1, 0.32, 1] as const;

/**
 * A one-time cinematic welcome: the logo springs in, the wordmark + tagline
 * blur-resolve, confetti rains, then the whole curtain scales away to reveal
 * the board. Replays on a `qb:replay-welcome` window event (Settings button).
 */
export function WelcomeOverlay() {
  const [show, setShow] = useState(false);
  const reduce = useReducedMotion();
  const fire = useConfetti();
  const fired = useRef(false);

  useEffect(() => {
    if (!localStorage.getItem(FLAG)) setShow(true);
    const replay = () => setShow(true);
    window.addEventListener("qb:replay-welcome", replay);
    return () => window.removeEventListener("qb:replay-welcome", replay);
  }, []);

  useEffect(() => {
    if (!show || reduce || fired.current) return;
    fired.current = true;
    const ts = [
      setTimeout(() => fire(window.innerWidth / 2, window.innerHeight * 0.4), 650),
      setTimeout(() => fire(window.innerWidth * 0.28, window.innerHeight * 0.52), 880),
      setTimeout(() => fire(window.innerWidth * 0.72, window.innerHeight * 0.52), 1040),
    ];
    return () => ts.forEach(clearTimeout);
  }, [show, reduce, fire]);

  function dismiss() {
    localStorage.setItem(FLAG, "1");
    setShow(false);
    fired.current = false;
  }

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          className="fixed inset-0 z-[300] grid place-items-center overflow-hidden bg-[#eceaf2]"
          initial={{ opacity: 1 }}
          exit={reduce ? { opacity: 0 } : { opacity: 0, scale: 1.07, filter: "blur(10px)" }}
          transition={{ duration: 0.6, ease: EASE }}
        >
          {/* drifting pastel mesh */}
          <div className="qb-drift absolute -left-[12%] top-[6%] h-[58vh] w-[58vh] rounded-full opacity-70 blur-[64px]" style={{ background: "radial-gradient(circle, #d9b8e6, transparent 70%)" }} />
          <div className="qb-drift absolute right-[2%] top-[16%] h-[52vh] w-[52vh] rounded-full opacity-70 blur-[64px]" style={{ background: "radial-gradient(circle, #b8cce6, transparent 70%)", animationDelay: "-4s" }} />
          <div className="qb-drift absolute bottom-[2%] left-[28%] h-[48vh] w-[48vh] rounded-full opacity-60 blur-[64px]" style={{ background: "radial-gradient(circle, #e6d3b8, transparent 70%)", animationDelay: "-8s" }} />
          <div className="qb-grain" />

          <div className="relative flex flex-col items-center text-center">
            <motion.div
              className="grid h-[88px] w-[88px] place-items-center rounded-[26px] bg-gradient-to-b from-[#2a2a2e] to-[#0b0b0c] text-[44px] font-extrabold text-white shadow-ink"
              initial={reduce ? { opacity: 0 } : { scale: 0.4, opacity: 0, rotate: -12, filter: "blur(8px)" }}
              animate={{ scale: 1, opacity: 1, rotate: 0, filter: "blur(0px)" }}
              transition={reduce ? { duration: 0.3 } : { type: "spring", stiffness: 200, damping: 13, delay: 0.12 }}
            >
              q
            </motion.div>

            <motion.h1
              className="mt-6 text-[34px] font-extrabold tracking-[-0.03em] text-[var(--ink)]"
              initial={{ opacity: 0, y: 14, filter: "blur(6px)" }}
              animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
              transition={{ duration: 0.5, ease: EASE, delay: 0.5 }}
            >
              quickboard
            </motion.h1>

            <motion.p
              className="mt-2 max-w-[330px] text-[14px] leading-relaxed text-[var(--faint)]"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, ease: EASE, delay: 0.72 }}
            >
              Everything you reach for — facts, files, snippets — a keystroke away.
            </motion.p>

            <motion.button
              type="button"
              onClick={dismiss}
              className="qb-press qb-shine mt-7 inline-flex h-[42px] items-center gap-2 rounded-[13px] bg-[var(--ink)] px-6 text-[14px] font-semibold text-white shadow-ink"
              initial={{ opacity: 0, y: 10, scale: 0.9 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ type: "spring", stiffness: 320, damping: 22, delay: 0.98 }}
            >
              Let’s go
            </motion.button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
