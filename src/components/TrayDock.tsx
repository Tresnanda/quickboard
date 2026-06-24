import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import { Bookmark, Check, CheckCheck, ChevronDown, ClipboardList, CornerDownLeft, Download, FileText, FolderInput, Image as ImageIcon, Inbox, Layers, Link2, Lock, Pencil, Plus, StickyNote, Trash2, X, type LucideIcon } from "lucide-react";
import { useItems } from "../lib/items-store";
import { fileToTemp, getTextValue, readImageAsDataUrl, stageBlobFile } from "../lib/ipc";
import { dragMixedOut, dragOutItem, dragPathsOut, dragTextOut, isDraggingOut } from "../lib/drag";
import { addLane, addToTray, clearTray, committable, moveToLane, removeFromTray, removeLane, renameLane, useLanes, useTray, type TrayEntry } from "../lib/tray";
import { clearClipboard, removeClip, useClipboard, type ClipEntry } from "../lib/clipboard";
import { getAppearance } from "../lib/appearance";
import { setSetting, useSettings } from "../lib/settings";
import { relativeTime } from "./ItemCard";
import { sfx } from "../lib/sfx";
import { ICONS, defaultIcon } from "../lib/icons";
import { contentType } from "../lib/content-type";
import { TINTS, itemTint } from "../lib/tints";
import { cn } from "../lib/utils";
import type { Item } from "../lib/types";

const SPRING = { type: "spring", stiffness: 520, damping: 38, mass: 0.7 } as const;

function fileToDataUrl(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = () => reject(r.error);
    r.readAsDataURL(file);
  });
}

// Pull an image src out of a dropped HTML fragment — browsers put <img ...> in text/html.
function imageUrlFromHtml(html: string): string | null {
  const m = html.match(/<img[^>]+src=["']([^"']+)["']/i);
  return m ? m[1] : null;
}

function basenameFromUrl(url: string, fallback: string): string {
  try {
    const base = (new URL(url).pathname.split("/").pop() || "").split("?")[0];
    return decodeURIComponent(base) || fallback;
  } catch {
    return fallback;
  }
}

const IMG_RE = /\.(png|jpe?g|gif|webp|svg|bmp|tiff?|heic|avif)$/i;

// Which lane filter an entry belongs to. active: null = All, "" = Unsorted, else a lane name.
function laneMatches(e: TrayEntry, active: string | null): boolean {
  if (active === null) return true;
  if (active === "") return !e.lane;
  return e.lane === active;
}

/**
 * The floating "tray" — a persistent shelf you drag *out* of. Click rows to select
 * (multi), drag any selected row to pull them all out (5 photos → Figma, an address
 * → a field); ↵ on hover pastes at the cursor. Non-key panel, so it never steals focus.
 */
