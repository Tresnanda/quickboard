import { useEffect, useMemo, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Check, FileText, Image as ImageIcon, Layers, Link as LinkIcon, Plus, StickyNote, X, type LucideIcon } from "lucide-react";
import { useItems } from "../lib/items-store";
import { committable, removeFromTray, useTray, type TrayEntry } from "../lib/tray";
import { Combobox } from "./Combobox";
import { addFile, addText, readImageAsDataUrl } from "../lib/ipc";
import { setAppearance } from "../lib/appearance";
import { useToast } from "./Toast";
import { sfx } from "../lib/sfx";
import { cn } from "../lib/utils";
import type { ContentType } from "../lib/types";

const IMG_RE = /\.(png|jpe?g|gif|webp|svg|bmp|tiff?|heic|avif)$/i;
const isImagePath = (p?: string) => !!p && IMG_RE.test(p);

function detectType(e: TrayEntry): ContentType {
  if (e.kind === "file") return isImagePath(e.path) || isImagePath(e.label) ? "image" : "file";
  return e.isUrl ? "link" : "note";
}

// A clean default title — strip extensions, and replace base64-ish blob names
// (long, no spaces — what browser image drags hand over) with "Image N".
function defaultTitle(e: TrayEntry, idx: number, type: ContentType): string {
  const raw = (e.label ?? "").trim();
  const looksRandom = raw.length > 20 && !/\s/.test(raw);
  if (type === "image" && (!raw || looksRandom)) return `Image ${idx + 1}`;
  const base = raw.replace(IMG_RE, "").replace(/\.[a-z0-9]{1,5}$/i, "").trim();
  if (!base) return type === "note" ? "Note" : type === "link" ? "Link" : type === "image" ? `Image ${idx + 1}` : "File";
  return base;
}

const TYPE_META: Record<ContentType, { label: string; icon: LucideIcon }> = {
  note: { label: "Note", icon: StickyNote },
  link: { label: "Link", icon: LinkIcon },
  code: { label: "Code", icon: StickyNote },
  image: { label: "Image", icon: ImageIcon },
  file: { label: "File", icon: FileText },
};

/**
 * Batch "Save to board" — the staged tray items, committed with one Environment +
 * Category for the lot and a per-item, editable title. Opened from the tray's
 * "Save to board" (via the board:commit-tray event) or the nudge. Mixed types are
 * fine: each row carries its own detected type + thumbnail.
 */
