import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";

type Burst = { id: number; x: number; y: number };
const ConfettiContext = createContext<(x: number, y: number) => void>(() => {});

/** Fire a celebratory burst at a viewport point: `fire(clientX, clientY)`. */
export const useConfetti = () => useContext(ConfettiContext);

const COLORS = ["#e0a93f", "#cf8a63", "#d98aa8", "#b08ad9", "#6aa0d9", "#5fae84", "#e6c75a"];
const COUNT = 28;

export function ConfettiProvider({ children }: { children: ReactNode }) {
  const [bursts, setBursts] = useState<Burst[]>([]);
  const idRef = useRef(0);

  const fire = useCallback((x: number, y: number) => {
    const id = ++idRef.current;
    setBursts((b) => [...b, { id, x, y }]);
    window.setTimeout(() => setBursts((b) => b.filter((p) => p.id !== id)), 1300);
  }, []);

  return (
    <ConfettiContext.Provider value={fire}>
      {children}
      {createPortal(
        <div className="pointer-events-none fixed inset-0 z-[400] overflow-hidden">
          <AnimatePresence>
            {bursts.map((b) => (
              <Burst key={b.id} x={b.x} y={b.y} />
            ))}
          </AnimatePresence>
        </div>,
        document.body,
      )}
    </ConfettiContext.Provider>
  );
}

function Burst({ x, y }: { x: number; y: number }) {
  const parts = useMemo(
    () =>
      Array.from({ length: COUNT }, (_, i) => {
        const angle = (i / COUNT) * Math.PI * 2 + (i % 4) * 0.22;
        const speed = 64 + (i % 6) * 24;
        return {
          i,
          dx: Math.cos(angle) * speed,
          up: Math.sin(angle) * speed - 26,
          color: COLORS[i % COLORS.length],
          size: 5 + (i % 3) * 2,
          spin: (i % 2 ? 1 : -1) * (200 + (i % 4) * 80),
          square: i % 2 === 0,
        };
      }),
    [],
  );

  return (
    <>
      {parts.map((p) => (
        <motion.span
          key={p.i}
          className="absolute"
          style={{ left: x, top: y, width: p.size, height: p.size, background: p.color, borderRadius: p.square ? 1 : "50%" }}
          initial={{ x: 0, y: 0, opacity: 1, rotate: 0 }}
          animate={{ x: p.dx, y: [0, p.up, p.up + 190], opacity: [1, 1, 0], rotate: p.spin }}
          transition={{ duration: 1.15, ease: [0.2, 0.7, 0.4, 1], times: [0, 0.35, 1] }}
        />
      ))}
    </>
  );
}
