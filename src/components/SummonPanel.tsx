import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { Check, ChevronLeft, CornerDownLeft, Download, Plus, Search } from "lucide-react";
import { useItems } from "../lib/items-store";
import { addFile, addText, getImageDataUrl, getTextValue } from "../lib/ipc";
import { addToTray } from "../lib/tray";
import { isDraggingOut } from "../lib/drag";
import { GRAB_TRANSITION, RECOIL_TRANSITION, useDragOut } from "../lib/use-drag-out";
import { getAppearance, setAppearance } from "../lib/appearance";
import { getSettings } from "../lib/settings";
import { sfx } from "../lib/sfx";
import { ICONS, defaultIcon } from "../lib/icons";
import { contentType } from "../lib/content-type";
import { TINTS, itemTint } from "../lib/tints";
import { cn } from "../lib/utils";
import type { Item } from "../lib/types";

const MAX = 8;
// Snappy: the selection cursor glides fast; everything else is instant so typing
// never waits on motion (emil: a panel used this often should not animate its list).
const SEL = { type: "spring", stiffness: 1100, damping: 60, mass: 0.5 } as const;
const POP = { type: "spring", stiffness: 700, damping: 26 } as const;

/**
 * The always-available "summon anywhere" panel. Retrieve (↵ pastes to cursor) +
 * capture (⌘↵ saves, drop a file). Motion + craft per emil / motion-design /
 * make-interfaces-feel-better: concentric radii, layered tinted shadows, optical
 * icon alignment, a layoutId selection cursor, blur-masked spring entrance.
 */
