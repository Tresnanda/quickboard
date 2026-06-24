import { useEffect, useState } from "react";
import { motion, useMotionTemplate, useMotionValue, useReducedMotion, useSpring } from "framer-motion";
import { MoreHorizontal } from "lucide-react";
import { coverColors, coverGradient } from "../lib/cover";
import { categoryTint } from "../lib/tints";
import { useAppearance } from "../lib/appearance";
import { useShaderBake } from "./ShaderBaker";
import { cn } from "../lib/utils";

const TILT_SPRING = { stiffness: 250, damping: 18, mass: 0.5 } as const;

/** A category as a folder: 3D-tilt card with grain, the name riding the tab. */
export function CategoryCard({
  category,
  count,
  active,
  onClick,
  onEdit,
}: {
  category: string;
  count: number;
  active: boolean;
  onClick: (e?: React.MouseEvent) => void;
  onEdit?: () => void;
}) {
  const reduce = useReducedMotion();
  const app = useAppearance(`cat:${category}`);
  const tint = app.tint ?? categoryTint(category);
  const cover = app.cover;

  // bake the real ShaderGradient to a cached static image; until it lands (or if it
  // fails) the CSS cover shows underneath
  const bake = useShaderBake();
  const [sgImage, setSgImage] = useState<string | null>(null);
  useEffect(() => {
    if (cover) {
      setSgImage(null);
      return;
    }
    let alive = true;
    void bake(`${category}|${tint}`, coverColors(category, tint)).then((url) => alive && setSgImage(url));
    return () => {
      alive = false;
    };
  }, [category, tint, cover, bake]);

  const tiltX = useSpring(useMotionValue(0), TILT_SPRING);
  const tiltY = useSpring(useMotionValue(0), TILT_SPRING);
  const spotX = useMotionValue(50);
  const spotY = useMotionValue(50);
  const spotlight = useMotionTemplate`radial-gradient(170px circle at ${spotX}% ${spotY}%, rgba(255,255,255,0.35), transparent 62%)`;

  function onMove(e: React.MouseEvent) {
    if (reduce) return;
    const r = e.currentTarget.getBoundingClientRect();
    const px = (e.clientX - r.left) / r.width;
    const py = (e.clientY - r.top) / r.height;
    tiltY.set((px - 0.5) * 9);
    tiltX.set((0.5 - py) * 9);
    spotX.set(px * 100);
    spotY.set(py * 100);
  }
  function onLeave() {
    tiltX.set(0);
    tiltY.set(0);
  }

  return (
    <motion.div
      role="button"
      tabIndex={0}
      data-folder-card
      onClick={onClick}
      onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), onClick())}
      onMouseMove={onMove}
      onMouseLeave={onLeave}
      whileHover={reduce ? undefined : { y: -4 }}
      whileTap={reduce ? undefined : { scale: 0.985 }}
      transition={{ type: "spring", stiffness: 350, damping: 25 }}
      style={{ background: cover ? "var(--t-tile)" : sgImage ? `url("${sgImage}") center / cover no-repeat` : coverGradient(category, tint), rotateX: tiltX, rotateY: tiltY, transformPerspective: 700 }}
      className={cn(
        `tint-${tint}`,
        "qb-card-hover group relative flex min-h-[132px] cursor-pointer select-none flex-col overflow-hidden rounded-[16px] border border-black/[0.05] p-2 shadow-card",
        active && "ring-2 ring-[var(--ink)]/35 ring-offset-2 ring-offset-[var(--board)]",
      )}
    >
      {cover ? <img src={cover} alt="" className="absolute inset-0 h-full w-full object-cover" /> : <div className="qb-grain" />}
      {!reduce && (
        <motion.div className="pointer-events-none absolute inset-0 z-[1] opacity-0 transition-opacity duration-200 group-hover:opacity-100" style={{ background: spotlight }} />
      )}

      {onEdit && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onEdit();
          }}
          aria-label="Edit folder"
          className="qb-press absolute right-2.5 top-2.5 z-20 grid h-7 w-7 place-items-center rounded-full bg-white/80 text-[#52525b] opacity-0 backdrop-blur-sm transition-opacity duration-150 hover:bg-white group-hover:opacity-100"
        >
          <MoreHorizontal size={15} />
        </button>
      )}

      {/* slim gradient lid the tab steps up out of */}
      <div className="flex-1" />

      {/* one merged "folder" shape: the name rides the tab, count in the body */}
      <div className="relative z-10" style={{ filter: "drop-shadow(0 3px 8px rgba(0,0,0,0.11))" }}>
        <div className="absolute -top-[23px] left-0 flex h-[39px] w-[62%] items-center rounded-t-[13px] bg-white px-3.5">
          <span className="truncate text-[13.5px] font-bold tracking-[-0.012em] text-[var(--ink)]">{category}</span>
        </div>
        <div
          className="absolute"
          style={{ left: "62%", top: -14, width: 14, height: 14, background: "radial-gradient(circle 14px at top right, transparent 13px, #fff 13.5px)" }}
        />
        <div className="rounded-[13px] bg-white px-3.5 pb-2.5 pt-[18px]">
          <div className="text-[12.5px] font-semibold text-[var(--ink)] tabular">
            {count} <span className="font-medium text-[var(--muted)]">{count === 1 ? "item" : "items"}</span>
          </div>
          <div className="mt-2 flex items-center justify-between border-t border-black/[0.05] pt-1.5 text-[10.5px]">
            <span className="font-medium text-[var(--muted)]">Folder</span>
            {active && <span className="font-semibold text-[var(--ink)]">Open</span>}
          </div>
        </div>
      </div>
    </motion.div>
  );
}
