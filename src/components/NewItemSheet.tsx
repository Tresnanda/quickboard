import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { AnimatePresence, motion, useReducedMotion, type Variants } from "framer-motion";
import { open as openFileDialog } from "@tauri-apps/plugin-dialog";
import { Check, Code, FileText, Fingerprint, Image as ImageIcon, Link as LinkIcon, Paperclip, Plus, Sparkles, StickyNote, X } from "lucide-react";
import { useItems } from "../lib/items-store";
import { useToast } from "./Toast";
import { useConfetti } from "./Confetti";
import { useMintFlight } from "./MintFlight";
import { Combobox } from "./Combobox";
import { addFile, addText, getTextValue, updateItem } from "../lib/ipc";
import { invalidateImage } from "../lib/image-cache";
import { getAppearance, setAppearance } from "../lib/appearance";
import { CONTENT_TYPE_LABEL, contentType } from "../lib/content-type";
import { coverGradient, coverColors } from "../lib/cover";
import { TINTS, TINT_NAMES, categoryTint, type TintName } from "../lib/tints";
import { ICONS, defaultIcon, type IconName } from "../lib/icons";
import type { ContentType } from "../lib/types";
import { cn } from "../lib/utils";

// lazy so three.js stays out of app startup — loads on first modal open
const ShaderHeader = lazy(() => import("./ShaderHeader"));

const TYPES: { type: ContentType; label: string; backing: "text" | "file"; icon: typeof StickyNote }[] = [
  { type: "note", label: "Note", backing: "text", icon: StickyNote },
  { type: "link", label: "Link", backing: "text", icon: LinkIcon },
  { type: "code", label: "Code", backing: "text", icon: Code },
  { type: "image", label: "Image", backing: "file", icon: ImageIcon },
  { type: "file", label: "File", backing: "file", icon: FileText },
];

const PLACEHOLDER: Record<ContentType, string> = {
  note: "What do you want to remember?",
  link: "https://…",
  code: "git push origin main",
  image: "",
  file: "",
};

const FORM_STAGGER: Variants = { hidden: {}, show: { transition: { staggerChildren: 0.06, delayChildren: 0.16 } } };
const FORM_ITEM: Variants = { hidden: { opacity: 0, y: 10 }, show: { opacity: 1, y: 0, transition: { duration: 0.32, ease: [0.23, 1, 0.32, 1] } } };