export function TrayDock() {
  const { items } = useItems();
  const tray = useTray();
  const lanes = useLanes();
  const clips = useClipboard();
  const clipboardOn = useSettings().clipboardHistory;
  const [tab, setTab] = useState<"shelf" | "clipboard">("shelf");
  const [busy, setBusy] = useState(false);
  const [flashId, setFlashId] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [open, setOpen] = useState(false);
  const [dropping, setDropping] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [activeLane, setActiveLane] = useState<string | null>(null); // null=All, ""=Unsorted, else a lane
  const activeLaneRef = useRef<string | null>(null);
  activeLaneRef.current = activeLane;

  // switching lanes clears the selection so counts + Save stay scoped to what's visible
  function chooseLane(l: string | null) {
    setActiveLane(l);
    setSelected(new Set());
  }
  function deleteLane(name: string) {
    removeLane(name);
    if (activeLane === name) chooseLane(null);
  }
  function renameLaneTo(oldName: string, newName: string) {
    const nn = newName.trim();
    renameLane(oldName, nn);
    if (activeLane === oldName && nn) setActiveLane(nn);
  }

  function flashNotice(msg: string) {
    setNotice(msg);
    window.setTimeout(() => setNotice((c) => (c === msg ? null : c)), 2600);
  }

  // Animate the panel out, then hide the window — so the next open starts from the
  // hidden state instead of flashing the previous settled frame before re-entering.
  function requestClose() {
    setOpen(false);
    window.setTimeout(() => void invoke("hide_tray"), 180);
  }

  useEffect(() => {
    const unOpen = listen("tray:open", () => setOpen(true));
    const unClose = listen("tray:close", () => requestClose());
    return () => {
      void unOpen.then((f) => f());
      void unClose.then((f) => f());
    };
  }, []);

  // Stage whatever was dropped onto the tray. Native drag-drop is disabled on this
  // window (tauri.conf.json) so we can read image *bytes* off the pasteboard — a
  // browser image drag carries data, not a file path. Every drop arrives here as
  // HTML5 dataTransfer; we try, in order: real files (Finder files AND browser image
  // files both land in `.files` now), then an image URL with no file, then plain text.
  async function handleDrop(dt: DataTransfer) {
    // new drops file into the active lane (Unsorted when viewing All / Unsorted)
    const dropLane = typeof activeLaneRef.current === "string" && activeLaneRef.current !== "" ? activeLaneRef.current : undefined;
    const files = Array.from(dt.files);
    if (files.length) {
      let staged = 0;
      for (const f of files) {
        try {
          const path = await stageBlobFile(await fileToDataUrl(f), f.name || "");
          addToTray({ kind: "file", path, label: f.name || "Image", lane: dropLane });
          staged++;
        } catch {
          /* skip this one */
        }
      }
      if (staged) {
        sfx.save();
        setTab("shelf"); // surface where it landed, even if the Clipboard tab was open
      }
      return;
    }

    // an image dragged from a page that exposed only a URL (no File on the pasteboard)
    const html = dt.getData("text/html");
    const uri = (dt.getData("text/uri-list") || dt.getData("text/plain") || "").split(/\s+/)[0];
    const imgUrl = (html && imageUrlFromHtml(html)) || (/\.(png|jpe?g|gif|webp|svg|bmp|tiff?)$/i.test(uri) || uri.startsWith("data:image/") ? uri : "");
    if (imgUrl) {
      try {
        const blob = await (await fetch(imgUrl)).blob(); // CSP is null; data: + same-origin/CORS hosts work
        const name = basenameFromUrl(imgUrl, "image");
        const path = await stageBlobFile(await fileToDataUrl(blob), name);
        addToTray({ kind: "file", path, label: name, lane: dropLane });
        sfx.save();
        setTab("shelf");
        return;
      } catch {
        /* CORS / network failed — fall through to staging the link as text */
      }
    }

    const text = (dt.getData("text/plain") || "").trim();
    if (!text) return;
    addToTray({ kind: "text", value: text, label: text.split("\n")[0].slice(0, 48) || "Note", isUrl: /^https?:\/\//i.test(text), lane: dropLane });
    sfx.save();
    setTab("shelf");
  }

  // With native drag-drop disabled (so we can read image *bytes* off the pasteboard),
  // the underlying WKWebview treats a dropped URL/file like a browser would and
  // NAVIGATES to it — which is how dragging a Twitter image replaced the tray with
  // x.com. We must cancel the default for drag events at the window in the CAPTURE
  // phase (before React or WebKit's own handling) so a drop can never navigate, then
  // stage the payload ourselves.
  useEffect(() => {
    const onOver = (e: DragEvent) => {
      e.preventDefault();
      if (!isDraggingOut()) setDropping(true);
    };
    const onLeave = (e: DragEvent) => {
      if (e.relatedTarget === null) setDropping(false); // left the window entirely
    };
    const onDropEv = (e: DragEvent) => {
      e.preventDefault();
      setDropping(false);
      if (isDraggingOut() || !e.dataTransfer) return;
      void handleDrop(e.dataTransfer);
    };
    window.addEventListener("dragover", onOver, true);
    window.addEventListener("dragleave", onLeave, true);
    window.addEventListener("drop", onDropEv, true);
    return () => {
      window.removeEventListener("dragover", onOver, true);
      window.removeEventListener("dragleave", onLeave, true);
      window.removeEventListener("drop", onDropEv, true);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // the shelf is filtered to the active lane; selection + counts scope to it
  const visible = useMemo(() => tray.filter((e) => laneMatches(e, activeLane)), [tray, activeLane]);
  const selCount = useMemo(() => visible.filter((e) => selected.has(e.id)).length, [visible, selected]);
  const allSelected = visible.length > 0 && selCount === visible.length;

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  // per-entry traits — the board item (if any), whether it's a file (vs pasteable
  // text), and whether it's a gated secret.
  const itemFor = (e: TrayEntry) => (e.itemId ? items.find((i) => i.id === e.itemId) : undefined);
  const fileLikeOf = (e: TrayEntry) => {
    if (e.kind === "file") return true;
    if (e.kind === "item") {
      const it = itemFor(e);
      return !!it && (it.kind === "File" || contentType(it) === "image");
    }
    return false;
  };
  const confidentialOf = (e: TrayEntry) => !!itemFor(e)?.confidential;

  // Paste a text-ish entry at the cursor. Confidential items unlock via Touch ID
  // inside getTextValue (backend gate); files can't paste as text.
  async function paste(entry: TrayEntry) {
    if (busy || fileLikeOf(entry)) return;
    setBusy(true);
    sfx.paste();
    try {
      const value = entry.kind === "text" ? entry.value ?? "" : await getTextValue(entry.itemId ?? "");
      await navigator.clipboard.writeText(value);
      await invoke("tray_paste");
      setFlashId(entry.id);
      window.setTimeout(() => setFlashId((c) => (c === entry.id ? null : c)), 950);
    } catch {
      /* gate cancelled / error */
    } finally {
      setBusy(false);
    }
  }

  // Drag the trigger out — or the whole selection if it's part of one. Files drag
  // as files, notes/text drag as plain text; secrets are never dragged out.
  async function dragOut(trigger: TrayEntry) {
    const multi = selected.has(trigger.id) && selCount > 0;
    // single board file/image item → use its rich thumbnail preview
    if (!multi && trigger.kind === "item" && fileLikeOf(trigger) && !confidentialOf(trigger)) {
      const it = itemFor(trigger);
      await dragOutItem(trigger.itemId ?? "", it ? contentType(it) === "image" : false);
      return;
    }
    // Never drag a secret out — exclude it and say so.
    const all = multi ? visible.filter((e) => selected.has(e.id)) : [trigger];
    const secrets = all.filter((e) => confidentialOf(e)).length;
    const sel = all.filter((e) => !confidentialOf(e));
    if (secrets) flashNotice(`${secrets} confidential item${secrets > 1 ? "s" : ""} skipped — paste it instead`);
    if (!sel.length) return;

    // Resolve to file paths + text. A mix of both goes through the native drag
    // (carries files AND text at once); pure files / pure text use the plugin.
    const paths: string[] = [];
    const texts: string[] = [];
    let textLabel = "";
    for (const e of sel) {
      if (e.kind === "file" && e.path) {
        paths.push(e.path);
      } else if (e.kind === "item" && fileLikeOf(e)) {
        try {
          paths.push(await fileToTemp(e.itemId ?? ""));
        } catch {
          /* skip */
        }
      } else if (e.kind === "item") {
        try {
          texts.push(await getTextValue(e.itemId ?? ""));
          textLabel = e.label;
        } catch {
          /* skip */
        }
      } else if (e.kind === "text") {
        texts.push(e.value ?? "");
        textLabel = e.label;
      }
    }
    const joined = texts.length ? texts.join("\n") : null;
    const label = texts.length === 1 ? textLabel : `${texts.length} notes`;

    if (paths.length && joined !== null) {
      await dragMixedOut(paths, joined);
    } else if (paths.length) {
      await dragPathsOut(paths);
    } else if (joined !== null) {
      await dragTextOut(joined, label);
    }
  }

  function remove(id: string) {
    removeFromTray(id);
    setSelected((prev) => {
      if (!prev.has(id)) return prev;
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  }


  async function pasteClip(clip: ClipEntry) {
    if (busy || clip.kind === "image") return; // image paste lands with the capture step
    setBusy(true);
    sfx.paste();
    try {
      await navigator.clipboard.writeText(clip.value ?? "");
      await invoke("tray_paste");
      setFlashId(clip.id);
      window.setTimeout(() => setFlashId((c) => (c === clip.id ? null : c)), 950);
    } catch {
      /* best-effort */
    } finally {
      setBusy(false);
    }
  }

  function pinClip(clip: ClipEntry) {
    if (clip.kind !== "text") return;
    addToTray({ kind: "text", value: clip.value ?? "", label: clip.label, isUrl: clip.isUrl });
    sfx.move();
    flashNotice("Pinned to Shelf");
  }

  // Save acts on the visible lane: selected entries, or the whole lane if none
  // selected. Only committable entries — text/file — count. The lane name pre-fills
  // the commit dialog's category.
  const pendingEntries = committable(visible);
  const hasPending = pendingEntries.length > 0;
  const selectedPending = pendingEntries.filter((e) => selected.has(e.id));
  const laneCategory = typeof activeLane === "string" && activeLane !== "" ? activeLane : "";

  return (
    <div className="flex h-screen w-screen flex-col p-6 antialiased">
      <motion.div
        initial={false}
        animate={open ? { opacity: 1, scale: 1, y: 0 } : { opacity: 0, scale: 0.9, y: -10 }}
        transition={open ? { type: "spring", stiffness: 440, damping: 30 } : { duration: 0.15, ease: [0.4, 0, 1, 1] }}
        style={{ transformOrigin: "top right" }}
        className="relative flex min-h-0 flex-1 flex-col overflow-hidden rounded-[18px] bg-[#fbfbfa] shadow-[inset_0_1px_0_rgba(255,255,255,0.7),0_10px_28px_-16px_rgba(0,0,0,0.5),0_2px_8px_-3px_rgba(0,0,0,0.16)] ring-1 ring-black/[0.09]"
      >
        {/* drop-to-stage overlay */}
        <AnimatePresence>
          {dropping && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.16, ease: [0.23, 1, 0.32, 1] }}
              className="absolute inset-1.5 z-50 flex flex-col items-center justify-center gap-2 rounded-[14px] border-2 border-dashed border-[var(--ink)]/45 bg-[#fbfbfa]/85 backdrop-blur-[2px]"
            >
              <motion.div
                initial={{ scale: 0.85, y: 5 }}
                animate={{ scale: [0.85, 1.08, 1], y: 0 }}
                transition={{ duration: 0.42, ease: [0.34, 1.4, 0.5, 1] }}
                className="grid h-12 w-12 place-items-center rounded-full bg-[var(--ink)] text-white shadow-[0_8px_20px_-6px_rgba(0,0,0,0.4)]"
              >
                <Download size={22} />
              </motion.div>
              <div className="text-[12.5px] font-bold tracking-[-0.01em] text-[var(--ink)]">Drop to stage</div>
            </motion.div>
          )}
        </AnimatePresence>
        {/* transient notice (e.g. confidential skipped on drag) */}
        <AnimatePresence>
          {notice && (
            <motion.div
              initial={{ opacity: 0, y: 10, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 8, scale: 0.97 }}
              transition={{ type: "spring", stiffness: 500, damping: 30 }}
              className="absolute inset-x-3 bottom-3 z-[55] flex items-center justify-center gap-2 rounded-[11px] bg-[var(--ink)] px-3 py-2 text-center text-[11.5px] font-medium text-white shadow-[0_8px_24px_-8px_rgba(0,0,0,0.5)]"
            >
              {notice}
            </motion.div>
          )}
        </AnimatePresence>

        {/* tabs — Shelf | Clipboard (drag the strip to move the window) */}
        <div data-tauri-drag-region className="flex shrink-0 items-center gap-1.5 px-2.5 pb-1.5 pt-2.5">
          <div className="flex min-w-0 items-center gap-0.5 rounded-[10px] bg-black/[0.05] p-[3px]">
            <TabButton active={tab === "shelf"} onClick={() => setTab("shelf")} icon={Layers} label="Shelf" count={tray.length} />
            <TabButton active={tab === "clipboard"} onClick={() => setTab("clipboard")} icon={ClipboardList} label="Clipboard" count={clips.length} />
          </div>
          <div className="ml-auto flex shrink-0 items-center gap-1 pl-1">
            <AnimatePresence mode="popLayout">
              {tab === "shelf" && visible.length > 0 && (
                <motion.button
                  key="selall"
                  initial={{ scale: 0.6, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  exit={{ scale: 0.6, opacity: 0 }}
                  transition={{ type: "spring", stiffness: 600, damping: 22 }}
                  whileTap={{ scale: 0.9 }}
                  type="button"
                  onClick={() => setSelected(allSelected ? new Set() : new Set(visible.map((e) => e.id)))}
                  aria-label={allSelected ? "Deselect all" : "Select all"}
                  title={allSelected ? "Deselect all" : "Select all"}
                  className={cn(
                    "grid h-6 w-6 place-items-center rounded-[7px] transition-colors",
                    allSelected ? "bg-[var(--ink)] text-white" : "text-[var(--muted)] hover:bg-black/[0.06] hover:text-[var(--ink)]",
                  )}
                >
                  <CheckCheck size={14} strokeWidth={2.4} />
                </motion.button>
              )}
            </AnimatePresence>
            <motion.button whileTap={{ scale: 0.88 }} type="button" onClick={requestClose} aria-label="Close tray" className="grid h-6 w-6 place-items-center rounded-full text-[var(--faint)] transition-colors hover:bg-black/[0.06] hover:text-[var(--ink)]">
              <X size={14} />
            </motion.button>
          </div>
        </div>
        <div className="mx-3 h-px bg-black/[0.06]" />

        {/* lane chips — ad-hoc groups that filter the Shelf */}
        {tab === "shelf" && (tray.length > 0 || lanes.length > 0) && (
          <LaneBar
            lanes={lanes}
            tray={tray}
            active={activeLane}
            onChoose={chooseLane}
            onCreate={(name) => {
              addLane(name);
              chooseLane(name);
            }}
            onRename={renameLaneTo}
            onDelete={deleteLane}
          />
        )}

        {/* lane — Shelf or Clipboard, crossfading on tab switch */}
        <div className="qb-scroll min-h-0 flex-1 overflow-auto p-1.5">
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={tab}
              initial={{ opacity: 0, x: tab === "shelf" ? -10 : 10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: tab === "shelf" ? 10 : -10 }}
              transition={{ duration: 0.16, ease: [0.23, 1, 0.32, 1] }}
              className="flex min-h-full flex-col"
            >
              {tab === "shelf" ? (
                visible.length === 0 ? (
                  <LaneEmpty
                    icon={tray.length === 0 ? Layers : Inbox}
                    title={tray.length === 0 ? "Nothing staged" : "This lane is empty"}
                    hint={tray.length === 0 ? "Drop files or text here — or press ⇥ on an item in ⌥Space." : "Drop here to fill this lane, or move items in."}
                  />
                ) : (
                  <AnimatePresence initial={false} mode="popLayout">
                    {visible.map((e) => (
                      <TrayRow
                        key={e.id}
                        entry={e}
                        item={itemFor(e)}
                        flash={flashId === e.id}
                        selected={selected.has(e.id)}
                        anySelected={selCount > 0}
                        fileLike={fileLikeOf(e)}
                        confidential={confidentialOf(e)}
                        onSelect={() => toggleSelect(e.id)}
                        onDrag={() => void dragOut(e)}
                        onPaste={() => void paste(e)}
                        onRemove={() => remove(e.id)}
                      />
                    ))}
                  </AnimatePresence>
                )
              ) : clips.length === 0 ? (
                clipboardOn ? (
                  <LaneEmpty icon={ClipboardList} title="No clips yet" hint="Recent things you copy will show up here." />
                ) : (
                  <div className="flex flex-1 flex-col items-center justify-center gap-2 px-5 text-center">
                    <ClipboardList size={24} className="text-[var(--fainter)]" />
                    <div className="text-[12.5px] font-semibold text-[var(--muted)]">Clipboard history is off</div>
                    <div className="text-[11px] leading-relaxed text-[var(--faint)]">Keep a rolling history of what you copy. Password-manager copies are skipped.</div>
                    <motion.button whileTap={{ scale: 0.96 }} type="button" onClick={() => setSetting("clipboardHistory", true)} className="mt-1 flex items-center gap-1.5 rounded-full bg-[var(--ink)] px-3 py-1.5 text-[11.5px] font-semibold text-white">
                      <Check size={13} strokeWidth={2.6} /> Turn on
                    </motion.button>
                  </div>
                )
              ) : (
                <AnimatePresence initial={false} mode="popLayout">
                  {clips.map((c) => (
                    <ClipRow key={c.id} clip={c} flash={flashId === c.id} onPaste={() => void pasteClip(c)} onPin={() => pinClip(c)} onRemove={() => removeClip(c.id)} />
                  ))}
                </AnimatePresence>
              )}
            </motion.div>
          </AnimatePresence>
        </div>

        {/* actions */}
        <AnimatePresence initial={false}>
          {((tab === "shelf" && tray.length > 0) || (tab === "clipboard" && clips.length > 0)) && (
            <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.18 }} className="flex shrink-0 items-center gap-2 border-t border-black/[0.06] px-2.5 py-2">
              {tab === "shelf" && hasPending && (
                <motion.button whileTap={{ scale: 0.95 }} type="button" onClick={() => void invoke("open_commit", { ids: selectedPending.map((e) => e.id), category: laneCategory })} className="flex items-center gap-1.5 rounded-[9px] bg-[var(--ink)] px-2.5 py-1.5 text-[11.5px] font-semibold text-white">
                  <Check size={13} strokeWidth={2.6} /> {selectedPending.length > 0 ? `Save ${selectedPending.length} to board` : laneCategory ? "Save lane to board" : "Save all to board"}
                </motion.button>
              )}
              {tab === "shelf" && selCount > 0 && lanes.length > 0 && (
                <MoveMenu
                  lanes={lanes}
                  onMove={(lane) => {
                    moveToLane(selected, lane);
                    setSelected(new Set());
                  }}
                />
              )}
              <motion.button whileTap={{ scale: 0.95 }} type="button" onClick={() => { if (tab === "shelf") { clearTray(); setSelected(new Set()); chooseLane(null); } else clearClipboard(); }} className="ml-auto flex items-center gap-1.5 rounded-[9px] px-2.5 py-1.5 text-[11.5px] font-medium text-[var(--muted)] transition-colors hover:bg-black/[0.05]">
                <Trash2 size={13} /> Clear
              </motion.button>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  );
}

function TrayRow({
  entry,
  item,
  flash,
  selected,
  anySelected,
  fileLike,
  confidential,
  onSelect,
  onDrag,
  onPaste,
  onRemove,
}: {
  entry: TrayEntry;
  item?: Item;
  flash: boolean;
  selected: boolean;
  anySelected: boolean;
  fileLike: boolean;
  confidential: boolean;
  onSelect: () => void;
  onDrag: () => void;
  onPaste: () => void;
  onRemove: () => void;
}) {
  // staged image files show a real thumbnail so a pile of refs is scannable
  const [thumb, setThumb] = useState<string | null>(null);
  const isImage = entry.kind === "file" && !!entry.path && IMG_RE.test(entry.path);
  useEffect(() => {
    let on = true;
    if (isImage && entry.path) void readImageAsDataUrl(entry.path).then((d) => on && setThumb(d)).catch(() => {});
    return () => {
      on = false;
    };
  }, [entry.path, isImage]);

  let Icon = entry.isUrl ? Link2 : StickyNote;
  let tintColor = TINTS.violet.tileInk;
  if (entry.kind === "item" && item) {
    Icon = ICONS[getAppearance(item.id).icon ?? defaultIcon(contentType(item), item.confidential)];
    tintColor = TINTS[itemTint(item)].tileInk;
  } else if (entry.kind === "file") {
    Icon = FileText;
    tintColor = TINTS.sage.tileInk;
  }
  const meta = entry.kind === "item" ? "item" : entry.kind === "file" ? "file" : entry.isUrl ? "link" : "note";
  const canPaste = !fileLike; // text / notes / links can paste; files can't
  const draggable = !confidential; // never drag a secret out
  const showCheck = selected || anySelected;
  const cursor = canPaste ? "cursor-pointer" : draggable ? "cursor-grab active:cursor-grabbing" : "cursor-default";
  const hint = canPaste ? "click to paste" : draggable ? "drag out" : "open in app";

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, scale: 0.94, transition: { duration: 0.16 } }}
      transition={SPRING}
      whileTap={canPaste ? { scale: 0.985 } : undefined}
      draggable={draggable}
      onDragStart={
        draggable
          ? (ev) => {
              ev.preventDefault();
              onDrag();
            }
          : undefined
      }
      onClick={() => canPaste && onPaste()}
      title={hint}
      className={cn(
        "group/row relative flex select-none items-center gap-2 rounded-[11px] py-2 pl-1.5 pr-2 transition-colors",
        cursor,
        selected ? "bg-[#edeff5]" : "hover:bg-black/[0.04]",
      )}
    >
      <AnimatePresence>
        {flash && <motion.div initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: [0, 1, 0], scale: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.9 }} className="pointer-events-none absolute inset-0 rounded-[11px] bg-[#5fae84]/14 ring-1 ring-inset ring-[#5fae84]/45" />}
      </AnimatePresence>

      {/* selection checkbox — fades in on hover, stays while a selection is active */}
      <button
        type="button"
        onClick={(ev) => {
          ev.stopPropagation();
          onSelect();
        }}
        aria-label={selected ? "Deselect" : "Select"}
        className={cn("relative z-10 grid h-6 w-5 shrink-0 place-items-center transition-opacity", showCheck ? "opacity-100" : "opacity-0 group-hover/row:opacity-100")}
      >
        <span className={cn("grid h-[17px] w-[17px] place-items-center rounded-[6px] border transition-colors", selected ? "border-transparent bg-[var(--ink)] text-white" : "border-[1.5px] border-black/25 bg-white/60")}>
          <AnimatePresence>{selected && <motion.span initial={{ scale: 0.3, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.3, opacity: 0 }} transition={{ type: "spring", stiffness: 600, damping: 24 }}><Check size={11} strokeWidth={3.2} /></motion.span>}</AnimatePresence>
        </span>
      </button>

      <motion.span whileHover={{ scale: 1.08 }} transition={{ type: "spring", stiffness: 400, damping: 18 }} className="relative z-10 grid h-7 w-7 shrink-0 place-items-center overflow-hidden rounded-[7px]" style={{ color: tintColor }}>
        {thumb ? <img src={thumb} alt="" className="h-full w-full rounded-[7px] object-cover ring-1 ring-inset ring-black/[0.07]" /> : <Icon size={17} strokeWidth={1.9} />}
      </motion.span>
      <span className="relative z-10 min-w-0 flex-1">
        <span className="block truncate text-[12.5px] font-semibold tracking-[-0.01em] text-[var(--ink)]">{entry.label}</span>
        <span className="flex items-center gap-1 text-[10.5px] text-[var(--faint)]">
          {confidential && <Lock size={9} strokeWidth={2.4} />}
          <span className="truncate">{meta}</span>
        </span>
      </span>

      <div className="relative z-10 flex shrink-0 items-center">
        <AnimatePresence mode="wait">
          {flash ? (
            <motion.span key="ok" initial={{ opacity: 0, scale: 0.4, rotate: -25 }} animate={{ opacity: 1, scale: 1, rotate: 0 }} exit={{ opacity: 0, scale: 0.6 }} transition={{ type: "spring", stiffness: 600, damping: 18 }} className="grid h-5 w-5 place-items-center rounded-full bg-[#3f7a57] text-white">
              <Check size={11} strokeWidth={3} />
            </motion.span>
          ) : (
            <motion.span key="actions" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex items-center gap-0.5 opacity-0 transition-opacity group-hover/row:opacity-100">
              {canPaste && (
                <motion.button whileTap={{ scale: 0.85 }} type="button" onClick={(ev) => { ev.stopPropagation(); onPaste(); }} aria-label="Paste at cursor" className="grid h-6 w-6 place-items-center rounded-[7px] text-[var(--muted)] hover:bg-black/[0.06]">
                  <CornerDownLeft size={12} />
                </motion.button>
              )}
              <motion.button whileTap={{ scale: 0.85 }} type="button" onClick={(ev) => { ev.stopPropagation(); onRemove(); }} aria-label="Remove" className="grid h-6 w-6 place-items-center rounded-[7px] text-[var(--faint)] hover:bg-black/[0.06] hover:text-[#b4424f]">
                <X size={12} />
              </motion.button>
            </motion.span>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}

function TabButton({ active, onClick, icon: Icon, label, count }: { active: boolean; onClick: () => void; icon: LucideIcon; label: string; count: number }) {
  return (
    <button type="button" onClick={onClick} className="relative rounded-[8px] px-2 py-1">
      {active && <motion.span layoutId="tray-tab" transition={{ type: "spring", stiffness: 520, damping: 36 }} className="absolute inset-0 rounded-[8px] bg-white shadow-[0_1px_2px_rgba(0,0,0,0.09),0_1px_1px_rgba(0,0,0,0.04)]" />}
      <span className={cn("relative z-10 flex items-center gap-1.5 text-[11.5px] font-semibold transition-colors", active ? "text-[var(--ink)]" : "text-[var(--muted)]")}>
        <Icon size={12.5} strokeWidth={2.2} />
        {label}
        {count > 0 && <span className={cn("grid h-[15px] min-w-[15px] place-items-center rounded-full px-1 text-[9.5px] font-bold tabular", active ? "bg-black/[0.07] text-[var(--muted)]" : "bg-black/[0.05] text-[var(--faint)]")}>{count}</span>}
      </span>
    </button>
  );
}

// The ad-hoc "lane" chips under the Shelf tabs: All · <lanes> · Unsorted · +.
// Click to filter; the active lane chip exposes rename + delete; + creates one.
function LaneBar({
  lanes,
  tray,
  active,
  onChoose,
  onCreate,
  onRename,
  onDelete,
}: {
  lanes: string[];
  tray: TrayEntry[];
  active: string | null;
  onChoose: (lane: string | null) => void;
  onCreate: (name: string) => void;
  onRename: (oldName: string, newName: string) => void;
  onDelete: (name: string) => void;
}) {
  const [editing, setEditing] = useState<string | null>(null); // lane being renamed; "" = creating
  const [draft, setDraft] = useState("");
  const unsorted = tray.filter((e) => !e.lane).length;

  function commit() {
    const v = draft.trim();
    if (editing === "") {
      if (v) onCreate(v);
    } else if (editing && v && v !== editing) {
      onRename(editing, v);
    }
    setEditing(null);
    setDraft("");
  }
  function cancel() {
    setEditing(null);
    setDraft("");
  }

  return (
    <div className="flex shrink-0 items-center gap-1 overflow-x-auto px-2.5 pb-1.5 [&::-webkit-scrollbar]:hidden">
      <LaneChip label="All" count={tray.length} active={active === null} onClick={() => onChoose(null)} />
      {lanes.map((l) =>
        editing === l ? (
          <LaneInput key={l} value={draft} onChange={setDraft} onCommit={commit} onCancel={cancel} />
        ) : (
          <LaneChip
            key={l}
            label={l}
            count={tray.filter((e) => e.lane === l).length}
            active={active === l}
            onClick={() => onChoose(l)}
            onRename={() => {
              setEditing(l);
              setDraft(l);
            }}
            onDelete={() => onDelete(l)}
          />
        ),
      )}
      {unsorted > 0 && <LaneChip label="Unsorted" icon={Inbox} count={unsorted} active={active === ""} onClick={() => onChoose("")} />}
      {editing === "" ? (
        <LaneInput value={draft} onChange={setDraft} onCommit={commit} onCancel={cancel} />
      ) : (
        <button type="button" onClick={() => { setEditing(""); setDraft(""); }} aria-label="New lane" className="grid h-[26px] w-[26px] shrink-0 place-items-center rounded-full bg-black/[0.05] text-[var(--muted)] transition-colors hover:bg-black/[0.08] hover:text-[var(--ink)]">
          <Plus size={14} strokeWidth={2.4} />
        </button>
      )}
    </div>
  );
}

function LaneChip({
  label,
  count,
  active,
  icon: Icon,
  onClick,
  onRename,
  onDelete,
}: {
  label: string;
  count: number;
  active: boolean;
  icon?: LucideIcon;
  onClick: () => void;
  onRename?: () => void;
  onDelete?: () => void;
}) {
  const manageable = active && !!onRename && !!onDelete;
  const body = (
    <>
      {Icon && <Icon size={11} strokeWidth={2.3} />}
      <span className="max-w-[88px] truncate">{label}</span>
      <span className={cn("tabular", active ? "text-white/55" : "text-[var(--faint)]")}>{count}</span>
    </>
  );
  if (!manageable) {
    return (
      <button
        type="button"
        onClick={onClick}
        className={cn(
          "flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold transition-colors",
          active ? "bg-[var(--ink)] text-white" : "bg-black/[0.05] text-[var(--muted)] hover:bg-black/[0.08]",
        )}
      >
        {body}
      </button>
    );
  }
  return (
    <div className="flex shrink-0 items-center rounded-full bg-[var(--ink)] py-1 pl-2.5 pr-1 text-[11px] font-semibold text-white">
      <button type="button" onClick={onClick} className="flex items-center gap-1">
        {body}
      </button>
      <span className="ml-1 flex items-center gap-0.5">
        <button type="button" onClick={onRename} aria-label="Rename lane" className="grid h-[18px] w-[18px] place-items-center rounded-full text-white/65 hover:bg-white/15 hover:text-white">
          <Pencil size={10} strokeWidth={2.4} />
        </button>
        <button type="button" onClick={onDelete} aria-label="Delete lane" className="grid h-[18px] w-[18px] place-items-center rounded-full text-white/65 hover:bg-white/15 hover:text-white">
          <Trash2 size={10} strokeWidth={2.2} />
        </button>
      </span>
    </div>
  );
}

function LaneInput({ value, onChange, onCommit, onCancel }: { value: string; onChange: (v: string) => void; onCommit: () => void; onCancel: () => void }) {
  return (
    <div className="flex shrink-0 items-center gap-1 rounded-full bg-white px-2 py-0.5 ring-1 ring-[var(--ink)]/30">
      <input
        autoFocus
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") onCommit();
          else if (e.key === "Escape") onCancel();
        }}
        onBlur={onCommit}
        placeholder="Lane name"
        className="w-[80px] bg-transparent text-[11px] font-semibold text-[var(--ink)] placeholder:font-medium placeholder:text-[var(--fainter)] focus:outline-none"
      />
      <button type="button" onMouseDown={(e) => { e.preventDefault(); onCommit(); }} aria-label="Confirm" className="grid h-[18px] w-[18px] shrink-0 place-items-center rounded-full bg-[var(--ink)] text-white">
        <Check size={11} strokeWidth={2.8} />
      </button>
    </div>
  );
}

// Drop a multi-selection into another lane (or Unsorted). Small upward popover.
function MoveMenu({ lanes, onMove }: { lanes: string[]; onMove: (lane: string | undefined) => void }) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    window.addEventListener("click", close);
    return () => window.removeEventListener("click", close);
  }, [open]);
  return (
    <div className="relative">
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setOpen((o) => !o);
        }}
        className="flex items-center gap-1 rounded-[9px] px-2 py-1.5 text-[11.5px] font-medium text-[var(--muted)] transition-colors hover:bg-black/[0.05]"
      >
        <FolderInput size={13} /> Move <ChevronDown size={11} className={cn("transition-transform", open && "rotate-180")} />
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 6, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 4, scale: 0.98 }}
            transition={{ duration: 0.14 }}
            onClick={(e) => e.stopPropagation()}
            className="absolute bottom-full left-0 z-[60] mb-1.5 max-h-[190px] min-w-[150px] overflow-y-auto rounded-[11px] border border-black/[0.08] bg-white p-1 shadow-[0_10px_30px_-10px_rgba(0,0,0,0.45)] [&::-webkit-scrollbar]:hidden"
          >
            <div className="px-2 pb-1 pt-0.5 text-[10px] font-bold uppercase tracking-wide text-[var(--fainter)]">Move to</div>
            {lanes.map((l) => (
              <button key={l} type="button" onClick={() => { onMove(l); setOpen(false); }} className="flex w-full items-center gap-2 rounded-[8px] px-2 py-1.5 text-left text-[12px] font-semibold text-[var(--ink)] hover:bg-black/[0.05]">
                <Layers size={12} className="shrink-0 text-[var(--muted)]" /> <span className="truncate">{l}</span>
              </button>
            ))}
            <button type="button" onClick={() => { onMove(undefined); setOpen(false); }} className="flex w-full items-center gap-2 rounded-[8px] px-2 py-1.5 text-left text-[12px] font-medium text-[var(--muted)] hover:bg-black/[0.05]">
              <Inbox size={12} className="shrink-0" /> Unsorted
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function LaneEmpty({ icon: Icon, title, hint }: { icon: LucideIcon; title: string; hint: string }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-1.5 px-5 text-center">
      <motion.div animate={{ y: [0, -5, 0] }} transition={{ duration: 2.6, repeat: Infinity, ease: "easeInOut" }}>
        <Icon size={24} className="text-[var(--fainter)]" />
      </motion.div>
      <div className="text-[12.5px] font-semibold text-[var(--muted)]">{title}</div>
      <div className="text-[11px] leading-relaxed text-[var(--faint)]">{hint}</div>
    </div>
  );
}

