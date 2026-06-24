import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { setAppearance, useAppearance } from "../lib/appearance";
import { useItems } from "../lib/items-store";
import { setEnvironment } from "../lib/ipc";
import { TINTS, TINT_NAMES } from "../lib/tints";
import { ICONS, ICON_NAMES } from "../lib/icons";
import { cn } from "../lib/utils";
import type { Item } from "../lib/types";

/** Origin-aware "dress this item" popover: pick a tint + icon, live. */
export function CustomizePopover({ item, children }: { item: Item; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const app = useAppearance(item.id);
  const { environments, reload } = useItems();

  return (
    <div className="relative">
      <span onClick={() => setOpen((v) => !v)}>{children}</span>
      <AnimatePresence>
        {open && (
          <>
            <div className="fixed inset-0 z-[60]" onClick={() => setOpen(false)} />
            <motion.div
              className="absolute bottom-[46px] left-0 z-[61] w-[252px] rounded-[18px] border border-[var(--hair)] bg-white p-4 shadow-pop"
              style={{ transformOrigin: "bottom left" }}
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.96 }}
              transition={{ duration: 0.16, ease: [0.23, 1, 0.32, 1] }}
            >
              <div className="mb-2.5 text-[10.5px] font-bold uppercase tracking-[0.05em] text-[#b2b2ba]">Color</div>
              <div className="mb-4 flex flex-wrap gap-2">
                {TINT_NAMES.map((name) => {
                  const t = TINTS[name];
                  const on = app.tint === name;
                  return (
                    <button
                      key={name}
                      type="button"
                      onClick={() => setAppearance(item.id, { tint: name })}
                      aria-label={t.label}
                      className={cn("h-6 w-6 rounded-[8px] border border-black/[0.06]", on && "ring-2 ring-[var(--ink)] ring-offset-2 ring-offset-white")}
                      style={{ background: t.card }}
                    />
                  );
                })}
              </div>
              <div className="mb-2.5 text-[10.5px] font-bold uppercase tracking-[0.05em] text-[#b2b2ba]">Icon</div>
              <div className="grid grid-cols-6 gap-1.5">
                {ICON_NAMES.map((name) => {
                  const Icon = ICONS[name];
                  const on = app.icon === name;
                  return (
                    <button
                      key={name}
                      type="button"
                      onClick={() => setAppearance(item.id, { icon: name })}
                      className={cn("grid aspect-square place-items-center rounded-[9px] transition-colors", on ? "bg-[var(--ink)] text-white" : "bg-[#f5f5f8] text-[#6b6b76] hover:bg-[#eeeef2]")}
                    >
                      <Icon size={15} strokeWidth={1.8} />
                    </button>
                  );
                })}
              </div>

              {environments.length > 0 && (
                <>
                  <div className="mb-2.5 mt-4 text-[10.5px] font-bold uppercase tracking-[0.05em] text-[#b2b2ba]">Move to environment</div>
                  <div className="flex flex-wrap gap-1.5">
                    {environments.map((env) => {
                      const on = item.environment === env;
                      return (
                        <button
                          key={env}
                          type="button"
                          onClick={async () => {
                            try {
                              await setEnvironment(item.id, env);
                              await reload();
                            } catch {
                              /* best-effort */
                            }
                          }}
                          className={cn("rounded-[8px] px-2.5 py-1 text-[12px] font-medium transition-colors", on ? "bg-[var(--ink)] text-white" : "bg-[#f5f5f8] text-[#54545c] hover:bg-[#eeeef2]")}
                        >
                          {env}
                        </button>
                      );
                    })}
                  </div>
                </>
              )}
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
