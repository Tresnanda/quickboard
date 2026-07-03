import { lazy, Suspense, useEffect, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Check, Trash2, X } from "lucide-react";
import { useItems } from "../lib/items-store";
import { addEnvironment, removeEnvironment } from "../lib/environments";
import { clearAppearance, getAppearance, setAppearance } from "../lib/appearance";
import { deleteEnvironmentItems, renameEnvironmentItems } from "../lib/ipc";
import { coverColors, coverGradient } from "../lib/cover";
// lazy so three.js stays out of app startup — loads on first modal open
const ShaderHeader = lazy(() => import("./ShaderHeader"));
import { ICONS, type IconName } from "../lib/icons";
import { TINTS, TINT_NAMES, type TintName } from "../lib/tints";
import { useToast } from "./Toast";
import { useConfirm } from "./ConfirmDialog";
import { cn } from "../lib/utils";

const ENV_ICONS: IconName[] = ["briefcase", "user", "heart", "star", "globe", "code", "terminal", "folder", "shield", "database", "card", "bookmark"];

export function NewEnvironmentModal({ open, edit, onClose }: { open: boolean; edit?: string | null; onClose: () => void }) {
  const reduce = useReducedMotion();
  const { items, environments, activeEnvironment, setActiveEnvironment, reload } = useItems();
  const toast = useToast();
  const confirm = useConfirm();
  const [name, setName] = useState("");
  const [icon, setIcon] = useState<IconName>("briefcase");
  const [tint, setTint] = useState<TintName>("violet");
  const [busy, setBusy] = useState(false);

  const editing = !!edit;

  useEffect(() => {
    if (!open) return;
    if (edit) {
      const a = getAppearance(`env:${edit}`);
      setName(edit);
      setIcon((a.icon as IconName) ?? "briefcase");
      setTint((a.tint as TintName) ?? "violet");
    } else {
      setName("");
      setIcon("briefcase");
      setTint("violet");
    }
  }, [open, edit]);

  const trimmed = name.trim();
  const duplicate = environments.some((e) => e.toLowerCase() === trimmed.toLowerCase() && e !== edit);
  const canSave = !!trimmed && !duplicate;
  const Icon = ICONS[icon];
  const sgColors = coverColors("environment", tint);

  async function save() {
    if (!canSave || busy) return;
    setBusy(true);
    try {
      if (editing && edit) {
        if (trimmed !== edit) {
          await renameEnvironmentItems(edit, trimmed); // move items old -> new
          removeEnvironment(edit);
          addEnvironment(trimmed);
          clearAppearance(`env:${edit}`);
          if (activeEnvironment === edit) setActiveEnvironment(trimmed);
        }
        setAppearance(`env:${trimmed}`, { icon, tint });
        await reload();
        toast({ message: `“${trimmed}” updated`, icon: <Check size={14} strokeWidth={2.6} />, tone: "green" });
      } else {
        addEnvironment(trimmed);
        setAppearance(`env:${trimmed}`, { icon, tint });
        setActiveEnvironment(trimmed);
        toast({ message: `“${trimmed}” environment created`, icon: <Check size={14} strokeWidth={2.6} />, tone: "green" });
      }
      onClose();
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!edit || busy) return;
    const count = items.filter((i) => i.environment === edit).length;
    const others = environments.filter((e) => e !== edit);
    const target = others.includes("Personal") ? "Personal" : others[0] ?? "Personal";
    const msg = count > 0 ? `Its ${count} item${count === 1 ? "" : "s"} will move to “${target}”.` : "This environment is empty.";
    if (!(await confirm({ title: `Delete “${edit}”?`, message: msg, confirmLabel: "Delete", tone: "danger" }))) return;
    setBusy(true);
    try {
      await deleteEnvironmentItems(edit, target);
      removeEnvironment(edit);
      clearAppearance(`env:${edit}`);
      if (activeEnvironment === edit) setActiveEnvironment(null);
      await reload();
      toast({ message: `“${edit}” deleted`, icon: <Trash2 size={14} strokeWidth={2.2} />, tone: "rose" });
      onClose();
    } finally {
      setBusy(false);
    }
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
                  className="pointer-events-auto max-h-[90vh] w-[400px] max-w-[calc(100vw-3rem)] overflow-y-auto rounded-[var(--r-modal)] bg-white p-2 shadow-modal"
                  initial={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.93, y: 12 }}
                  animate={reduce ? { opacity: 1 } : { opacity: 1, scale: 1, y: 0 }}
                  exit={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.97, y: 6 }}
                  transition={reduce ? { duration: 0.2 } : { type: "spring", duration: 0.45, bounce: 0.16 }}
                >
                  <Dialog.Title className="sr-only">{editing ? "Edit environment" : "New environment"}</Dialog.Title>

                  {/* live ShaderGradient header — same as New Item */}
                  <div className="relative h-[150px] shrink-0 overflow-hidden rounded-[var(--r-inner)]" style={{ background: coverGradient("environment", tint) }}>
                    <Suspense fallback={null}>
                      <ShaderHeader color1={sgColors[0]} color2={sgColors[1]} color3={sgColors[2]} />
                    </Suspense>
                    <div className="pointer-events-none absolute inset-x-0 bottom-0 h-2/3" style={{ background: "linear-gradient(to top, rgba(255,255,255,0.5), rgba(255,255,255,0.12) 46%, transparent 78%)" }} />
                    <Dialog.Close className="qb-press absolute right-3 top-3 z-10 grid h-7 w-7 place-items-center rounded-full bg-white/70 text-[#52525b] backdrop-blur-sm" aria-label="Close">
                      <X size={15} />
                    </Dialog.Close>
                    <div className="absolute inset-x-0 bottom-0 flex items-end gap-3 p-4">
                      <motion.div
                        key={icon}
                        className="grid h-[46px] w-[46px] shrink-0 place-items-center rounded-[14px] bg-white/80 backdrop-blur-md"
                        style={{ color: TINTS[tint].tileInk, boxShadow: "0 8px 22px -8px rgba(0,0,0,.28), inset 0 1px 0 rgba(255,255,255,.85)" }}
                        initial={reduce ? false : { scale: 0.4, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        transition={reduce ? { duration: 0 } : { type: "spring", duration: 0.55, bounce: 0.45 }}
                      >
                        <Icon size={22} strokeWidth={1.9} />
                      </motion.div>
                      <div className="min-w-0 flex-1 pb-0.5">
                        <div className="truncate text-[17px] font-extrabold tracking-[-0.02em]" style={{ color: trimmed ? "#28282d" : "rgba(40,40,48,0.42)" }}>
                          {trimmed || "Name your environment"}
                        </div>
                        <div className="mt-0.5 truncate text-[12px]" style={{ color: "rgba(38,38,46,0.6)" }}>
                          {editing ? "Rename, recolor, or remove it" : "A workspace to group your items"}
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-4 px-3 pb-3 pt-4">
                    <label className="block">
                      <span className="mb-1.5 block text-[11px] font-semibold text-[var(--muted)]">Name</span>
                      <input
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && void save()}
                        className="qb-input"
                        placeholder="Work, Personal, Side project…"
                        autoFocus
                      />
                      {duplicate && <span className="mt-1 block text-[11px] text-[#b4424f]">That environment already exists.</span>}
                    </label>

                    <div>
                      <div className="mb-2 text-[11px] font-semibold text-[var(--muted)]">Icon</div>
                      <div className="flex flex-wrap gap-1.5">
                        {ENV_ICONS.map((nm) => {
                          const I = ICONS[nm];
                          const on = icon === nm;
                          return (
                            <button
                              key={nm}
                              type="button"
                              onClick={() => setIcon(nm)}
                              aria-label={nm}
                              className={cn(
                                "qb-press grid h-[34px] w-[34px] place-items-center rounded-[10px] border",
                                on ? "border-transparent bg-[var(--ink)] text-white" : "border-[var(--hair)] bg-white text-[var(--muted)] hover:bg-[#fafafc]",
                              )}
                            >
                              <I size={17} strokeWidth={1.85} />
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    <div>
                      <div className="mb-2 text-[11px] font-semibold text-[var(--muted)]">Color</div>
                      <div className="flex flex-wrap gap-2">
                        {TINT_NAMES.map((nm) => {
                          const t = TINTS[nm];
                          const on = tint === nm;
                          return (
                            <button
                              key={nm}
                              type="button"
                              onClick={() => setTint(nm)}
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

                    <button
                      type="button"
                      onClick={() => void save()}
                      disabled={!canSave || busy}
                      className="qb-press flex h-[42px] w-full items-center justify-center gap-2 rounded-[12px] bg-[var(--ink)] text-[13.5px] font-semibold text-white shadow-ink disabled:opacity-40"
                    >
                      {editing ? "Save changes" : "Create environment"}
                    </button>

                    {editing && (
                      <button
                        type="button"
                        onClick={() => void remove()}
                        disabled={busy}
                        className="qb-press flex h-[38px] w-full items-center justify-center gap-2 rounded-[12px] text-[12.5px] font-semibold text-[#b4424f] transition-colors hover:bg-[#b4424f]/[0.07] disabled:opacity-40"
                      >
                        <Trash2 size={15} strokeWidth={2.1} /> Delete environment
                      </button>
                    )}
                  </div>
                </motion.div>
              </Dialog.Content>
            </div>
          </Dialog.Portal>
        )}
      </AnimatePresence>
    </Dialog.Root>
  );
}
