import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { invoke } from "@tauri-apps/api/core";
import { X, Zap } from "lucide-react";

/**
 * Auto-paste (⌥Space → ⌘V) needs macOS Accessibility permission. On a fresh
 * install it's off, so this surfaces a gentle prompt and polls until granted —
 * then it disappears on its own (the user toggles it on in System Settings).
 */
function useAccessibilityGranted(): boolean {
  const [granted, setGranted] = useState(true); // optimistic — no banner flash before the first check

  useEffect(() => {
    let alive = true;
    let timer: number | undefined;
    const check = async () => {
      try {
        const ok = await invoke<boolean>("accessibility_trusted");
        if (alive) setGranted(ok);
        return ok;
      } catch {
        return true;
      }
    };
    void check().then((ok) => {
      if (!ok && alive) {
        timer = window.setInterval(async () => {
          if (await check()) window.clearInterval(timer);
        }, 2500);
      }
    });
    return () => {
      alive = false;
      if (timer) window.clearInterval(timer);
    };
  }, []);

  return granted;
}

export function AccessibilityBanner() {
  const granted = useAccessibilityGranted();
  const [dismissed, setDismissed] = useState(false);
  const show = !granted && !dismissed;

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          initial={{ opacity: 0, y: -16, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -12, scale: 0.97 }}
          transition={{ type: "spring", stiffness: 460, damping: 30 }}
          className="absolute left-1/2 top-3 z-50 flex max-w-[94%] -translate-x-1/2 items-center gap-2.5 rounded-full border border-[#e7c684] bg-[#fdf4e1] py-1.5 pl-3.5 pr-1.5 shadow-[0_1px_2px_rgba(0,0,0,0.05),0_14px_34px_-12px_rgba(0,0,0,0.3)]"
        >
          <Zap size={14} strokeWidth={2.2} className="shrink-0 text-[#b07d18]" />
          <span className="text-[12.5px] font-medium text-[#7a5a14]">Turn on Accessibility so ⌥Space can paste at your cursor</span>
          <motion.button
            whileTap={{ scale: 0.96 }}
            type="button"
            onClick={() => void invoke("open_accessibility_settings")}
            className="shrink-0 rounded-full bg-[var(--ink)] px-3 py-1.5 text-[12px] font-semibold text-white"
          >
            Open Settings
          </motion.button>
          <motion.button whileTap={{ scale: 0.9 }} type="button" onClick={() => setDismissed(true)} aria-label="Dismiss" className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-[#a8842e] transition-colors hover:bg-black/[0.05]">
            <X size={14} />
          </motion.button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