export function NewItemSheet() {
  const { addOpen, setAddOpen, items, environments, activeEnvironment, editItem, setEditItem, reload } = useItems();
  const reduce = useReducedMotion();
  const toast = useToast();
  const fire = useConfetti();
  const mint = useMintFlight();
  const headerRef = useRef<HTMLDivElement>(null);

  const [type, setType] = useState<ContentType>("note");
  const [label, setLabel] = useState("");
  const [value, setValue] = useState("");
  const [filePath, setFilePath] = useState<string | null>(null);
  const [category, setCategory] = useState("");
  const [environment, setEnvironment] = useState("Personal");
  const [confidential, setConfidential] = useState(false);
  const [tint, setTint] = useState<TintName | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  const backing = TYPES.find((t) => t.type === type)!.backing;
  const isEdit = !!editItem;

  useEffect(() => {
    if (!addOpen) return;
    setBusy(false);
    setDone(false);
    setFilePath(null);
    if (editItem) {
      setType(contentType(editItem));
      setLabel(editItem.label);
      setCategory(editItem.category);
      setEnvironment(editItem.environment);
      setConfidential(editItem.confidential);
      setTint(getAppearance(editItem.id).tint ?? null);
      setValue("");
      if (editItem.kind === "Text") {
        void getTextValue(editItem.id).then((v) => setValue(v)).catch(() => {});
      }
    } else {
      setType("note");
      setLabel("");
      setValue("");
      setCategory("");
      setEnvironment(activeEnvironment ?? "Personal");
      setConfidential(false);
      setTint(null);
    }
  }, [addOpen, editItem, activeEnvironment]);

  const effectiveTint = tint ?? categoryTint(category);
  const sgColors = coverColors("mint", effectiveTint);

  // categories are per-environment — suggest only those that exist in the chosen one
  const envCategories = useMemo(() => {
    const set = new Set<string>();
    for (const it of items) if (it.environment === environment) set.add(it.category);
    return Array.from(set).sort();
  }, [items, environment]);
  const iconName: IconName = defaultIcon(type, confidential);
  const PreviewIcon = ICONS[iconName];

  async function pickFile() {
    try {
      const sel = await openFileDialog({ multiple: false });
      if (typeof sel === "string") {
        setFilePath(sel);
        if (!label) setLabel(sel.split(/[\\/]/).pop() || "");
      }
    } catch {
      /* cancelled */
    }
  }

  const canSubmit = !!label.trim() && !!category.trim() && !!environment.trim() && (backing === "text" ? !!value.trim() : isEdit || !!filePath);

  async function submit() {
    if (!canSubmit || busy) return;
    setBusy(true);
    try {
      let newId: string | null = null;
      if (editItem) {
        await updateItem(editItem.id, label.trim(), category.trim(), environment.trim(), confidential, backing === "text" ? value : null);
        invalidateImage(editItem.id);
        setAppearance(editItem.id, { type, ...(tint ? { tint } : {}) });
      } else {
        newId =
          backing === "text"
            ? await addText(label.trim(), category.trim(), environment.trim(), confidential, value)
            : await addFile(label.trim(), category.trim(), environment.trim(), confidential, filePath!);
        setAppearance(newId, { type, ...(tint ? { tint } : {}) });
        if (!reduce) mint(newId); // mark the new row so it mints in as it mounts
      }
      await reload();
      setDone(true);
      if (newId && !reduce) {
        fire(window.innerWidth / 2, window.innerHeight * 0.42);
      }
      toast({
        message: editItem ? "Changes saved" : "Added to your board",
        icon: editItem ? <Check size={14} strokeWidth={2.6} /> : <Sparkles size={14} strokeWidth={2.2} />,
        tone: "green",
      });
      await new Promise((r) => setTimeout(r, 480));
      setAddOpen(false);
      setEditItem(null);
    } catch {
      /* surfaced later */
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog.Root open={addOpen} onOpenChange={(o) => { setAddOpen(o); if (!o) setEditItem(null); }}>
      <AnimatePresence initial={false}>
        {addOpen && (
          <Dialog.Portal forceMount>
            <Dialog.Overlay asChild forceMount>
              <motion.div
                className="fixed inset-0 z-50 bg-black/40 backdrop-blur-[3px]"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
              />
            </Dialog.Overlay>

            <div className="pointer-events-none fixed inset-0 z-50 grid place-items-center p-6">
              <Dialog.Content asChild forceMount onOpenAutoFocus={(e) => e.preventDefault()} aria-describedby={undefined}>
                <motion.div
                  className={cn(
                    `tint-${effectiveTint}`,
                    "pointer-events-auto flex max-h-[88vh] w-[466px] max-w-[calc(100vw-3rem)] flex-col gap-2 overflow-hidden rounded-[var(--r-modal)] border border-[#e2e2e6] bg-[#e9e9ec] p-2 shadow-modal",
                  )}
                  initial={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.93, y: 12 }}
                  animate={reduce ? { opacity: 1 } : { opacity: 1, scale: 1, y: 0 }}
                  exit={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.97, y: 6 }}
                  transition={reduce ? { duration: 0.2 } : { type: "spring", duration: 0.5, bounce: 0.16 }}
                  style={{ transformOrigin: "center" }}
                >
                  {/* live preview header — the same tinted face you'll open later */}
                  <div ref={headerRef} className="relative h-[150px] shrink-0 overflow-hidden rounded-[var(--r-inner)]" style={{ background: coverGradient("mint", effectiveTint) }}>
                    {/* live animated ShaderGradient (baked cover shows underneath until it paints) */}
                    <Suspense fallback={null}>
                      <ShaderHeader color1={sgColors[0]} color2={sgColors[1]} color3={sgColors[2]} />
                    </Suspense>
                    {/* legibility scrim — keeps the dark preview text readable over the gradient */}
                    <div className="pointer-events-none absolute inset-x-0 bottom-0 h-2/3" style={{ background: "linear-gradient(to top, rgba(255,255,255,0.5), rgba(255,255,255,0.12) 46%, transparent 78%)" }} />
                    <Dialog.Close
                      className="qb-press absolute right-3 top-3 z-10 grid h-7 w-7 place-items-center rounded-full bg-white/70 text-[#52525b] backdrop-blur-sm"
                      aria-label="Close"
                    >
                      <X size={15} />
                    </Dialog.Close>
                    {/* live preview — your item, written on the gradient */}
                    <div className="absolute inset-x-0 bottom-0 flex items-end gap-3 p-4">
                      <motion.div
                        className="grid h-[46px] w-[46px] shrink-0 place-items-center rounded-[14px] bg-white/75 backdrop-blur-md"
                        style={{ color: "var(--t-tile-ink)", boxShadow: "0 8px 22px -8px rgba(0,0,0,.28), inset 0 1px 0 rgba(255,255,255,.85)" }}
                        initial={reduce ? false : { scale: 0.4, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        transition={reduce ? { duration: 0 } : { type: "spring", duration: 0.55, bounce: 0.45, delay: 0.13 }}
                      >
                        <PreviewIcon size={22} strokeWidth={1.9} />
                      </motion.div>
                      <div className="min-w-0 flex-1 pb-0.5">
                        <Dialog.Title asChild>
                          <div className="truncate text-[17px] font-extrabold tracking-[-0.02em]" style={{ color: label.trim() ? "#28282d" : "rgba(40,40,48,0.42)" }}>
                            {label.trim() || (isEdit ? "Edit item" : "Name your item")}
                          </div>
                        </Dialog.Title>
                        <div className="mt-0.5 truncate text-[12px]" style={{ color: "rgba(38,38,46,0.6)" }}>
                          {confidential
                            ? "•••••••••••"
                            : backing === "file"
                              ? (filePath?.split(/[\\/]/).pop() ?? "No file chosen")
                              : value.trim() || PLACEHOLDER[type] || CONTENT_TYPE_LABEL[type]}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* body — its own card, gapped from the gradient like the shell */}
                  <motion.div
                    variants={FORM_STAGGER}
                    initial="hidden"
                    animate="show"
                    className="qb-scroll min-h-0 overflow-y-auto rounded-[var(--r-inner)] border border-[#ededf0] bg-white px-3.5 py-4 shadow-[0_1px_2px_rgba(0,0,0,0.03)]"
                  >
                    {/* type segmented (fixed when editing) */}
                    {!isEdit && (
                      <motion.div variants={FORM_ITEM} className="flex gap-1.5">
                        {TYPES.map((t) => {
                          const on = type === t.type;
                          const TI = t.icon;
                          return (
                            <button
                              key={t.type}
                              type="button"
                              onClick={() => setType(t.type)}
                              className={cn(
                                "qb-press relative flex h-[34px] flex-1 items-center justify-center gap-1.5 rounded-[10px] text-[12px] font-semibold",
                                on ? "text-white" : "bg-[#f4f4f6] text-[#6e6e76] hover:bg-[#eeeef2]",
                              )}
                            >
                              {on && <motion.span layoutId="type-seg" className="absolute inset-0 rounded-[10px] bg-[var(--ink)]" transition={{ type: "spring", stiffness: 420, damping: 34 }} />}
                              <TI size={13} strokeWidth={2} className="relative" />
                              <span className="relative">{t.label}</span>
                            </button>
                          );
                        })}
                      </motion.div>
                    )}

                    <motion.div variants={FORM_ITEM} className="mt-4 space-y-3.5">
                      <Field label="Label">
                        <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Wi-Fi · Home" className="qb-input" autoFocus />
                      </Field>

                      {backing === "text" ? (
                        <Field label={type === "link" ? "URL" : "Value"}>
                          <textarea
                            value={value}
                            onChange={(e) => setValue(e.target.value)}
                            placeholder={PLACEHOLDER[type]}
                            rows={type === "code" ? 4 : 2}
                            className={cn("qb-input resize-none", type === "code" && "font-mono text-[12.5px]")}
                          />
                        </Field>
                      ) : (
                        <Field label="File">
                          {isEdit ? (
                            <div className="flex h-[42px] w-full items-center gap-2.5 rounded-[11px] border border-[var(--border)] bg-[#f5f5f8] px-3.5 text-[13px] text-[var(--muted)]">
                              <Paperclip size={15} />
                              <span className="truncate">{label || "File"}</span>
                              <span className="ml-auto shrink-0 text-[11px] text-[var(--fainter)]">file can't be changed</span>
                            </div>
                          ) : (
                            <button
                              type="button"
                              onClick={pickFile}
                              className="qb-press flex h-[42px] w-full items-center gap-2.5 rounded-[11px] border border-dashed border-[var(--border)] bg-[#fafafc] px-3.5 text-[13px] text-[var(--muted)]"
                            >
                              <Paperclip size={15} />
                              <span className="truncate">{filePath ? filePath.split(/[\\/]/).pop() : "Choose a file…"}</span>
                            </button>
                          )}
                        </Field>
                      )}

                      <div className="grid grid-cols-2 gap-3">
                        <Field label="Environment">
                          <Combobox value={environment} onChange={setEnvironment} options={environments} placeholder="Personal" />
                        </Field>
                        <Field label="Category">
                          <Combobox value={category} onChange={setCategory} options={envCategories} placeholder="Identity" />
                        </Field>
                      </div>

                      {/* confidential — clean inset row */}
                      <button
                        type="button"
                        role="switch"
                        aria-checked={confidential}
                        onClick={() => setConfidential((v) => !v)}
                        className="flex w-full items-center gap-3 rounded-[12px] border border-[var(--border)] bg-[#fafafc] px-3 py-2.5 text-left"
                      >
                        <span className="grid h-[30px] w-[30px] shrink-0 place-items-center rounded-[9px] bg-white text-[#9a7a2e] ring-1 ring-black/[0.05]">
                          <Fingerprint size={16} />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block text-[13px] font-semibold text-[var(--ink)]">Confidential</span>
                          <span className="block text-[11.5px] text-[var(--faint)]">Unlock with Touch ID to copy or reveal</span>
                        </span>
                        <span className={cn("relative h-[24px] w-[44px] shrink-0 rounded-full transition-colors duration-200", confidential ? "bg-[var(--ink)]" : "bg-[#dcdce1]")}>
                          <span
                            aria-hidden
                            className="absolute left-[3px] top-[3px] h-[18px] w-[18px] rounded-full bg-white shadow transition-transform duration-200 ease-out"
                            style={{ transform: confidential ? "translateX(20px)" : "translateX(0)" }}
                          />
                        </span>
                      </button>

                      {/* color */}
                      <div>
                        <div className="mb-2 text-[11px] font-semibold text-[var(--muted)]">Color</div>
                        <div className="flex flex-wrap gap-2">
                          {TINT_NAMES.map((name) => {
                            const t = TINTS[name];
                            const on = (tint ?? effectiveTint) === name;
                            return (
                              <button
                                key={name}
                                type="button"
                                onClick={() => setTint(name)}
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
                    </motion.div>

                    <motion.div variants={FORM_ITEM}>
                      <button
                        type="button"
                        disabled={!canSubmit || busy}
                        onClick={() => void submit()}
                        className={cn(
                          "qb-press mt-5 flex h-[46px] w-full items-center justify-center gap-2 rounded-[14px] text-[14px] font-semibold text-white shadow-ink transition-colors disabled:opacity-40",
                          done ? "bg-[#3f9c6d]" : "bg-[var(--ink)]",
                        )}
                      >
                        <AnimatePresence mode="wait" initial={false}>
                          {done ? (
                            <motion.span key="done" className="flex items-center gap-2" initial={{ opacity: 0, scale: 0.6 }} animate={{ opacity: 1, scale: 1 }} transition={{ type: "spring", duration: 0.4, bounce: 0.45 }}>
                              <Check size={18} strokeWidth={2.6} />
                              {editItem ? "Saved" : "Added to board"}
                            </motion.span>
                          ) : (
                            <motion.span key="idle" className="flex items-center gap-2" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.12 }}>
                              {editItem ? <Check size={17} strokeWidth={2.4} /> : <Plus size={17} strokeWidth={2.4} />}
                              {editItem ? "Save changes" : "Add to board"}
                            </motion.span>
                          )}
                        </AnimatePresence>
                      </button>
                    </motion.div>
                  </motion.div>
                </motion.div>
              </Dialog.Content>
            </div>
          </Dialog.Portal>
        )}
      </AnimatePresence>
    </Dialog.Root>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[11px] font-semibold text-[var(--muted)]">{label}</span>
      {children}
    </label>
  );
}