export function CommitSheet() {
  const { commitOpen, setCommitOpen, commitIds, commitCategory, items, environments, activeEnvironment, reload } = useItems();
  const tray = useTray();
  const reduce = useReducedMotion();
  const toast = useToast();

  // the tray passes the selected entry ids; empty means "everything staged"
  const pending = useMemo(() => {
    const all = committable(tray);
    return commitIds.length ? all.filter((e) => commitIds.includes(e.id)) : all;
  }, [tray, commitIds]);
  const [environment, setEnvironment] = useState("Personal");
  const [category, setCategory] = useState("");
  const [titles, setTitles] = useState<Record<string, string>>({});
  const [skipped, setSkipped] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  // (re)seed on open from whatever's currently staged
  useEffect(() => {
    if (!commitOpen) return;
    setBusy(false);
    setDone(false);
    setSkipped(new Set());
    setEnvironment(activeEnvironment ?? "Personal");
    setCategory(commitCategory);
    const seed: Record<string, string> = {};
    pending.forEach((e, i) => {
      seed[e.id] = defaultTitle(e, i, detectType(e));
    });
    setTitles(seed);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [commitOpen]);

  // close automatically if the staged list drains out from under us
  useEffect(() => {
    if (commitOpen && pending.length === 0 && !busy) setCommitOpen(false);
  }, [commitOpen, pending.length, busy, setCommitOpen]);

  // categories that already exist in the chosen environment — for suggestions
  const envCategories = useMemo(() => {
    const set = new Set<string>();
    for (const it of items) if (it.environment === environment) set.add(it.category);
    return Array.from(set).sort();
  }, [items, environment]);

  const titleOf = (e: TrayEntry, idx: number) => titles[e.id] ?? defaultTitle(e, idx, detectType(e));
  const active = pending.filter((e) => !skipped.has(e.id));
  const canSubmit =
    active.length > 0 &&
    !!environment.trim() &&
    !!category.trim() &&
    pending.every((e, i) => skipped.has(e.id) || titleOf(e, i).trim() !== "");

  async function submit() {
    if (!canSubmit || busy) return;
    setBusy(true);
    let n = 0;
    let firstErr: string | null = null;
    try {
      for (let i = 0; i < pending.length; i++) {
        const e = pending[i];
        if (skipped.has(e.id)) continue;
        const type = detectType(e);
        const title = titleOf(e, i).trim();
        try {
          if (e.kind === "text") {
            const id = await addText(title, category.trim(), environment.trim(), false, e.value ?? "");
            setAppearance(id, { type });
          } else if (e.kind === "file" && e.path) {
            const id = await addFile(title, category.trim(), environment.trim(), false, e.path);
            setAppearance(id, { type });
          } else {
            continue;
          }
          removeFromTray(e.id);
          n++;
        } catch (err) {
          if (!firstErr) firstErr = err instanceof Error ? err.message : String(err);
        }
      }
      await reload();
      if (n > 0) {
        sfx.save();
        setDone(true);
        toast({ message: `${n} item${n > 1 ? "s" : ""} added to your board`, icon: <Check size={14} strokeWidth={2.6} />, tone: "green" });
        await new Promise((r) => setTimeout(r, 520));
        setCommitOpen(false);
      } else {
        // surface the real failure instead of silently doing nothing
        toast({ message: firstErr ?? "Couldn't add to board", icon: <X size={14} strokeWidth={2.6} />, tone: "rose" });
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog.Root open={commitOpen} onOpenChange={setCommitOpen}>
      <AnimatePresence initial={false}>
        {commitOpen && (
          <Dialog.Portal forceMount>
            <Dialog.Overlay asChild forceMount>
              <motion.div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-[3px]" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }} />
            </Dialog.Overlay>

            <div className="pointer-events-none fixed inset-0 z-50 grid place-items-center p-6">
              <Dialog.Content asChild forceMount onOpenAutoFocus={(e) => e.preventDefault()} aria-describedby={undefined}>
                <motion.div
                  className="pointer-events-auto flex max-h-[88vh] w-[480px] max-w-[calc(100vw-3rem)] flex-col gap-2 overflow-hidden rounded-[var(--r-modal)] border border-[#e2e2e6] bg-[#e9e9ec] p-2 shadow-modal"
                  initial={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.93, y: 12 }}
                  animate={reduce ? { opacity: 1 } : { opacity: 1, scale: 1, y: 0 }}
                  exit={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.97, y: 6 }}
                  transition={reduce ? { duration: 0.2 } : { type: "spring", duration: 0.5, bounce: 0.16 }}
                >
                  {/* header */}
                  <div className="flex shrink-0 items-center gap-2.5 px-2.5 pb-0.5 pt-1.5">
                    <span className="grid h-8 w-8 place-items-center rounded-[10px] bg-[var(--ink)] text-white">
                      <Layers size={16} strokeWidth={2} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <Dialog.Title className="text-[15px] font-extrabold tracking-[-0.02em] text-[var(--ink)]">Save to board</Dialog.Title>
                      <div className="text-[11.5px] text-[var(--faint)]">{active.length} of {pending.length} staged {pending.length === 1 ? "item" : "items"}</div>
                    </div>
                    <Dialog.Close className="qb-press grid h-7 w-7 place-items-center rounded-full text-[var(--faint)] transition-colors hover:bg-black/[0.06] hover:text-[var(--ink)]" aria-label="Close">
                      <X size={15} />
                    </Dialog.Close>
                  </div>

                  {/* shared destination — one env + category for the whole batch */}
                  <div className="shrink-0 rounded-[var(--r-inner)] border border-[#ededf0] bg-white p-3 shadow-[0_1px_2px_rgba(0,0,0,0.03)]">
                    <div className="grid grid-cols-2 gap-3">
                      <Field label="Environment">
                        <Combobox value={environment} onChange={setEnvironment} options={environments} placeholder="Personal" />
                      </Field>
                      <Field label="Category">
                        <Combobox value={category} onChange={setCategory} options={envCategories} placeholder="Identity" />
                      </Field>
                    </div>
                  </div>

                  {/* per-item rows — title + type, skip any you don't want */}
                  <div className="qb-scroll min-h-0 flex-1 space-y-1.5 overflow-y-auto rounded-[var(--r-inner)] border border-[#ededf0] bg-white p-1.5 shadow-[0_1px_2px_rgba(0,0,0,0.03)]">
                    <AnimatePresence initial={false} mode="popLayout">
                      {pending.map((e, i) => (
                        <CommitRow
                          key={e.id}
                          entry={e}
                          type={detectType(e)}
                          title={titleOf(e, i)}
                          skipped={skipped.has(e.id)}
                          onTitle={(v) => setTitles((t) => ({ ...t, [e.id]: v }))}
                          onToggleSkip={() =>
                            setSkipped((prev) => {
                              const next = new Set(prev);
                              if (next.has(e.id)) next.delete(e.id);
                              else next.add(e.id);
                              return next;
                            })
                          }
                        />
                      ))}
                    </AnimatePresence>
                  </div>

                  {/* commit */}
                  <button
                    type="button"
                    disabled={!canSubmit || busy}
                    onClick={() => void submit()}
                    className={cn(
                      "qb-press flex h-[44px] shrink-0 items-center justify-center gap-2 rounded-[14px] text-[13.5px] font-semibold text-white shadow-ink transition-colors disabled:opacity-40",
                      done ? "bg-[#3f9c6d]" : "bg-[var(--ink)]",
                    )}
                  >
                    <AnimatePresence mode="wait" initial={false}>
                      {done ? (
                        <motion.span key="done" className="flex items-center gap-2" initial={{ opacity: 0, scale: 0.6 }} animate={{ opacity: 1, scale: 1 }} transition={{ type: "spring", duration: 0.4, bounce: 0.45 }}>
                          <Check size={17} strokeWidth={2.6} /> Added to board
                        </motion.span>
                      ) : (
                        <motion.span key="idle" className="flex items-center gap-2" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.12 }}>
                          <Plus size={16} strokeWidth={2.4} /> {busy ? "Saving…" : `Save ${active.length || ""} to board`.trim()}
                        </motion.span>
                      )}
                    </AnimatePresence>
                  </button>
                </motion.div>
              </Dialog.Content>
            </div>
          </Dialog.Portal>
        )}
      </AnimatePresence>
    </Dialog.Root>
  );
}

