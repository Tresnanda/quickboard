import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useMotionTemplate, useMotionValue, useReducedMotion, useSpring } from "framer-motion";
import { getImageDataUrl, setPinned } from "../lib/ipc";
import { GRAB_TRANSITION, RECOIL_TRANSITION, useDragOut } from "../lib/use-drag-out";
import { CopyCheck } from "./CopyCheck";
import { FavoriteButton } from "./FavoriteButton";
import { useItems } from "../lib/items-store";
import { useAppearance } from "../lib/appearance";
import { itemTint } from "../lib/tints";
import { coverGradient } from "../lib/cover";
import { ICONS, defaultIcon } from "../lib/icons";
import { CONTENT_TYPE_LABEL, contentType, fileExt } from "../lib/content-type";
import { usePreview } from "../lib/use-preview";
import { useCopy } from "../lib/use-copy";
import { cn } from "../lib/utils";
import type { Item } from "../lib/types";

export function relativeTime(unixSecs: number): string {
  if (!unixSecs) return "";
  const diff = Math.max(0, Date.now() / 1000 - unixSecs);
  const mins = Math.floor(diff / 60);
  if (mins < 1) return "now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days}d ago`;
  return new Date(unixSecs * 1000).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

const TILT_SPRING = { stiffness: 250, damping: 18, mass: 0.5 } as const;

export function ItemCard({ item }: { item: Item }) {
  useAppearance(item.id);
  const reduce = useReducedMotion();
  const { setSelectedItemId, reload } = useItems();
  const { preview, confidential } = usePreview(item);
  const { copied, copy } = useCopy(item.id);

  const tint = itemTint(item);
  const type = contentType(item, preview);
  const iconName = useAppearance(item.id).icon ?? defaultIcon(type, item.confidential);
  const Icon = ICONS[iconName];
  const isFile = item.kind === "File";
  const isImage = type === "image";
  const { grabbing, begin } = useDragOut(item.id, isImage);

  // 3D tilt + cursor spotlight (motion values stay off the React render path)
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

  const [cover, setCover] = useState<string | null>(null);
  const wantsCover = isImage && !item.confidential;
  useEffect(() => {
    if (!wantsCover) {
      setCover(null);
      return;
    }
    let alive = true;
    void getImageDataUrl(item.id).then((u) => alive && setCover(u)).catch(() => {});
    return () => {
      alive = false;
    };
  }, [item.id, wantsCover]);

  function open() {
    setSelectedItemId(item.id);
  }
  function onCopy(e: React.MouseEvent) {
    e.stopPropagation();
    void copy();
  }
  async function onFav() {
    try {
      await setPinned(item.id, !item.pinned);
      await reload();
    } catch {
      /* best-effort */
    }
  }
  // Native HTML5 drag-out for file items (motion.div hijacks the onDragStart prop,
  // so we bind the real event on the DOM node).
  const cardRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = cardRef.current;
    if (!el || !isFile) return;
    const handler = (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const r = el.getBoundingClientRect();
      begin([r.x, r.y, r.width, r.height]);
    };
    el.addEventListener("dragstart", handler);
    return () => el.removeEventListener("dragstart", handler);
  }, [isFile, isImage, item.id]);

  let content: React.ReactNode;
  if (confidential) {
    content = <div className="font-mono text-[11.5px] tracking-[2px] text-[#a3a3aa] [filter:blur(0.5px)]">•••••••••••</div>;
  } else if (isFile) {
    content = <div className="text-[11.5px] text-[var(--muted)]">{fileExt(item.label) ? `${fileExt(item.label).toUpperCase()} · ` : ""}File</div>;
  } else if (type === "code") {
    content = <pre className="overflow-hidden whitespace-pre-wrap font-mono text-[11px] leading-relaxed text-[#52525b] line-clamp-3">{preview ?? "—"}</pre>;
  } else {
    content = (
      <div className="text-[11.5px] leading-relaxed text-[var(--muted)] line-clamp-2">
        {copied ? <span className="font-semibold text-[#3f7a57]">Copied to clipboard</span> : preview ?? "—"}
      </div>
    );
  }

  return (
    <motion.div
      className={cn(
        `tint-${tint}`,
        "qb-card-hover group relative flex min-h-[156px] cursor-pointer select-none flex-col overflow-hidden rounded-[16px] border border-black/[0.05] p-2 shadow-card",
      )}
      style={{ background: isImage ? "var(--t-tile)" : coverGradient(item.id, tint), rotateX: tiltX, rotateY: tiltY, transformPerspective: 700, zIndex: grabbing ? 50 : undefined, cursor: isFile ? (grabbing ? "grabbing" : "grab") : undefined }}
      animate={{ scale: grabbing ? [1, 0.84, 1] : 1, opacity: grabbing ? 0.45 : 1 }}
      whileHover={reduce || grabbing ? undefined : { y: -4 }}
      whileTap={reduce || grabbing ? undefined : { scale: 0.985 }}
      transition={{ scale: RECOIL_TRANSITION, opacity: GRAB_TRANSITION }}
      ref={cardRef}
      role="button"
      tabIndex={0}
      onMouseMove={onMove}
      onMouseLeave={onLeave}
      onClick={open}
      onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), open())}
      draggable={isFile}
    >
      {isImage ? (
        cover && <img src={cover} alt="" className="absolute inset-0 h-full w-full object-cover" />
      ) : (
        <div className="qb-grain" />
      )}

      {/* cursor spotlight (ambient layer) */}
      {!reduce && (
        <motion.div className="pointer-events-none absolute inset-0 z-[1] opacity-0 transition-opacity duration-200 group-hover:opacity-100" style={{ background: spotlight }} />
      )}

      {/* copy confirmation pulse */}
      <AnimatePresence>
        {copied && (
          <motion.div
            className="pointer-events-none absolute inset-1 z-[2] rounded-[13px] ring-2 ring-[#5fae84]/70"
            initial={{ opacity: 0, scale: 0.97 }}
            animate={{ opacity: [0, 1, 0], scale: 1.01 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.6, ease: "easeOut" }}
          />
        )}
      </AnimatePresence>

      <div className="absolute right-2.5 top-2.5 z-20 flex items-center gap-1">
        {!isFile && !isImage && (
          <button
            type="button"
            onClick={onCopy}
            aria-label="Copy"
            className="qb-no-drag qb-press grid h-7 w-7 place-items-center rounded-full bg-white/70 text-[#52525b] opacity-0 backdrop-blur-sm transition-opacity duration-150 hover:bg-white/90 group-hover:opacity-100"
          >
            <CopyCheck copied={copied} />
          </button>
        )}
        <FavoriteButton
          pinned={item.pinned}
          onToggle={onFav}
          size={14}
          idleColor="#6b6b73"
          className="qb-no-drag qb-press grid h-7 w-7 place-items-center rounded-full bg-white/70 backdrop-blur-sm transition-colors hover:bg-white/90"
        />
      </div>

      {/* gradient breathing space — the icon tab steps up out of it */}
      <div className="flex-1" />

      {/* one merged "label" shape: icon tab + concave joint + panel, one fill + one shadow */}
      <div className="relative z-10" style={{ filter: "drop-shadow(0 3px 8px rgba(0,0,0,0.11))" }}>
        <div
          className="absolute -top-[22px] left-0 flex h-[36px] w-[60px] items-start rounded-t-[13px] bg-white pl-3 pt-[4px]"
          style={{ color: "var(--t-tile-ink)" }}
        >
          <Icon size={18} strokeWidth={1.85} />
        </div>
        <div
          className="absolute"
          style={{ left: 60, top: -12, width: 12, height: 12, background: "radial-gradient(circle 12px at top right, transparent 11px, #fff 11.5px)" }}
        />
        <div className="rounded-[13px] bg-white px-3 pb-2.5 pt-2.5">
          <div className="truncate text-[13px] font-bold tracking-[-0.012em] text-[var(--ink)]">{item.label}</div>
          <div className="mt-1">{content}</div>
          <div className="mt-2 flex items-center justify-between border-t border-black/[0.05] pt-1.5">
            <span className="text-[10.5px] font-medium text-[var(--muted)]">
              {confidential && type === "note" ? "Confidential" : CONTENT_TYPE_LABEL[type]}
            </span>
            <span className="text-[10.5px] text-[var(--fainter)] tabular">{relativeTime(item.last_used_at || item.created_at)}</span>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
