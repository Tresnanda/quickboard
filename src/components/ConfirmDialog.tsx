import { createContext, useCallback, useContext, useState, type ReactNode } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { AnimatePresence, motion } from "framer-motion";
import { cn } from "../lib/utils";

type Opts = { title: string; message?: string; confirmLabel?: string; cancelLabel?: string; tone?: "default" | "danger" };
type Req = Opts & { resolve: (ok: boolean) => void };

const ConfirmCtx = createContext<(opts: Opts) => Promise<boolean>>(async () => false);

/** `const confirm = useConfirm(); if (await confirm({...})) { … }` */
export const useConfirm = () => useContext(ConfirmCtx);

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [req, setReq] = useState<Req | null>(null);
  const confirm = useCallback((opts: Opts) => new Promise<boolean>((resolve) => setReq({ ...opts, resolve })), []);
  const close = (ok: boolean) => {
    setReq((r) => {
      r?.resolve(ok);
      return null;
    });
  };

  return (
    <ConfirmCtx.Provider value={confirm}>
      {children}
      <Dialog.Root open={!!req} onOpenChange={(o) => !o && close(false)}>
        <AnimatePresence>
          {req && (
            <Dialog.Portal forceMount>
              <Dialog.Overlay asChild forceMount>
                <motion.div className="fixed inset-0 z-[70] bg-black/40 backdrop-blur-[3px]" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.18 }} />
              </Dialog.Overlay>
              <div className="pointer-events-none fixed inset-0 z-[70] grid place-items-center p-6">
                <Dialog.Content asChild forceMount aria-describedby={undefined}>
                  <motion.div
                    className="pointer-events-auto w-[360px] max-w-[calc(100vw-3rem)] rounded-[20px] bg-white p-5 shadow-modal"
                    initial={{ opacity: 0, scale: 0.94, y: 10 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.97, y: 6 }}
                    transition={{ type: "spring", duration: 0.4, bounce: 0.14 }}
                  >
                    <Dialog.Title className="text-[15px] font-extrabold tracking-[-0.02em] text-[var(--ink)]">{req.title}</Dialog.Title>
                    {req.message && <p className="mt-1.5 text-[12.5px] leading-relaxed text-[var(--muted)]">{req.message}</p>}
                    <div className="mt-5 flex justify-end gap-2">
                      <button type="button" onClick={() => close(false)} className="qb-press h-[38px] rounded-[11px] border border-[var(--border)] bg-white px-4 text-[12.5px] font-semibold text-[var(--text)]">
                        {req.cancelLabel ?? "Cancel"}
                      </button>
                      <button
                        type="button"
                        onClick={() => close(true)}
                        className={cn("qb-press h-[38px] rounded-[11px] px-4 text-[12.5px] font-semibold text-white shadow-ink", req.tone === "danger" ? "bg-[#b4424f]" : "bg-[var(--ink)]")}
                      >
                        {req.confirmLabel ?? "Confirm"}
                      </button>
                    </div>
                  </motion.div>
                </Dialog.Content>
              </div>
            </Dialog.Portal>
          )}
        </AnimatePresence>
      </Dialog.Root>
    </ConfirmCtx.Provider>
  );
}