function ClipRow({ clip, flash, onPaste, onPin, onRemove }: { clip: ClipEntry; flash: boolean; onPaste: () => void; onPin: () => void; onRemove: () => void }) {
  const Icon = clip.kind === "image" ? ImageIcon : clip.isUrl ? Link2 : StickyNote;
  const canDrag = clip.kind === "text";
  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, scale: 0.94, transition: { duration: 0.16 } }}
      transition={SPRING}
      whileTap={{ scale: 0.985 }}
      draggable={canDrag}
      onDragStart={
        canDrag
          ? (ev) => {
              ev.preventDefault();
              void dragTextOut(clip.value ?? "", clip.label);
            }
          : undefined
      }
      onClick={onPaste}
      className="group/row relative flex cursor-pointer select-none items-center gap-2 rounded-[11px] py-2 pl-2 pr-2 transition-colors hover:bg-black/[0.04]"
    >
      <AnimatePresence>
        {flash && <motion.div initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: [0, 1, 0], scale: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.9 }} className="pointer-events-none absolute inset-0 rounded-[11px] bg-[#5fae84]/14 ring-1 ring-inset ring-[#5fae84]/45" />}
      </AnimatePresence>
      <span className="relative z-10 grid h-7 w-7 shrink-0 place-items-center overflow-hidden rounded-[7px] ring-1 ring-inset ring-black/[0.04]" style={{ color: TINTS.sky.tileInk }}>
        {clip.kind === "image" && clip.thumb ? <img src={clip.thumb} alt="" className="h-full w-full object-cover" /> : <Icon size={16} strokeWidth={1.9} />}
      </span>
      <span className="relative z-10 min-w-0 flex-1">
        <span className="block truncate text-[12.5px] font-semibold tracking-[-0.01em] text-[var(--ink)]">{clip.label}</span>
        <span className="block truncate text-[10.5px] text-[var(--faint)] tabular">{relativeTime(clip.ts)}</span>
      </span>
      <div className="relative z-10 flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover/row:opacity-100">
        {clip.kind === "text" && (
          <>
            <motion.button whileTap={{ scale: 0.85 }} type="button" onClick={(ev) => { ev.stopPropagation(); onPaste(); }} aria-label="Paste at cursor" className="grid h-6 w-6 place-items-center rounded-[7px] text-[var(--muted)] hover:bg-black/[0.06]">
              <CornerDownLeft size={12} />
            </motion.button>
            <motion.button whileTap={{ scale: 0.85 }} type="button" onClick={(ev) => { ev.stopPropagation(); onPin(); }} aria-label="Pin to Shelf" className="grid h-6 w-6 place-items-center rounded-[7px] text-[var(--muted)] hover:bg-black/[0.06]">
              <Bookmark size={12} />
            </motion.button>
          </>
        )}
        <motion.button whileTap={{ scale: 0.85 }} type="button" onClick={(ev) => { ev.stopPropagation(); onRemove(); }} aria-label="Remove" className="grid h-6 w-6 place-items-center rounded-[7px] text-[var(--faint)] hover:bg-black/[0.06] hover:text-[#b4424f]">
          <X size={12} />
        </motion.button>
      </div>
    </motion.div>
  );
}
