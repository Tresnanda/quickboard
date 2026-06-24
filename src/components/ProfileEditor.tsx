import { useEffect, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { open as openFileDialog } from "@tauri-apps/plugin-dialog";
import { Check, Image as ImageIcon, X } from "lucide-react";
import { getProfile, setProfile } from "../lib/profile";
import { readImageAsDataUrl } from "../lib/ipc";
import { TINTS, TINT_NAMES, type TintName } from "../lib/tints";
import { useToast } from "./Toast";
import { Avatar } from "./Avatar";
import { ImageCropper } from "./ImageCropper";
import { cn } from "../lib/utils";

export function ProfileEditor({ open, onClose }: { open: boolean; onClose: () => void }) {
  const reduce = useReducedMotion();
  const toast = useToast();
  const [name, setName] = useState("");
  const [tint, setTint] = useState<TintName>("violet");
  const [status, setStatus] = useState("");
  const [photo, setPhoto] = useState<string | undefined>(undefined);
  const [cropSrc, setCropSrc] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      const p = getProfile();
      setName(p.name === "you" ? "" : p.name);
      setTint(p.tint);
      setStatus(p.status ?? "");
      setPhoto(p.photo);
    }
  }, [open]);

  async function choosePhoto() {
    try {
      const sel = await openFileDialog({ multiple: false, filters: [{ name: "Image", extensions: ["png", "jpg", "jpeg", "webp", "gif", "heic"] }] });
      if (typeof sel === "string") setCropSrc(await readImageAsDataUrl(sel));
    } catch {
      /* cancelled */
    }
  }

  function save() {
    setProfile({ name: name.trim() || "you", tint, status: status.trim() || undefined, photo });
    toast({ message: "Profile updated", icon: <Check size={14} strokeWidth={2.6} />, tone: "green" });
    onClose();
  }

  return (
    <Dialog.Root open={open} onOpenChange={(o) => !o && onClose()}>
      <AnimatePresence initial={false}>
        {open && (
          <Dialog.Portal forceMount>
            <Dialog.Overlay asChild forceMount>
              <motion.div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-[3px]" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }} />
            </Dialog.Overlay>
            <div className="pointer-events-none fixed inset-0 z-50 grid place-items-center p-6">
              <Dialog.Content asChild forceMount onOpenAutoFocus={(e) => e.preventDefault()} aria-describedby={undefined}>
                <motion.div
                  className="pointer-events-auto w-[380px] max-w-[calc(100vw-3rem)] overflow-hidden rounded-[var(--r-modal)] bg-white p-2 shadow-modal"
                  initial={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.93, y: 12 }}
                  animate={reduce ? { opacity: 1 } : { opacity: 1, scale: 1, y: 0 }}
                  exit={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.97, y: 6 }}
                  transition={reduce ? { duration: 0.2 } : { type: "spring", duration: 0.45, bounce: 0.16 }}
                >
                  <Dialog.Title className="sr-only">Edit profile</Dialog.Title>

                  {/* preview */}
                  <div className="relative flex flex-col items-center gap-2 overflow-hidden rounded-[var(--r-inner)] px-4 pb-4 pt-6" style={{ background: `linear-gradient(180deg, ${TINTS[tint].card}, #ffffff)` }}>
                    <Dialog.Close className="qb-press absolute right-3 top-3 grid h-7 w-7 place-items-center rounded-full bg-white/70 text-[#52525b] backdrop-blur-sm" aria-label="Close">
                      <X size={15} />
                    </Dialog.Close>
                    <motion.div initial={reduce ? false : { scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={reduce ? { duration: 0 } : { type: "spring", duration: 0.5, bounce: 0.4 }}>
                      <Avatar name={name || "you"} tint={tint} photo={photo} className="h-[60px] w-[60px] rounded-full text-[24px] shadow-[0_10px_26px_-10px_rgba(0,0,0,.3)] ring-[3px] ring-white" />
                    </motion.div>
                    <div className="text-center leading-tight">
                      <div className="text-[15.5px] font-extrabold tracking-[-0.02em] text-[var(--ink)]">{name.trim() || "Your name"}</div>
                      <div className="text-[11.5px] text-[var(--muted)]">{status.trim() || "Local on this Mac"}</div>
                    </div>
                  </div>

                  <div className="space-y-3 px-3 pb-3 pt-3.5">
                    <label className="block">
                      <span className="mb-1 block text-[11px] font-semibold text-[var(--muted)]">Name</span>
                      <input value={name} onChange={(e) => setName(e.target.value)} className="qb-input" placeholder="Your name" autoFocus />
                    </label>

                    <label className="block">
                      <span className="mb-1 block text-[11px] font-semibold text-[var(--muted)]">Status</span>
                      <input value={status} onChange={(e) => setStatus(e.target.value)} className="qb-input" placeholder="What you're working on…" />
                    </label>

                    <div>
                      <div className="mb-1.5 text-[11px] font-semibold text-[var(--muted)]">Avatar color</div>
                      <div className="flex flex-wrap gap-1.5">
                        {TINT_NAMES.map((nm) => {
                          const t = TINTS[nm];
                          const on = tint === nm;
                          return (
                            <button key={nm} type="button" onClick={() => setTint(nm)} aria-label={t.label} className={cn("qb-press grid h-[26px] w-[26px] place-items-center rounded-full border border-black/[0.07]", on && "ring-2 ring-black/25 ring-offset-1 ring-offset-white")} style={{ background: t.card }}>
                              {on && <Check size={13} strokeWidth={2.75} className="text-black/55" />}
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <button type="button" onClick={() => void choosePhoto()} className="qb-press flex h-[34px] flex-1 items-center justify-center gap-2 rounded-[10px] border border-dashed border-[var(--border)] bg-[#fafafc] text-[12.5px] font-medium text-[var(--muted)]">
                        <ImageIcon size={14} />
                        {photo ? "Replace photo" : "Choose photo"}
                      </button>
                      {photo && (
                        <button type="button" onClick={() => setPhoto(undefined)} className="qb-press grid h-[34px] w-[34px] place-items-center rounded-[10px] border border-[var(--border)] bg-white text-[var(--muted)]">
                          <X size={15} />
                        </button>
                      )}
                      <button type="button" onClick={save} className="qb-press h-[34px] rounded-[11px] bg-[var(--ink)] px-5 text-[12.5px] font-semibold text-white shadow-ink">
                        Save
                      </button>
                    </div>
                  </div>
                </motion.div>
              </Dialog.Content>
            </div>
          </Dialog.Portal>
        )}
      </AnimatePresence>

      <ImageCropper src={cropSrc} aspect={1} round onCancel={() => setCropSrc(null)} onCrop={(url) => { setPhoto(url); setCropSrc(null); }} />
    </Dialog.Root>
  );
}
