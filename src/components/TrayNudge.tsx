import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { invoke } from "@tauri-apps/api/core";
import { Check, Layers, X } from "lucide-react";
import { useItems } from "../lib/items-store";
import { committable, useTray } from "../lib/tray";

/**
 * A gentle bridge from temporary → permanent: when the board opens (or a drop lands)
 * with un-committed tray items, a floating pill offers to keep them. Dismissable;
 * re-surfaces when new temp items arrive.
 */
export function TrayNudge() {
  const { setCommitOpen, setCommitIds, setCommitCategory } = useItems();
  const tray = useTray();
  const pending = committable(tray);
  const count = pending.length;
  const [dismissed, setDismissed] = useState(false);
  const prev = useRef(0);

  useEffect(() => {
    if (count > prev.current) setDismissed(false); // new temp items → show again
    prev.current = count;
  }, [count]);

  const show = count > 0 && !dismissed;

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          initial={{ opacity: 0, y: -16, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -12, scale: 0.97 }}
          transition={{ type: "spring", stiffness: 460, damping: 30 }}
          className="absolute right-3 top-3 z-40 flex w-fit max-w-[calc(100%-1.5rem)] items-center gap-1.5 rounded-[16px] border border-black/[0.06] bg-white/90 py-1.5 pl-4 pr-1.5 shadow-[0_1px_2px_rgba(0,0,0,0.06),0_14px_34px_-12px_rgba(0,0,0,0.32)] backdrop-blur-md"
        >
          <span className="flex min-w-0 items-center gap-2 pr-1 text-[12.5px] font-semibold text-[var(--ink)]">
            <Layers size={14} className="shrink-0 text-[var(--muted)]" />
            <motion.span key={count} initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: "spring", stiffness: 600, damping: 22 }} className="shrink-0 tabular-nums">
              {count}
            </motion.span>
            <span className="min-w-0 truncate">{count === 1 ? "thing" : "things"} waiting in your tray</span>
          </span>
          <button onClick={() => void invoke("show_tray")} className="hidden shrink-0 rounded-[9px] px-2.5 py-1.5 text-[12px] font-medium text-[var(--muted)] transition-colors hover:bg-black/[0.05] min-[560px]:block">
            Review
          </button>
          <motion.button
            whileTap={{ scale: 0.96 }}
            onClick={() => {
              setCommitIds([]);
              setCommitCategory("");
              setCommitOpen(true);
            }}
            className="flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-[10px] bg-[var(--ink)] px-3 py-1.5 text-[12px] font-semibold text-white"
          >
            <Check size={13} strokeWidth={2.6} /> Add to board
          </motion.button>
          <motion.button whileTap={{ scale: 0.9 }} onClick={() => setDismissed(true)} aria-label="Dismiss" className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-[var(--faint)] transition-colors hover:bg-black/[0.06] hover:text-[var(--ink)]">
            <X size={14} />
          </motion.button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
