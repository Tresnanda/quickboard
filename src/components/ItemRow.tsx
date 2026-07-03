import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { setPinned } from "../lib/ipc";
import { getCachedImageDataUrl } from "../lib/image-cache";
import { GRAB_TRANSITION, RECOIL_TRANSITION, useDragOut } from "../lib/use-drag-out";
import { CopyCheck } from "./CopyCheck";
import { FavoriteButton } from "./FavoriteButton";
import { useItems } from "../lib/items-store";
import { useAppearance } from "../lib/appearance";
import { TINTS, itemTint } from "../lib/tints";
import { ICONS, defaultIcon } from "../lib/icons";
import { CONTENT_TYPE_LABEL, contentType, fileExt } from "../lib/content-type";
import { usePreview } from "../lib/use-preview";
import { useCopy } from "../lib/use-copy";
import { useMintedId } from "./MintFlight";
import { relativeTime } from "./ItemCard";
import { cn } from "../lib/utils";
import type { Item } from "../lib/types";

export function ItemRow({ item }: { item: Item }) {
  useAppearance(item.id);
  const { setSelectedItemId, reload } = useItems();
  const { preview, confidential } = usePreview(item);
  const { copied, copy } = useCopy(item.id);
  const minted = useMintedId() === item.id;

  const t = TINTS[itemTint(item)];
  const type = contentType(item, preview);
  const iconName = useAppearance(item.id).icon ?? defaultIcon(type, item.confidential);
  const Icon = ICONS[iconName];
  const isFile = item.kind === "File";
  const isImage = type === "image";

  // thumbnail so an image is recognisable at a glance, no click needed
  const [thumb, setThumb] = useState<string | null>(null);
  const wantsThumb = isImage && !item.confidential;
  useEffect(() => {
    if (!wantsThumb) {
      setThumb(null);
      return;
    }
    let alive = true;
    void getCachedImageDataUrl(item.id).then((u) => alive && setThumb(u)).catch(() => {});
    return () => {
      alive = false;
    };
  }, [item.id, wantsThumb]);

  const { grabbing, begin } = useDragOut(item.id, isImage, thumb);
  const thumbRef = useRef<HTMLDivElement>(null);

  let value = "—";
  if (confidential) value = "•••••••••••";
  else if (isFile) value = `${fileExt(item.label) ? `${fileExt(item.label).toUpperCase()} · ` : ""}File`;
  else if (preview) value = preview;

  function open() {
    setSelectedItemId(item.id);
  }
  async function onFav() {
    try {
      await setPinned(item.id, !item.pinned);
      await reload();
    } catch {
      /* best-effort */
    }
  }

  return (
    <motion.div
      role="button"
      tabIndex={0}
      data-row
      onClick={open}
      onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), open())}
      draggable={isFile}
      onDragStart={
        isFile
          ? (e) => {
              e.preventDefault();
              const r = thumbRef.current?.getBoundingClientRect();
              begin(r ? [r.x, r.y, r.width, r.height] : undefined);
            }
          : undefined
      }
      animate={{ opacity: grabbing ? 0.45 : 1 }}
      transition={GRAB_TRANSITION}
      style={{
        ...(minted ? ({ "--mint-tint": t.tile } as React.CSSProperties) : {}),
        position: "relative",
        zIndex: grabbing ? 30 : undefined,
        cursor: isFile ? (grabbing ? "grabbing" : "grab") : "pointer",
      }}
      className={cn(
        "group flex select-none items-center gap-2.5 px-3 py-[7px] transition-colors hover:bg-[#f6f6f9]",
        minted && "qb-mint-row",
      )}
    >
      <motion.div
        ref={thumbRef}
        animate={{ scale: grabbing ? [1, 0.84, 1] : 1 }}
        transition={RECOIL_TRANSITION}
        className={cn("grid h-[32px] w-[32px] shrink-0 place-items-center overflow-hidden", thumb && "rounded-[9px] ring-1 ring-inset ring-black/10")}
        style={thumb ? { background: t.tile } : { color: t.tileInk }}
      >
        {thumb ? <img src={thumb} alt="" className="h-full w-full object-cover" /> : <Icon size={18} strokeWidth={1.9} />}
      </motion.div>

      <div className="min-w-0 flex-1">
        <div className="truncate text-[12.5px] font-semibold tracking-[-0.01em] text-[var(--ink)]">{item.label}</div>
        <div className={cn("truncate text-[11px] text-[var(--muted)]", confidential && "font-mono tracking-[2px] [filter:blur(0.4px)]", type === "code" && "font-mono")}>
          {copied ? <span className="font-semibold text-[#3f7a57]">Copied to clipboard</span> : value}
        </div>
      </div>

      {/* fixed columns keep type / time / actions aligned across every row */}
      <div className="hidden w-[54px] shrink-0 lg:block">
        <span className="rounded-[6px] bg-black/[0.045] px-2 py-0.5 text-[10px] font-medium text-[var(--muted)]">{CONTENT_TYPE_LABEL[type]}</span>
      </div>
      <div className="hidden w-[62px] shrink-0 text-right text-[10.5px] text-[var(--fainter)] tabular sm:block">
        {relativeTime(item.last_used_at || item.created_at)}
      </div>
      <div className="flex w-[58px] shrink-0 items-center justify-end gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
        {!isFile && (
          <button
            type="button"
            aria-label="Copy"
            onClick={(e) => {
              e.stopPropagation();
              void copy();
            }}
            className="grid h-7 w-7 place-items-center rounded-[8px] text-[var(--muted)] hover:bg-black/[0.06]"
          >
            <CopyCheck copied={copied} />
          </button>
        )}
        <FavoriteButton
          pinned={item.pinned}
          onToggle={onFav}
          size={14}
          idleColor="var(--fainter)"
          className="grid h-7 w-7 place-items-center rounded-[8px] hover:bg-black/[0.06]"
        />
      </div>
    </motion.div>
  );
}