function CommitRow({
  entry,
  type,
  title,
  skipped,
  onTitle,
  onToggleSkip,
}: {
  entry: TrayEntry;
  type: ContentType;
  title: string;
  skipped: boolean;
  onTitle: (v: string) => void;
  onToggleSkip: () => void;
}) {
  const [thumb, setThumb] = useState<string | null>(null);
  useEffect(() => {
    let on = true;
    if (type === "image" && entry.path) {
      void readImageAsDataUrl(entry.path)
        .then((d) => on && setThumb(d))
        .catch(() => {});
    }
    return () => {
      on = false;
    };
  }, [entry.path, type]);

  const meta = TYPE_META[type];
  const Icon = meta.icon;

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: skipped ? 0.45 : 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.96, transition: { duration: 0.14 } }}
      transition={{ type: "spring", stiffness: 520, damping: 38 }}
      className="flex items-center gap-2.5 rounded-[11px] border border-[#f0f0f3] bg-[#fafafc] py-1.5 pl-1.5 pr-2"
    >
      <span className="grid h-9 w-9 shrink-0 place-items-center overflow-hidden rounded-[9px] bg-white text-[var(--muted)] ring-1 ring-inset ring-black/[0.05]">
        {thumb ? <img src={thumb} alt="" className="h-full w-full object-cover" /> : <Icon size={16} strokeWidth={1.9} />}
      </span>
      <input
        value={title}
        onChange={(ev) => onTitle(ev.target.value)}
        disabled={skipped}
        placeholder={meta.label}
        className="min-w-0 flex-1 bg-transparent text-[13px] font-semibold tracking-[-0.01em] text-[var(--ink)] placeholder:font-medium placeholder:text-[var(--fainter)] focus:outline-none disabled:line-through"
      />
      <span className="shrink-0 rounded-full bg-black/[0.05] px-2 py-0.5 text-[10px] font-bold text-[var(--muted)]">{meta.label}</span>
      <button
        type="button"
        onClick={onToggleSkip}
        aria-label={skipped ? "Include" : "Skip"}
        title={skipped ? "Include" : "Skip"}
        className={cn(
          "qb-press grid h-6 w-6 shrink-0 place-items-center rounded-[7px] transition-colors",
          skipped ? "bg-[var(--ink)] text-white" : "text-[var(--faint)] hover:bg-black/[0.06] hover:text-[#b4424f]",
        )}
      >
        {skipped ? <Plus size={13} strokeWidth={2.6} /> : <X size={13} strokeWidth={2.4} />}
      </button>
    </motion.div>
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
