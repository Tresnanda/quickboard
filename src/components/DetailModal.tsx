import { useEffect, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { dragOutItem } from "../lib/drag";
import { Fingerprint, Pencil, SlidersHorizontal, Trash2, X } from "lucide-react";
import { useItems, useSelectedItem } from "../lib/items-store";
import { useAppearance } from "../lib/appearance";
import { itemTint } from "../lib/tints";
import { coverGradient } from "../lib/cover";
import { ICONS, defaultIcon } from "../lib/icons";
import { CONTENT_TYPE_LABEL, contentType, fileExt } from "../lib/content-type";
import { useReveal } from "../lib/use-reveal";
import { useCopy } from "../lib/use-copy";
import { deleteItem, getImageDataUrl, getTextValue, setPinned } from "../lib/ipc";
import { relativeTime } from "./ItemCard";
import { CopyCheck } from "./CopyCheck";
import { FavoriteButton } from "./FavoriteButton";
import { useToast } from "./Toast";
import { useConfirm } from "./ConfirmDialog";
import { getSettings } from "../lib/settings";
import { CustomizePopover } from "./CustomizePopover";
import { cn } from "../lib/utils";
import type { Item } from "../lib/types";

const EASE = [0.23, 1, 0.32, 1] as const;

export function DetailModal() {
  const { selectedItemId, setSelectedItemId } = useItems();
  const item = useSelectedItem();
  const open = !!selectedItemId && !!item;

  return (
    <Dialog.Root open={open} onOpenChange={(o) => !o && setSelectedItemId(null)}>
      <AnimatePresence initial={false}>
        {open && item && <Body key={item.id} item={item} onClose={() => setSelectedItemId(null)} />}
      </AnimatePresence>
    </Dialog.Root>
  );
}

function Body({ item, onClose }: { item: Item; onClose: () => void }) {
  const { reload, setEditItem, setAddOpen } = useItems();
  const toast = useToast();
  const confirm = useConfirm();
  const reduce = useReducedMotion();
  useAppearance(item.id);
  const tint = itemTint(item);
  const type = contentType(item);
  const iconName = useAppearance(item.id).icon ?? defaultIcon(type, item.confidential);
  const Icon = ICONS[iconName];
  const isFile = item.kind === "File";

  const { copied, copy } = useCopy(item.id);
  const reveal = useReveal(item.id);
  const [value, setValue] = useState<string | null>(null);

  // Non-confidential text: load the real value to show in the box.
  useEffect(() => {
    if (item.confidential || isFile) {
      setValue(null);
      return;
    }
    let alive = true;
    void getTextValue(item.id).then((v) => alive && setValue(v)).catch(() => {});
    return () => {
      alive = false;
    };
  }, [item.id, item.confidential, isFile]);

  // Image items: load the photo for the header (non-confidential only).
  const [cover, setCover] = useState<string | null>(null);
  useEffect(() => {
    if (type !== "image" || item.confidential) {
      setCover(null);
      return;
    }
    let alive = true;
    void getImageDataUrl(item.id).then((u) => alive && setCover(u)).catch(() => {});
    return () => {
      alive = false;
    };
  }, [item.id, type, item.confidential]);

  async function onDelete() {
    if (getSettings().confirmDelete && !(await confirm({ title: "Delete this item?", message: `“${item.label}” will be permanently removed.`, confirmLabel: "Delete", tone: "danger" }))) return;
    try {
      await deleteItem(item.id);
      toast({ message: "Item deleted", icon: <Trash2 size={14} strokeWidth={2.2} />, tone: "rose" });
      onClose();
      await reload();
    } catch {
      /* best-effort */
    }
  }

  async function onFav() {
    try {
      await setPinned(item.id, !item.pinned);
      await reload();
    } catch {
      /* best-effort */
    }
  }

  function onEdit() {
    setEditItem(item);
    setAddOpen(true);
    onClose();
  }

  async function onDrag(e: React.MouseEvent) {
    e.preventDefault();
    await dragOutItem(item.id, type === "image");
  }

  return (
    <Dialog.Portal forceMount>
      <Dialog.Overlay asChild forceMount>
        <motion.div
          className="fixed inset-0 z-50 bg-black/35 backdrop-blur-[2px]"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
        />
      </Dialog.Overlay>

      <div className="pointer-events-none fixed inset-0 z-50 grid place-items-center p-6">
        <Dialog.Content asChild forceMount onOpenAutoFocus={(e) => e.preventDefault()} aria-describedby={undefined}>
          <motion.div
            className={cn(`tint-${tint}`, "pointer-events-auto w-[392px] max-w-[calc(100vw-3rem)] rounded-modal bg-white p-2 shadow-modal")}
            initial={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.96 }}
            animate={reduce ? { opacity: 1 } : { opacity: 1, scale: 1 }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.97 }}
            transition={{ duration: 0.24, ease: EASE }}
            style={{ transformOrigin: "center" }}
          >
            {/* inset header — photo cover for images, else tinted gradient */}
            <div
              className={cn("relative overflow-hidden rounded-[var(--r-inner)]", cover ? "h-[180px] ring-1 ring-inset ring-black/10" : "h-[92px]")}
              style={cover ? undefined : { background: coverGradient(item.id, tint) }}
            >
              {cover && <img src={cover} alt="" className="absolute inset-0 h-full w-full object-cover" />}
              {!cover && <div className="qb-grain" />}
              <FavoriteButton
                pinned={item.pinned}
                onToggle={onFav}
                size={15}
                idleColor="#9b9ba1"
                className="absolute left-3 top-3 z-10 grid h-7 w-7 place-items-center rounded-full bg-white/70 backdrop-blur-sm"
              />
              <Dialog.Close
                className="absolute right-3 top-3 z-10 grid h-7 w-7 place-items-center rounded-full bg-white/70 text-[#52525b] backdrop-blur-sm"
                aria-label="Close"
              >
                <X size={15} />
              </Dialog.Close>
            </div>

            {/* body */}
            <div className="px-3.5 pb-3">
              {/* the icon badge lifts up out of the cover's bottom-left (image items skip it) */}
              {!cover && (
                <motion.div
                  className="relative z-10 -mt-[30px] mb-2.5 grid h-[58px] w-[58px] place-items-center rounded-[17px] bg-white ring-1 ring-black/[0.06]"
                  style={{ color: "var(--t-tile-ink)", boxShadow: "0 12px 26px -12px rgba(0,0,0,.32), inset 0 1px 0 rgba(255,255,255,.9)" }}
                  initial={reduce ? false : { scale: 0.5, opacity: 0, y: 6 }}
                  animate={{ scale: 1, opacity: 1, y: 0 }}
                  transition={reduce ? { duration: 0 } : { type: "spring", duration: 0.5, bounce: 0.42, delay: 0.05 }}
                >
                  <Icon size={26} strokeWidth={1.85} />
                </motion.div>
              )}
              <motion.div className={cn(cover && "pt-4")} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1, duration: 0.3, ease: EASE }}>
                <Dialog.Title className="text-balance text-[21px] font-extrabold tracking-[-0.025em] text-[var(--ink)]">
                  {item.label}
                </Dialog.Title>
              </motion.div>
              <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.16, duration: 0.3, ease: EASE }} className="mt-2 flex flex-wrap items-center gap-2 text-[12px] text-[var(--faint)]">
                <span className="font-medium text-[var(--muted)]">{item.environment}</span>
                <span>·</span>
                <span className="rounded-[7px] bg-[#f3f3f7] px-2.5 py-[3px] text-[11.5px] font-semibold text-[#52525b]">{item.category}</span>
                <span>·</span>
                <span>{item.confidential ? "Confidential " : ""}{CONTENT_TYPE_LABEL[type]}</span>
                <span>·</span>
                <span className="tabular">{relativeTime(item.last_used_at || item.created_at) || "just now"}</span>
              </motion.div>

              {/* value */}
              <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.22, duration: 0.3, ease: EASE }} className="mt-4">
                {item.confidential ? (
                  <div className="flex items-center justify-between gap-3 rounded-[14px] border border-[var(--hair-soft)] bg-[#f5f5f8] px-4 py-3.5">
                    <AnimatePresence mode="wait" initial={false}>
                      {reveal.revealed ? (
                        <motion.span
                          key="val"
                          className="break-all font-mono text-[14px] text-[var(--ink)]"
                          initial={{ opacity: 0, filter: "blur(9px)" }}
                          animate={{ opacity: 1, filter: "blur(0px)" }}
                          exit={{ opacity: 0, filter: "blur(9px)" }}
                          transition={{ duration: 0.38, ease: EASE }}
                        >
                          {reveal.value}
                        </motion.span>
                      ) : (
                        <motion.span
                          key="dots"
                          className="font-mono text-[15px] tracking-[2px] text-[#9a9a95] [filter:blur(0.5px)]"
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          exit={{ opacity: 0 }}
                          transition={{ duration: 0.2 }}
                        >
                          •••••••••••••
                        </motion.span>
                      )}
                    </AnimatePresence>
                    <button
                      type="button"
                      onClick={() => void reveal.toggle()}
                      disabled={reveal.busy}
                      className="flex shrink-0 items-center gap-2 whitespace-nowrap text-[12px] font-semibold text-[var(--text)]"
                    >
                      <span className="grid h-6 w-6 place-items-center rounded-full border-[1.6px] border-[#c9a23f] text-[#a9842c]">
                        <Fingerprint size={13} />
                      </span>
                      {reveal.revealed ? "Hide" : "Touch ID to reveal"}
                    </button>
                  </div>
                ) : isFile ? (
                  <div className="rounded-[14px] border border-[var(--hair-soft)] bg-[#f5f5f8] px-4 py-3.5 text-[12.5px] text-[var(--muted)]">
                    {fileExt(item.label) ? `${fileExt(item.label).toUpperCase()} file` : "File"} · drag the card to use it anywhere
                  </div>
                ) : (
                  <div className="max-h-[180px] overflow-auto rounded-[14px] border border-[var(--hair-soft)] bg-[#f5f5f8] px-4 py-3.5">
                    <span className={cn("whitespace-pre-wrap break-words text-[13.5px] text-[var(--ink-soft)]", type === "code" && "font-mono text-[12.5px]")}>
                      {value ?? "…"}
                    </span>
                  </div>
                )}
              </motion.div>

              {/* actions */}
              <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.28, duration: 0.3, ease: EASE }} className="mt-4 flex items-center gap-2">
                <CustomizePopover item={item}>
                  <button
                    type="button"
                    aria-label="Customize"
                    className="qb-press grid h-[38px] w-[38px] place-items-center rounded-[11px] border border-[var(--hair)] bg-white text-[var(--muted)]"
                  >
                    <SlidersHorizontal size={16} />
                  </button>
                </CustomizePopover>
                <button
                  type="button"
                  onClick={onEdit}
                  aria-label="Edit"
                  className="qb-press grid h-[38px] w-[38px] place-items-center rounded-[11px] border border-[var(--hair)] bg-white text-[var(--muted)]"
                >
                  <Pencil size={16} />
                </button>
                <button
                  type="button"
                  onClick={onDelete}
                  aria-label="Delete"
                  className="qb-press grid h-[38px] w-[38px] place-items-center rounded-[11px] border border-[var(--hair)] bg-white text-[#b4424f]"
                >
                  <Trash2 size={16} />
                </button>

                <div className="flex-1" />

                {isFile ? (
                  <button
                    type="button"
                    onMouseDown={onDrag}
                    className="qb-press flex h-[38px] items-center gap-2 rounded-[12px] bg-[var(--ink)] px-5 text-[13.5px] font-semibold text-white shadow-ink"
                  >
                    Drag out
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => void copy()}
                    className="qb-press flex h-[38px] items-center gap-2 rounded-[12px] bg-[var(--ink)] px-5 text-[13.5px] font-semibold text-white shadow-ink"
                  >
                    <CopyCheck copied={copied} size={16} />
                    {copied ? "Copied" : "Copy"}
                  </button>
                )}
              </motion.div>
            </div>
          </motion.div>
        </Dialog.Content>
      </div>
    </Dialog.Portal>
  );
}
