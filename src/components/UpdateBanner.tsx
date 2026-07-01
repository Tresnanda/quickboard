import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowUpCircle, X } from "lucide-react";
import { installUpdate, useUpdater } from "../lib/updater";

/**
 * Surfaces a ready-to-install update (found by the silent launch check) as a gentle
 * top banner. "Install & restart" downloads, applies, and relaunches into the new
 * build; a progress fill tracks the download. Dismissible until you act — the next
 * launch re-checks.
 */
export function UpdateBanner() {
  const { status, version, progress } = useUpdater();
  const [dismissed, setDismissed] = useState(false);
  const active = status === "available" || status === "downloading" || status === "ready" || status === "restart_required";
  const show = active && !dismissed;
  const busy = status === "downloading" || status === "ready";

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          initial={{ opacity: 0, y: -16, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -12, scale: 0.97 }}
          transition={{ type: "spring", stiffness: 460, damping: 30 }}
          className="absolute left-1/2 top-3 z-50 flex max-w-[94%] -translate-x-1/2 items-center gap-2.5 overflow-hidden rounded-full border border-[#bcd8c6] bg-[#eef7f1] py-1.5 pl-3.5 pr-1.5 shadow-[0_1px_2px_rgba(0,0,0,0.05),0_14px_34px_-12px_rgba(0,0,0,0.3)]"
        >
          {/* download progress as a soft fill behind the content */}
          <motion.div
            className="pointer-events-none absolute inset-y-0 left-0 bg-[#5fae84]/18"
            initial={{ width: 0 }}
            animate={{ width: busy ? `${Math.round(progress * 100)}%` : 0 }}
            transition={{ ease: "easeOut", duration: 0.3 }}
          />
          <ArrowUpCircle size={14} strokeWidth={2.2} className="relative shrink-0 text-[#3f7a57]" />
          <span className="relative text-[12.5px] font-medium text-[#2f5c43]">
            {status === "restart_required"
              ? "Update installed — quit & reopen to finish"
              : status === "ready"
                ? "Restarting into the new version…"
                : status === "downloading"
                  ? `Updating to ${version}… ${Math.round(progress * 100)}%`
                  : `Version ${version} is ready`}
          </span>
          {status === "available" && (
            <motion.button
              whileTap={{ scale: 0.96 }}
              type="button"
              onClick={() => void installUpdate()}
              className="relative shrink-0 rounded-full bg-[var(--ink)] px-3 py-1.5 text-[12px] font-semibold text-white"
            >
              Install &amp; restart
            </motion.button>
          )}
          {!busy && (
            <motion.button
              whileTap={{ scale: 0.9 }}
              type="button"
              onClick={() => setDismissed(true)}
              aria-label="Dismiss"
              className="relative grid h-7 w-7 shrink-0 place-items-center rounded-full text-[#4a7a5e] transition-colors hover:bg-black/[0.05]"
            >
              <X size={14} />
            </motion.button>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