export function SummonPanel() {
  const { items, reload, environments } = useItems();
  const [q, setQ] = useState("");
  const [idx, setIdx] = useState(0);
  const [busy, setBusy] = useState(false);
  const [flash, setFlash] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [gen, setGen] = useState(0);
  const [scopeEnv, setScopeEnv] = useState<string | null>(null);
  const [scopeCat, setScopeCat] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  // hover should only change the selection after a *real* pointer move — not when the panel
  // opens under a stationary cursor, and not when rows scroll under it during keyboard nav
  const moved = useRef(false);
  const lastPos = useRef({ x: -1, y: -1 });

  useEffect(() => {
    const focus = () => requestAnimationFrame(() => inputRef.current?.focus());
    focus();
    const un = listen("summon:open", () => {
      void reload();
      setQ("");
      setIdx(0);
      moved.current = false;
      lastPos.current = { x: -1, y: -1 };
      setBusy(false);
      setFlash(null);
      setGen((g) => g + 1);
      setScopeEnv(null);
      setScopeCat(null);
      sfx.open();
      focus();
    });
    return () => {
      void un.then((f) => f());
    };
  }, [reload]);

  // Spotlight-style: dismiss when focus leaves the panel (click away / switch app).
  useEffect(() => {
    const onBlur = () => void invoke("summon_hide");
    window.addEventListener("blur", onBlur);
    return () => window.removeEventListener("blur", onBlur);
  }, []);

  useEffect(() => {
    const un = getCurrentWebview().onDragDropEvent((e) => {
      if (isDraggingOut()) {
        setDragging(false); // our own drag-out passing over the panel — never show the overlay
        return;
      }
      if (e.payload.type === "over") setDragging(true);
      else if (e.payload.type === "leave") setDragging(false);
      else if (e.payload.type === "drop") {
        setDragging(false);
        void saveFiles(e.payload.paths);
      }
    });
    return () => {
      void un.then((f) => f());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function showFlash(msg: string) {
    setFlash(msg);
    window.setTimeout(() => setFlash(null), 1500);
  }

  // visual scope: a clicked environment, then a category within it
  const scoped = useMemo(() => {
    let pool = items;
    if (scopeEnv) pool = pool.filter((i) => i.environment === scopeEnv);
    if (scopeCat) pool = pool.filter((i) => i.category === scopeCat);
    return pool;
  }, [items, scopeEnv, scopeCat]);

  const categories = useMemo(() => {
    const set = new Set<string>();
    for (const i of items) if (!scopeEnv || i.environment === scopeEnv) set.add(i.category);
    return [...set].sort((a, b) => a.localeCompare(b));
  }, [items, scopeEnv]);

  const results = useMemo(() => {
    const s = q.trim().toLowerCase();
    const list = s
      ? scoped.filter((i) => i.label.toLowerCase().includes(s) || i.category.toLowerCase().includes(s) || i.environment.toLowerCase().includes(s))
      : [...scoped].sort((a, b) => (b.last_used_at || b.created_at) - (a.last_used_at || a.created_at));
    return list.slice(0, MAX);
  }, [scoped, q]);

  useEffect(() => {
    if (idx >= results.length) setIdx(0);
  }, [results, idx]);

  function move(dir: 1 | -1) {
    if (!results.length) return;
    moved.current = false; // keyboard takes over — freeze hover until the next real move
    setIdx((i) => (i + dir + results.length) % results.length); // wrap-around
    sfx.move();
  }

  function jumpTo(i: number) {
    if (!results.length) return;
    moved.current = false;
    setIdx(Math.max(0, Math.min(i, results.length - 1)));
    sfx.move();
  }

  function jumpBy(n: number) {
    if (!results.length) return;
    moved.current = false;
    setIdx((i) => Math.max(0, Math.min(i + n, results.length - 1)));
    sfx.move();
  }

  async function copyHighlighted() {
    const it = results[idx];
    if (!it || busy || it.kind === "File") return;
    setBusy(true);
    try {
      const value = await getTextValue(it.id);
      await navigator.clipboard.writeText(value);
      sfx.move();
      showFlash("Copied");
    } catch {
      showFlash("Couldn't copy");
    } finally {
      setBusy(false);
    }
  }

  async function pick(i: number) {
    const it = results[i];
    if (!it || busy) return;
    if (it.kind === "File") {
      // can't paste a file as text — stage it to the tray to drag out
      addToTray({ kind: "item", itemId: it.id, label: it.label });
      void invoke("show_tray");
      sfx.move();
      showFlash("Added to tray");
      return;
    }
    setBusy(true);
    sfx.paste();
    try {
      const value = await getTextValue(it.id);
      await navigator.clipboard.writeText(value);
      await invoke("summon_paste");
    } catch {
      await invoke("summon_hide");
    }
  }

  async function save() {
    const value = q.trim();
    if (!value || busy) return;
    setBusy(true);
    try {
      const env = getSettings().defaultEnvironment ?? "Personal";
      const isUrl = /^https?:\/\/\S+$/i.test(value);
      const label = value.split("\n")[0].slice(0, 50) || "Note";
      const id = await addText(label, "Uncategorized", env, false, value);
      setAppearance(id, { type: isUrl ? "link" : "note" });
      await reload();
      setQ("");
      setIdx(0);
      sfx.save();
      showFlash("Saved to board");
    } catch {
      showFlash("Couldn't save");
    } finally {
      setBusy(false);
    }
  }

  async function saveFiles(paths: string[]) {
    // Ignore our own drag-out temp files dropped back onto the panel (they live in
    // the quickboard-drag temp dir) — they're already on the board.
    const files = paths.filter((p) => !p.includes("quickboard-drag"));
    if (!files.length || busy) return;
    setBusy(true);
    try {
      const env = getSettings().defaultEnvironment ?? "Personal";
      for (const p of files) {
        const name = p.split(/[\\/]/).pop() || "File";
        try {
          await addFile(name, "Uncategorized", env, false, p);
        } catch {
          /* skip */
        }
      }
      await reload();
      sfx.save();
      showFlash(files.length === 1 ? "File saved to board" : `${files.length} files saved`);
    } finally {
      setBusy(false);
    }
  }

  // stage to the floating tray: the highlighted result, else the typed text
  function stage() {
    const it = results[idx];
    if (it) {
      addToTray({ kind: "item", itemId: it.id, label: it.label });
      void invoke("show_tray");
      sfx.move();
      showFlash("Added to tray");
    } else if (q.trim()) {
      const value = q.trim();
      addToTray({ kind: "text", value, label: value.split("\n")[0].slice(0, 40) || "Note", isUrl: /^https?:\/\/\S+$/i.test(value) });
      void invoke("show_tray");
      setQ("");
      setIdx(0);
      sfx.move();
      showFlash("Added to tray");
    }
  }

  function onKey(e: React.KeyboardEvent) {
    const k = e.key;
    const last = results.length - 1;
    if (k === "Escape") {
      void invoke("summon_hide");
    } else if (k === "Tab") {
      e.preventDefault();
      stage();
    } else if ((e.metaKey || e.ctrlKey) && k === "Enter") {
      e.preventDefault();
      void save();
    } else if ((e.metaKey || e.ctrlKey) && (k === "c" || k === "C")) {
      e.preventDefault();
      void copyHighlighted();
    } else if (k === "ArrowDown") {
      e.preventDefault();
      if (e.metaKey) jumpTo(last);
      else move(1);
    } else if (k === "ArrowUp") {
      e.preventDefault();
      if (e.metaKey) jumpTo(0);
      else move(-1);
    } else if (e.ctrlKey && (k === "n" || k === "N")) {
      e.preventDefault();
      move(1);
    } else if (e.ctrlKey && (k === "p" || k === "P")) {
      e.preventDefault();
      move(-1);
    } else if (k === "Home") {
      e.preventDefault();
      jumpTo(0);
    } else if (k === "End") {
      e.preventDefault();
      jumpTo(last);
    } else if (k === "PageDown") {
      e.preventDefault();
      jumpBy(5);
    } else if (k === "PageUp") {
      e.preventDefault();
      jumpBy(-5);
    } else if (k === "Enter") {
      e.preventDefault();
      if (results.length) void pick(idx);
      else void save();
    }
  }

  const canSave = !!q.trim();
  const sectionLabel = q.trim() ? `${results.length} result${results.length === 1 ? "" : "s"}` : "Recent";

  return (
    <div
      className="flex h-screen w-screen items-start justify-center p-10 antialiased"
      onPointerMove={(e) => {
        // the panel opening under a stationary cursor fires one synthetic move — the first
        // event after open only calibrates the baseline, it doesn't count as real intent
        if (lastPos.current.x === -1) {
          lastPos.current = { x: e.clientX, y: e.clientY };
          return;
        }
        if (e.clientX !== lastPos.current.x || e.clientY !== lastPos.current.y) {
          lastPos.current = { x: e.clientX, y: e.clientY };
          moved.current = true;
        }
      }}
    >
      <motion.div
        key={gen}
        initial={{ opacity: 0, scale: 0.985, y: -4 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.13, ease: [0.23, 1, 0.32, 1] }}
        style={{ transformOrigin: "top center" }}
        className="relative flex max-h-full w-full flex-col overflow-hidden rounded-[22px] bg-[#f7f7f6] shadow-[inset_0_1px_0_rgba(255,255,255,0.7),0_12px_40px_-14px_rgba(0,0,0,0.42),0_2px_8px_-3px_rgba(0,0,0,0.14)] ring-1 ring-black/[0.08]"
      >
        {/* search */}
        <div className="flex shrink-0 items-center gap-3 px-[18px]">
          <Search size={18} strokeWidth={2.1} className="shrink-0 text-[var(--faint)]" />
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setIdx(0);
              moved.current = false;
            }}
            onKeyDown={onKey}
            placeholder="Summon, or paste to save…"
            className="h-[58px] flex-1 bg-transparent text-[16px] tracking-[-0.01em] text-[var(--ink)] outline-none placeholder:text-[var(--fainter)]"
            autoFocus
            spellCheck={false}
            autoComplete="off"
          />
          <Kbd>esc</Kbd>
        </div>
        <div className="mx-[14px] h-px bg-gradient-to-r from-transparent via-black/[0.07] to-transparent" />

        {/* scope chips — click an environment, then a category */}
        <div className="qb-scroll flex shrink-0 items-center gap-1.5 overflow-x-auto px-[14px] pb-0.5 pt-2">
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={scopeEnv ?? "root"}
              initial={{ opacity: 0, x: 8 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -8 }}
              transition={{ duration: 0.16, ease: [0.23, 1, 0.32, 1] }}
              className="flex items-center gap-1.5"
            >
              {!scopeEnv ? (
                <>
                  <Chip active onClick={() => undefined}>All</Chip>
                  {environments.map((env) => (
                    <Chip key={env} onClick={() => { setScopeEnv(env); setScopeCat(null); setIdx(0); }}>
                      {env}
                    </Chip>
                  ))}
                </>
              ) : (
                <>
                  <motion.button
                    type="button"
                    whileTap={{ scale: 0.93 }}
                    onClick={() => { setScopeEnv(null); setScopeCat(null); setIdx(0); }}
                    className="flex shrink-0 items-center gap-0.5 rounded-full bg-[var(--ink)] py-1 pl-1.5 pr-2.5 text-[11.5px] font-semibold text-white"
                  >
                    <ChevronLeft size={13} /> {scopeEnv}
                  </motion.button>
                  <Chip active={!scopeCat} onClick={() => { setScopeCat(null); setIdx(0); }}>All</Chip>
                  {categories.map((cat) => (
                    <Chip key={cat} active={scopeCat === cat} onClick={() => { setScopeCat(cat); setIdx(0); }}>
                      {cat}
                    </Chip>
                  ))}
                </>
              )}
            </motion.div>
          </AnimatePresence>
        </div>

        {/* section label */}
        <div className="px-[18px] pb-0.5 pt-2.5 text-[10.5px] font-bold uppercase tracking-[0.07em] text-[var(--fainter)]">{canSave && results.length === 0 ? "New" : sectionLabel}</div>

        {/* results */}
        <div className="qb-scroll min-h-0 flex-1 overflow-auto px-2 pb-2">
          {results.length === 0 ? (
            <motion.button
              type="button"
              onClick={() => void save()}
              disabled={!canSave}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              whileTap={canSave ? { scale: 0.985 } : undefined}
              className={cn("flex w-full items-center gap-3 rounded-[14px] px-2.5 py-3 text-left transition-[background,box-shadow]", canSave ? "bg-white shadow-[0_1px_2px_rgba(0,0,0,0.04),0_10px_26px_-12px_rgba(0,0,0,0.22)] ring-1 ring-black/[0.05]" : "opacity-55")}
            >
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-[10px] bg-[var(--ink)] text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.18)]">
                <Plus size={16} strokeWidth={2.4} />
              </span>
              <span className="min-w-0 flex-1 truncate text-[14px] font-semibold tracking-[-0.01em] text-[var(--ink)]">{canSave ? `Save “${q.trim()}” to board` : "Type or paste something to save"}</span>
              {canSave && <Kbd>⌘↵</Kbd>}
            </motion.button>
          ) : (
            results.map((it, i) => <ResultRow key={it.id} item={it} active={i === idx} onClick={() => void pick(i)} onHover={() => { if (moved.current) setIdx(i); }} />)
          )}
        </div>

        {/* footer */}
        <div className="flex shrink-0 items-center gap-2.5 border-t border-black/[0.05] bg-black/[0.012] px-[18px] py-2.5 text-[11px] text-[var(--faint)]">
          <AnimatePresence mode="wait" initial={false}>
            {flash ? (
              <motion.span
                key="flash"
                initial={{ opacity: 0, scale: 0.8, y: 4 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={{ type: "spring", stiffness: 520, damping: 24 }}
                className="flex items-center gap-1.5 font-semibold text-[#3f7a57]"
              >
                <motion.span initial={{ scale: 0, rotate: -30 }} animate={{ scale: 1, rotate: 0 }} transition={{ type: "spring", stiffness: 600, damping: 18, delay: 0.05 }} className="grid h-[16px] w-[16px] place-items-center rounded-full bg-[#3f7a57] text-white">
                  <Check size={10} strokeWidth={3} />
                </motion.span>
                {flash}
              </motion.span>
            ) : (
              <motion.div key="hints" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex items-center gap-2.5">
                <span className="flex items-center gap-1.5"><Kbd>↵</Kbd> paste</span>
                <Dot />
                <span className="flex items-center gap-1.5"><Kbd>⌘↵</Kbd> save</span>
                <Dot />
                <span className="flex items-center gap-1.5"><Kbd>⇥</Kbd> tray</span>
                <Dot />
                <span className="flex items-center gap-1.5"><Download size={11} strokeWidth={2.2} /> drop</span>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* drop overlay */}
        <AnimatePresence>
          {dragging && (
            <motion.div
              initial={{ opacity: 0, backdropFilter: "blur(0px)" }}
              animate={{ opacity: 1, backdropFilter: "blur(5px)" }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 z-20 grid place-items-center rounded-[22px] border-2 border-dashed border-[var(--ink)]/35 bg-[#fcfcfb]/70"
            >
              <motion.div initial={{ scale: 0.85, y: 6 }} animate={{ scale: 1, y: 0 }} transition={POP} className="flex flex-col items-center gap-2 text-[var(--ink)]">
                <span className="grid h-12 w-12 place-items-center rounded-2xl bg-[var(--ink)] text-white shadow-lg">
                  <Download size={22} strokeWidth={2.2} />
                </span>
                <span className="text-[14px] font-bold">Drop to save to board</span>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  );
}

function ResultRow({ item, active, onClick, onHover }: { item: Item; active: boolean; onClick: () => void; onHover: () => void }) {
  const type = contentType(item);
  const Icon = ICONS[getAppearance(item.id).icon ?? defaultIcon(type, item.confidential)];
  const t = TINTS[itemTint(item)];
  const isFile = item.kind === "File";
  const isImage = type === "image";

  // preview an image so it's recognisable at a glance (skip confidential — would prompt Touch ID)
  const [thumb, setThumb] = useState<string | null>(null);
  useEffect(() => {
    if (!(isImage && !item.confidential)) {
      setThumb(null);
      return;
    }
    let alive = true;
    void getImageDataUrl(item.id).then((u) => alive && setThumb(u)).catch(() => {});
    return () => {
      alive = false;
    };
  }, [item.id, isImage, item.confidential]);

  // when a drag-out ends (dropped anywhere, or cancelled), dismiss the panel so it
  // gets out of the way and can't re-catch the file as a "new" drop
  const { grabbing, begin } = useDragOut(item.id, isImage, thumb, () => void invoke("summon_hide"));

  // keep the highlighted row visible as you arrow through the list
  const rowRef = useRef<HTMLDivElement>(null);
  const thumbRef = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (active) rowRef.current?.scrollIntoView({ block: "nearest" });
  }, [active]);

  return (
    <motion.div
      ref={rowRef}
      onPointerEnter={onHover}
      onClick={onClick}
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
      style={{ position: "relative", zIndex: grabbing ? 30 : undefined, cursor: isFile ? (grabbing ? "grabbing" : "grab") : "pointer" }}
      className="relative flex select-none items-center gap-3 rounded-[14px] px-2.5 py-2.5"
    >
      {active && <motion.div layoutId="sel-bg" transition={SEL} className="absolute inset-0 rounded-[14px] bg-white shadow-[0_1px_2px_rgba(0,0,0,0.04),0_10px_26px_-12px_rgba(0,0,0,0.24)] ring-1 ring-black/[0.05]" />}
      <motion.span
        ref={thumbRef}
        animate={{ scale: grabbing ? [1, 0.84, 1] : active ? 1.08 : 1 }}
        transition={grabbing ? RECOIL_TRANSITION : POP}
        className={cn("relative z-10 grid h-9 w-9 shrink-0 place-items-center overflow-hidden", thumb && "rounded-[10px] shadow-[inset_0_1px_0_rgba(255,255,255,0.5),0_1px_2px_rgba(0,0,0,0.05)] ring-1 ring-inset ring-black/[0.05]")}
        style={thumb ? { background: t.tile } : { color: t.tileInk }}
      >
        {thumb ? <img src={thumb} alt="" draggable={false} className="h-full w-full object-cover" /> : <Icon size={19} strokeWidth={1.9} />}
      </motion.span>
      <span className="relative z-10 min-w-0 flex-1">
        <span className="block truncate text-[14px] font-semibold tracking-[-0.01em] text-[var(--ink)]">{item.label}</span>
        <span className="mt-px block truncate text-[11.5px] text-[var(--faint)]">{item.environment} · {item.category}</span>
      </span>
      <AnimatePresence>
        {active && (
          <motion.span
            key="hint"
            initial={{ opacity: 0, x: 8 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 8 }}
            transition={{ type: "spring", stiffness: 500, damping: 30 }}
            className="relative z-10 flex shrink-0 items-center gap-1.5 pr-1 text-[11px] font-medium text-[var(--muted)]"
          >
            {isFile ? "drag out" : (
              <>
                <CornerDownLeft size={12} /> paste
              </>
            )}
          </motion.span>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

function Kbd({ children }: { children: React.ReactNode }) {
  return <kbd className="grid h-[18px] min-w-[18px] place-items-center rounded-[6px] border border-black/[0.07] bg-white px-1 text-[10.5px] font-semibold text-[var(--muted)] shadow-[0_1px_0_rgba(0,0,0,0.04)]">{children}</kbd>;
}

function Dot() {
  return <span className="h-[3px] w-[3px] rounded-full bg-[var(--fainter)]" />;
}

function Chip({ active, onClick, children }: { active?: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <motion.button
      type="button"
      onClick={onClick}
      whileTap={{ scale: 0.93 }}
      className={cn("relative shrink-0 rounded-full px-2.5 py-1 text-[11.5px] font-semibold", active ? "text-white" : "text-[var(--muted)] hover:text-[var(--ink)]")}
    >
      {active ? (
        <motion.span layoutId="scope-pill" transition={{ type: "spring", stiffness: 560, damping: 36 }} className="absolute inset-0 rounded-full bg-[var(--ink)]" />
      ) : (
        <span className="absolute inset-0 rounded-full bg-black/[0.05]" />
      )}
      <span className="relative z-10">{children}</span>
    </motion.button>
  );
}
