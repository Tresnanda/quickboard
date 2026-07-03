import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";

type Tone = "default" | "gold" | "green" | "rose";
type ToastInput = { message: string; icon?: ReactNode; tone?: Tone };
type Toast = ToastInput & { id: number };

const ToastContext = createContext<(t: ToastInput) => void>(() => {});

/** `toast({ message, icon, tone })` — a friendly confirmation that slides up. */
export const useToast = () => useContext(ToastContext);

const TONE_RING: Record<Tone, string> = {
  default: "text-[#52525b]",
  gold: "text-[#c39a31]",
  green: "text-[#3f9c6d]",
  rose: "text-[#c25b73]",
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const idRef = useRef(0);

  const push = useCallback((t: ToastInput) => {
    const id = ++idRef.current;
    setToasts((ts) => [...ts.slice(-2), { ...t, id }]);
    window.setTimeout(() => setToasts((ts) => ts.filter((x) => x.id !== id)), 2200);
  }, []);

  return (
    <ToastContext.Provider value={push}>
      {children}
      {createPortal(
        <div role="status" aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-5 z-[150] flex flex-col items-center gap-2">
          <AnimatePresence>
            {toasts.map((t) => (
              <motion.div
                key={t.id}
                layout
                initial={{ opacity: 0, y: 22, scale: 0.9, filter: "blur(4px)" }}
                animate={{ opacity: 1, y: 0, scale: 1, filter: "blur(0px)" }}
                exit={{ opacity: 0, y: 10, scale: 0.92, filter: "blur(2px)" }}
                transition={{ type: "spring", stiffness: 420, damping: 30 }}
                className="flex items-center gap-2.5 rounded-full border border-black/[0.06] bg-white px-4 py-2 text-[12.5px] font-semibold text-[var(--ink)] shadow-modal"
              >
                {t.icon && <span className={TONE_RING[t.tone ?? "default"]}>{t.icon}</span>}
                {t.message}
              </motion.div>
            ))}
          </AnimatePresence>
        </div>,
        document.body,
      )}
    </ToastContext.Provider>
  );
}
