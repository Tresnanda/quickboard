import { lazy, Suspense, useEffect, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { open as openFileDialog } from "@tauri-apps/plugin-dialog";
import { Check, Image as ImageIcon, Trash2, X } from "lucide-react";
import { useItems } from "../lib/items-store";
import { clearAppearance, getAppearance, setAppearance, useAppearance } from "../lib/appearance";
import { deleteCategory, readImageAsDataUrl, renameCategory } from "../lib/ipc";
import { TINTS, TINT_NAMES } from "../lib/tints";
import { coverColors, coverGradient } from "../lib/cover";
// lazy so three.js stays out of app startup — loads on first modal open
const ShaderHeader = lazy(() => import("./ShaderHeader"));
import { ImageCropper } from "./ImageCropper";
import { useToast } from "./Toast";
import { useConfirm } from "./ConfirmDialog";
import { getSettings } from "../lib/settings";
import { cn } from "../lib/utils";

export function FolderEditor({ folder, onClose }: { folder: string | null; onClose: () => void }) {
  const reduce = useReducedMotion();
  const { reload, activeEnvironment } = useItems();
  const toast = useToast();
  const confirm = useConfirm();
  const key = `cat:${folder ?? ""}`;
  const app = useAppearance(key);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [cropSrc, setCropSrc] = useState<string | null>(null);

  useEffect(() => {
    if (folder) setName(folder);
  }, [folder]);

  const tint = app.tint ?? "sand";
  const cover = app.cover;
  const sg = coverColors(folder ?? "folder", tint);

  async function chooseCover() {
    if (!folder) return;
    try {
      const sel = await openFileDialog({ multiple: false, filters: [{ name: "Image", extensions: ["png", "jpg", "jpeg", "webp", "gif", "heic"] }] });
      if (typeof sel === "string") setCropSrc(await readImageAsDataUrl(sel));
    } catch {
      /* cancelled */
    }
  }

  async function save() {
    if (!folder || busy) return;
    const next = name.trim();
    if (next && next !== folder) {
      setBusy(true);
      try {
        const a = getAppearance(key);
        setAppearance(`cat:${next}`, a);
        if (!activeEnvironment) clearAppearance(key); // a scoped rename leaves the name in other workspaces
        await renameCategory(folder, next, activeEnvironment);
        await reload();
        toast({ message: "Folder renamed", icon: <Check size={14} strokeWidth={2.6} />, tone: "green" });
      } catch {
        /* surfaced later */
      } finally {
        setBusy(false);
      }
    }
    onClose();
  }

  async function del() {
    if (!folder || busy) return;
    if (getSettings().confirmDelete && !(await confirm({ title: "Delete this folder?", message: `Items in “${folder}” will move to Uncategorized.`, confirmLabel: "Delete", tone: "danger" }))) return;
    setBusy(true);
    try {
      await deleteCategory(folder, activeEnvironment);
      clearAppearance(key);
      await reload();
      toast({ message: "Folder deleted — items moved to Uncategorized", icon: <Trash2 size={14} strokeWidth={2.2} />, tone: "rose" });
    } catch {
      /* surfaced later */
    } finally {
      setBusy(false);
      onClose();
    }
  }

  return (
    <Dialog.Root open={!!folder} onOpenChange={(o) => !o && onClose()}>
      <AnimatePresence initial={false}>
        {folder && (
          <Dialog.Portal forceMount>
            <Dialog.Overlay asChild forceMount>
              <motion.div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-[3px]" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }} />
            </Dialog.Overlay>
            <div className="pointer-events-none fixed inset-0 z-50 grid place-items-center p-6">
              <Dialog.Content asChild forceMount onOpenAutoFocus={(e) => e.preventDefault()} aria-describedby={undefined}>
                <motion.div
                  className={cn(`tint-${tint}`, "pointer-events-auto max-h-[90vh] w-[420px] max-w-[calc(100vw-3rem)] overflow-y-auto rounded-[var(--r-modal)] bg-white p-2 shadow-modal")}
                  initial={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.93, y: 12 }}
                  animate={reduce ? { opacity: 1 } : { opacity: 1, scale: 1, y: 0 }}
                  exit={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.97, y: 6 }}
                  transition={reduce ? { duration: 0.2 } : { type: "spring", duration: 0.45, bounce: 0.16 }}
                  style={{ transformOrigin: "center" }}
                >
                  <Dialog.Title className="sr-only">Edit folder</Dialog.Title>

                  {/* live preview */}
                  <div className="relative h-[100px] overflow-hidden rounded-[var(--r-inner)]" style={{ background: cover ? "var(--t-tile)" : coverGradient(folder, tint) }}>
                    {cover ? <img src={cover} alt="" className="absolute inset-0 h-full w-full object-cover" /> : <Suspense fallback={null}><ShaderHeader color1={sg[0]} color2={sg[1]} color3={sg[2]} /></Suspense>}
                    <Dialog.Close className="qb-press absolute right-3 top-3 z-10 grid h-7 w-7 place-items-center rounded-full bg-white/70 text-[#52525b] backdrop-blur-sm" aria-label="Close">
                      <X size={15} />
                    </Dialog.Close>
                  </div>

                  <div className="space-y-4 px-3 pb-3 pt-4">
                    <label className="block">
                      <span className="mb-1.5 block text-[11px] font-semibold text-[var(--muted)]">Folder name</span>
                      <input value={name} onChange={(e) => setName(e.target.value)} className="qb-input" placeholder="Folder name" autoFocus />
                    </label>

                    <div>
                      <div className="mb-2 text-[11px] font-semibold text-[var(--muted)]">Color</div>
                      <div className="flex flex-wrap gap-2">
                        {TINT_NAMES.map((nm) => {
                          const t = TINTS[nm];
                          const on = (app.tint ?? tint) === nm && !!app.tint;
                          return (
                            <button
                              key={nm}
                              type="button"
                              onClick={() => setAppearance(key, { tint: nm })}
                              aria-label={t.label}
                              className={cn("qb-press grid h-[28px] w-[28px] place-items-center rounded-[9px] border border-black/[0.07]", on && "ring-2 ring-black/25 ring-offset-1 ring-offset-white")}
                              style={{ background: t.card }}
                            >
                              {on && <Check size={14} strokeWidth={2.75} className="text-black/55" />}
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    <div>
                      <div className="mb-2 text-[11px] font-semibold text-[var(--muted)]">Cover image</div>
                      <div className="flex gap-2">
                        <button type="button" onClick={() => void chooseCover()} className="qb-press flex h-[34px] flex-1 items-center justify-center gap-2 rounded-[10px] border border-dashed border-[var(--border)] bg-[#fafafc] text-[12.5px] font-medium text-[var(--muted)]">
                          <ImageIcon size={14} />
                          {cover ? "Replace image" : "Choose image"}
                        </button>
                        {cover && (
                          <button type="button" onClick={() => setAppearance(key, { cover: undefined })} className="qb-press grid h-[34px] w-[34px] place-items-center rounded-[10px] border border-[var(--border)] bg-white text-[var(--muted)]">
                            <X size={15} />
                          </button>
                        )}
                      </div>
                    </div>

                    <div className="flex gap-2 pt-1">
                      <button type="button" onClick={() => void del()} disabled={busy} className="qb-press flex h-[42px] items-center justify-center gap-2 rounded-[12px] border border-[#f0d9dd] bg-[#fbf2f3] px-4 text-[13px] font-semibold text-[#b4424f] disabled:opacity-50">
                        <Trash2 size={15} />
                        Delete
                      </button>
                      <button type="button" onClick={() => void save()} disabled={busy} className="qb-press flex h-[42px] flex-1 items-center justify-center gap-2 rounded-[12px] bg-[var(--ink)] text-[13.5px] font-semibold text-white shadow-ink disabled:opacity-50">
                        Save changes
                      </button>
                    </div>
                  </div>
                </motion.div>
              </Dialog.Content>
            </div>
          </Dialog.Portal>
        )}
      </AnimatePresence>

      <ImageCropper src={cropSrc} aspect={1.5} onCancel={() => setCropSrc(null)} onCrop={(url) => { setAppearance(key, { cover: url }); setCropSrc(null); }} />
    </Dialog.Root>
  );
}
