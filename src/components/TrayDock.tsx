import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import { Bookmark, Check, CheckCheck, ChevronDown, ClipboardList, CornerDownLeft, Download, FileText, FolderInput, Image as ImageIcon, Inbox, Layers, LayoutGrid, Link2, Lock, MoreHorizontal, Pencil, Plus, Search, StickyNote, Trash2, X, type LucideIcon } from "lucide-react";
import { useItems } from "../lib/items-store";
import { fileToTemp, getImageDataUrl, getTextValue, readImageAsDataUrl, stageBlobFile } from "../lib/ipc";
import { dragMixedOut, dragOutItem, dragPathOut, dragPathsOut, dragTextOut, isDraggingOut } from "../lib/drag";
import { addLane, addToTray, clearTray, committable, isTrayImageFile, labelForTrayFile, moveToLane, removeFromTray, removeLane, renameLane, restoreTray, useLanes, useTray, type TrayEntry } from "../lib/tray";
import { clearClipsSince, clipPreview, filterClips, removeClip, restoreClips, suppressClipboardCapture, suppressImageCapture, useClipboard, type ClipEntry } from "../lib/clipboard";
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
const EASE = [0.23, 1, 0.32, 1] as const; // strong ease-out for crossfades
type TrayView = "shelf" | "clipboard" | "board";
type Notice = { message: string; actionLabel?: string; onAction?: () => void };

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

// Which lane filter an entry belongs to. active: null = All, "" = Unsorted, else a lane name.
function laneMatches(e: TrayEntry, active: string | null): boolean {
  if (active === null) return true;
  if (active === "") return !e.lane;
  return e.lane === active;
}

/**
 * The floating "tray" — a persistent shelf for staging, grouping, and pulling content
 * back out. Rows drag out; the Move control sorts entries into lanes. Non-key panel,
 * so it never steals focus.
 */
export function TrayDock() {
  const { items, environments, activeEnvironment, reload } = useItems();
  const tray = useTray();
  const lanes = useLanes();
  const clips = useClipboard();
  const clipboardOn = useSettings().clipboardHistory;
  const [mode, setMode] = useState<"tray" | "board">("tray"); // temporary staging vs saved-board browser
  const [boardEnv, setBoardEnv] = useState("");
  const [boardCats, setBoardCats] = useState<Set<string>>(new Set());
  const [tab, setTab] = useState<"shelf" | "clipboard">("shelf");
  const [busy, setBusy] = useState(false);
  const [flashId, setFlashId] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [open, setOpen] = useState(false);
  const [dropping, setDropping] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [activeLane, setActiveLane] = useState<string | null>(null); // null=All, ""=Unsorted, else a lane
  const [clipQuery, setClipQuery] = useState("");
  const [clipType, setClipType] = useState<"all" | "links" | "text">("all");
  const [clipSource, setClipSource] = useState<string | null>(null);
  const activeLaneRef = useRef<string | null>(null);
  activeLaneRef.current = activeLane;
  const activeView: TrayView = mode === "board" ? "board" : tab;

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

  function preferredBoardEnv() {
    return activeEnvironment && environments.includes(activeEnvironment) ? activeEnvironment : environments[0] ?? "";
  }

  function switchMode(m: "tray" | "board") {
    setMode(m);
    setSelected(new Set());
    if (m === "board") {
      if (!boardEnv) setBoardEnv(preferredBoardEnv());
      void reload(); // pull the latest saved items from the store
    }
  }
  function switchView(view: TrayView) {
    if (view === "board") {
      switchMode("board");
      return;
    }
    setMode("tray");
    setTab(view);
    setSelected(new Set());
  }
  function toggleCat(c: string) {
    setBoardCats((prev) => {
      const next = new Set(prev);
      if (next.has(c)) next.delete(c);
      else next.add(c);
      return next;
    });
  }

  function flashNotice(message: string, action?: Omit<Notice, "message">) {
    const next = { message, ...action };
    setNotice(next);
    window.setTimeout(() => setNotice((c) => (c === next ? null : c)), 3200);
  }
  function restoreShelf(entries: TrayEntry[], laneNames = lanes, lane = activeLane) {
    restoreTray(entries, laneNames);
    setActiveLane(lane);
    setSelected(new Set());
    flashNotice("Restored");
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
          const mime = f.type || undefined;
          const path = await stageBlobFile(await fileToDataUrl(f), f.name || "");
          addToTray({ kind: "file", path, label: labelForTrayFile(f.name, mime), mime, lane: dropLane });
          staged++;
        } catch {
          /* skip this one */
        }
      }
      if (staged) {
        sfx.save();
        setMode("tray");
        setTab("shelf"); // surface where it landed, whatever mode/tab was open
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
        const mime = blob.type || undefined;
        const path = await stageBlobFile(await fileToDataUrl(blob), name);
        addToTray({ kind: "file", path, label: labelForTrayFile(name, mime), mime, lane: dropLane });
        sfx.save();
        setMode("tray");
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
    setMode("tray");
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

  // Board browser: saved items in the chosen env, filtered to the picked categories,
  // mapped to item-entries so the same row / drag / paste machinery handles them.
  const boardCatList = useMemo(() => {
    const set = new Set<string>();
    for (const i of items) if (i.environment === boardEnv) set.add(i.category);
    return Array.from(set).sort();
  }, [items, boardEnv]);

  useEffect(() => {
    if (mode !== "board") return;
    if (!boardEnv && environments.length > 0) {
      setBoardEnv(preferredBoardEnv());
      return;
    }
    if (boardEnv && !environments.includes(boardEnv)) {
      setBoardEnv(preferredBoardEnv());
      setBoardCats(new Set());
      setSelected(new Set());
    }
  }, [activeEnvironment, boardEnv, environments, mode]);

  useEffect(() => {
    setBoardCats((prev) => {
      const next = new Set([...prev].filter((c) => boardCatList.includes(c)));
      return next.size === prev.size ? prev : next;
    });
  }, [boardCatList]);

  const boardEntries = useMemo<TrayEntry[]>(
    () =>
      items
        .filter((i) => i.environment === boardEnv && (boardCats.size === 0 || boardCats.has(i.category)))
        .map((i) => ({ id: i.id, kind: "item", itemId: i.id, label: i.label })),
    [items, boardEnv, boardCats],
  );

  // the active list: board entries (Board mode), or the shelf filtered to the active lane.
  const trayVisible = useMemo(() => tray.filter((e) => laneMatches(e, activeLane)), [tray, activeLane]);
  const clipSources = useMemo(
    () => Array.from(new Set(clips.map((c) => c.sourceApp?.trim()).filter((s): s is string => !!s))).sort(),
    [clips],
  );
  const visibleClips = useMemo(() => {
    const typed = clips.filter((c) => (clipType === "links" ? !!c.isUrl : clipType === "text" ? !c.isUrl : true));
    const sourced = clipSource ? typed.filter((c) => c.sourceApp?.trim() === clipSource) : typed;
    return filterClips(sourced, clipQuery);
  }, [clipQuery, clipSource, clipType, clips]);
  const visible = mode === "board" ? boardEntries : trayVisible;
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
      suppressClipboardCapture(value);
      await invoke("tray_paste", { value });
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
    if (!multi && trigger.kind === "file" && trigger.path && isTrayImageFile(trigger)) {
      await dragPathOut(trigger.path, true);
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
    const prevTray = tray;
    const prevLanes = lanes;
    removeFromTray(id);
    setSelected((prev) => {
      if (!prev.has(id)) return prev;
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
    flashNotice("Removed", { actionLabel: "Undo", onAction: () => restoreShelf(prevTray, prevLanes) });
  }

  function moveShelfIds(ids: Iterable<string>, lane: string | undefined) {
    const idSet = ids instanceof Set ? ids : new Set(ids);
    const previous = tray.filter((e) => idSet.has(e.id)).map((e) => ({ id: e.id, lane: e.lane }));
    if (!previous.length) return;
    moveToLane(idSet, lane);
    setSelected(new Set());
    sfx.move();
    flashNotice(lane ? `Moved to ${lane}` : "Moved to Unsorted", {
      actionLabel: "Undo",
      onAction: () => {
        previous.forEach((e) => moveToLane([e.id], e.lane));
        flashNotice("Restored");
      },
    });
  }

  function moveShelfEntries(triggerId: string, lane: string | undefined) {
    moveShelfIds(selected.has(triggerId) && selCount > 0 ? selected : [triggerId], lane);
  }

  function clearShelf() {
    const prevTray = tray;
    const prevLanes = lanes;
    const prevLane = activeLane;
    clearTray();
    setSelected(new Set());
    chooseLane(null);
    flashNotice(`${prevTray.length} item${prevTray.length === 1 ? "" : "s"} cleared`, { actionLabel: "Undo", onAction: () => restoreShelf(prevTray, prevLanes, prevLane) });
  }

  async function pasteClip(clip: ClipEntry) {
    if (busy) return;
    if (clip.kind === "image" && !clip.path) return;
    setBusy(true);
    sfx.paste();
    try {
      if (clip.kind === "image") {
        suppressImageCapture();
        await invoke("tray_paste_image", { path: clip.path });
      } else {
        const value = clip.value ?? "";
        suppressClipboardCapture(value);
        await invoke("tray_paste", { value });
      }
      setFlashId(clip.id);
      window.setTimeout(() => setFlashId((c) => (c === clip.id ? null : c)), 950);
    } catch {
      /* best-effort */
    } finally {
      setBusy(false);
    }
  }

  function stageClip(clip: ClipEntry) {
    if (clip.kind === "image") {
      if (!clip.path) return;
      addToTray({ kind: "file", path: clip.path, mime: clip.mime, label: clip.label });
    } else {
      addToTray({ kind: "text", value: clip.value ?? "", label: clip.label, isUrl: clip.isUrl });
    }
    sfx.move();
    flashNotice("Staged in Shelf");
  }

  function saveClip(clip: ClipEntry) {
    const id =
      clip.kind === "image"
        ? clip.path
          ? addToTray({ kind: "file", path: clip.path, mime: clip.mime, label: clip.label, transient: true })
          : null
        : addToTray({ kind: "text", value: clip.value ?? "", label: clip.label, isUrl: clip.isUrl, transient: true });
    if (!id) return;
    sfx.save();
    void invoke("open_commit", { ids: [id], category: "" });
  }

  function clearClipRange(seconds?: number) {
    const removed = clearClipsSince(seconds === undefined ? undefined : Math.floor(Date.now() / 1000) - seconds);
    if (!removed.length) return;
    flashNotice(`${removed.length} clip${removed.length === 1 ? "" : "s"} cleared`, {
      actionLabel: "Undo",
      onAction: () => {
        restoreClips(removed);
        flashNotice("Restored");
      },
    });
  }

  // Save acts on the visible lane: selected entries, or the whole lane if none
  // selected. Only committable entries — text/file — count. The lane name pre-fills
  // the commit dialog's category.
  const pendingEntries = committable(visible);
  const hasPending = pendingEntries.length > 0;
  const selectedPending = pendingEntries.filter((e) => selected.has(e.id));
  const savePending = selectedPending.length > 0 ? selectedPending : pendingEntries;
  const laneCategory = typeof activeLane === "string" && activeLane !== "" ? activeLane : "";

  return (
    <div className="flex h-screen w-screen flex-col p-5 antialiased">
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
              <div className="text-[12.5px] font-bold tracking-[-0.01em] text-[var(--ink)]">Drop to Shelf</div>
              <div className="text-[11px] font-medium text-[var(--faint)]">Text, files, images, or screenshots</div>
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
              <span>{notice.message}</span>
              {notice.actionLabel && notice.onAction && (
                <button type="button" onClick={notice.onAction} className="rounded-[7px] bg-white/12 px-2 py-1 text-[11px] font-bold text-white transition-colors hover:bg-white/18">
                  {notice.actionLabel}
                </button>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        {/* view switcher — Shelf (staging) | Clipboard (recent copies) | Board (saved items) */}
        <div data-tauri-drag-region className="flex shrink-0 items-center gap-1.5 px-2.5 pb-1.5 pt-2.5">
          <div className="flex min-w-0 items-center gap-0.5 rounded-[10px] bg-black/[0.05] p-[3px]">
            <TabButton seg="tray-mode" active={activeView === "shelf"} onClick={() => switchView("shelf")} icon={Layers} label="Shelf" count={tray.length} />
            <TabButton seg="tray-mode" active={activeView === "clipboard"} onClick={() => switchView("clipboard")} icon={ClipboardList} label="Clipboard" count={clips.length} />
            <TabButton seg="tray-mode" active={activeView === "board"} onClick={() => switchView("board")} icon={LayoutGrid} label="Board" count={0} />
          </div>
          <div className="ml-auto flex shrink-0 items-center gap-1 pl-1">
            <AnimatePresence mode="popLayout">
              {visible.length > 0 && (activeView === "board" || activeView === "shelf") && (
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

        {/* board mode: environment picker and category chips */}
        {mode === "board" && (
          <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.22, ease: EASE }}>
            <BoardControls
              env={boardEnv}
              envOptions={environments}
              items={items}
              cats={boardCats}
              catList={boardCatList}
              onChangeEnv={(e) => {
                setBoardEnv(e);
                setBoardCats(new Set());
                setSelected(new Set());
              }}
              onToggleCat={toggleCat}
              onAllCats={() => setBoardCats(new Set())}
            />
          </motion.div>
        )}

        {/* lane chips — ad-hoc groups that filter the Shelf */}
        {mode === "tray" && tab === "shelf" && (tray.length > 0 || lanes.length > 0) && (
          <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.22, ease: EASE }}>
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
          </motion.div>
        )}

        {mode === "tray" && tab === "clipboard" && clips.length > 0 && (
          <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.18, ease: EASE }} className="px-2.5 pb-1.5 pt-1">
            <div className="flex h-[30px] items-center gap-2 rounded-[10px] bg-black/[0.05] px-2.5">
              <Search size={13} className="shrink-0 text-[var(--fainter)]" />
              <input
                value={clipQuery}
                onChange={(e) => setClipQuery(e.target.value)}
                placeholder="Search recent copies..."
                className="min-w-0 flex-1 bg-transparent text-[12px] font-medium text-[var(--ink)] outline-none placeholder:text-[var(--fainter)]"
              />
            </div>
            <div className="mt-1 flex items-center gap-1 overflow-x-auto [&::-webkit-scrollbar]:hidden">
              <CatChip
                label="All"
                count={clips.length}
                active={clipType === "all" && !clipSource}
                onClick={() => {
                  setClipType("all");
                  setClipSource(null);
                }}
              />
              <CatChip label="Links" count={clips.filter((c) => c.isUrl).length} active={clipType === "links"} onClick={() => setClipType(clipType === "links" ? "all" : "links")} />
              <CatChip label="Text" count={clips.filter((c) => !c.isUrl).length} active={clipType === "text"} onClick={() => setClipType(clipType === "text" ? "all" : "text")} />
              {clipSources.map((source) => (
                <CatChip key={source} label={source} count={clips.filter((c) => c.sourceApp?.trim() === source).length} active={clipSource === source} onClick={() => setClipSource(clipSource === source ? null : source)} />
              ))}
            </div>
          </motion.div>
        )}

        {/* list — Board items, or the Shelf/Clipboard lane. Mode switch blur-crossfades. */}
        <div className="qb-scroll min-h-0 flex-1 overflow-auto p-1.5">
          <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={mode}
            initial={{ opacity: 0, filter: "blur(7px)" }}
            animate={{ opacity: 1, filter: "blur(0.01px)" }}
            exit={{ opacity: 0, filter: "blur(7px)" }}
            transition={{ duration: 0.2, ease: EASE }}
            style={{ willChange: "opacity, filter" }}
            className="flex min-h-full flex-col"
          >
          {mode === "board" ? (
            visible.length === 0 ? (
              <LaneEmpty
                icon={LayoutGrid}
                title={environments.length === 0 ? "No saved items yet" : "Nothing here"}
                hint={environments.length === 0 ? "Save items to your board, then pull them out here." : "Pick an environment and categories to pull from."}
              />
            ) : (
              <div className="flex min-h-full flex-col">
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
                    />
                  ))}
                </AnimatePresence>
              </div>
            )
          ) : (
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={tab}
              initial={{ opacity: 0, filter: "blur(6px)" }}
              animate={{ opacity: 1, filter: "blur(0.01px)" }}
              exit={{ opacity: 0, filter: "blur(6px)" }}
              transition={{ duration: 0.16, ease: EASE }}
              style={{ willChange: "opacity, filter" }}
              className="flex min-h-full flex-col"
            >
              {tab === "shelf" ? (
                visible.length === 0 ? (
                  <LaneEmpty
                    icon={tray.length === 0 ? Layers : Inbox}
                    title={tray.length === 0 ? "Nothing staged" : "This lane is empty"}
                    hint={tray.length === 0 ? "Drop text, files, images, or screenshots here — or press ⇥ in ⌥Space." : "Drop here to fill this lane, or move items in."}
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
                        moveSelect={lanes.length > 0 ? <LaneMoveSelect lanes={lanes} onMove={(lane) => moveShelfEntries(e.id, lane)} /> : undefined}
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
              ) : visibleClips.length === 0 ? (
                <LaneEmpty icon={Search} title="No matching clips" hint="Search checks the full copied text, not just the first line." />
              ) : (
                <AnimatePresence initial={false} mode="popLayout">
                  {visibleClips.map((c) => (
                    <ClipRow key={c.id} clip={c} flash={flashId === c.id} onPaste={() => void pasteClip(c)} onSave={() => saveClip(c)} onStage={() => stageClip(c)} onRemove={() => removeClip(c.id)} />
                  ))}
                </AnimatePresence>
              )}
            </motion.div>
          </AnimatePresence>
          )}
          </motion.div>
          </AnimatePresence>
        </div>

        {/* actions — Tray mode only (Board items are already saved) */}
        {mode === "tray" && (
        <AnimatePresence initial={false}>
          {((tab === "shelf" && tray.length > 0) || tab === "clipboard") && (
            <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.18 }} className="flex shrink-0 items-center gap-2 border-t border-black/[0.06] px-2.5 py-2">
              {tab === "shelf" && hasPending && (
                <motion.button whileTap={{ scale: 0.95 }} type="button" onClick={() => void invoke("open_commit", { ids: savePending.map((e) => e.id), category: laneCategory })} className="flex items-center gap-1.5 rounded-[9px] bg-[var(--ink)] px-2.5 py-1.5 text-[11.5px] font-semibold text-white">
                  <Check size={13} strokeWidth={2.6} /> {selectedPending.length > 0 ? `Save ${selectedPending.length} to board` : laneCategory ? "Save lane to board" : "Save all to board"}
                </motion.button>
              )}
              {tab === "shelf" && selCount > 0 && lanes.length > 0 && (
                <MoveMenu
                  lanes={lanes}
                  onMove={(lane) => {
                    moveShelfIds(selected, lane);
                  }}
                />
              )}
              {tab === "clipboard" && (
                <motion.button whileTap={{ scale: 0.95 }} type="button" onClick={() => setSetting("clipboardHistory", !clipboardOn)} className="flex items-center gap-1.5 rounded-[9px] px-2.5 py-1.5 text-[11.5px] font-medium text-[var(--muted)] transition-colors hover:bg-black/[0.05]">
                  {clipboardOn ? "Pause History" : "Resume History"}
                </motion.button>
              )}
              {tab === "clipboard" && clips.length > 0 ? (
                <ClearClipsMenu onClear={clearClipRange} />
              ) : tab === "shelf" ? (
                <motion.button whileTap={{ scale: 0.95 }} type="button" onClick={clearShelf} className="ml-auto flex items-center gap-1.5 rounded-[9px] px-2.5 py-1.5 text-[11.5px] font-medium text-[var(--muted)] transition-colors hover:bg-black/[0.05]">
                  <Trash2 size={13} /> Clear
                </motion.button>
              ) : null}
            </motion.div>
          )}
        </AnimatePresence>
        )}

        {/* board mode footer — pull-out hint + clear selection */}
        {mode === "board" && visible.length > 0 && (
          <div className="flex shrink-0 items-center gap-2 border-t border-black/[0.06] px-2.5 py-2">
            <span className="text-[11px] text-[var(--faint)]">{selCount > 0 ? `${selCount} selected · drag any out` : "Drag items out, or click text to paste"}</span>
            {selCount > 0 && (
              <button type="button" onClick={() => setSelected(new Set())} className="ml-auto rounded-[9px] px-2.5 py-1.5 text-[11.5px] font-medium text-[var(--muted)] transition-colors hover:bg-black/[0.05]">
                Clear
              </button>
            )}
          </div>
        )}
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
  moveSelect,
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
  onRemove?: () => void;
  moveSelect?: ReactNode;
}) {
  // real thumbnails so a pile of refs / saved images is scannable — staged image
  // files read off disk, saved board images decrypt through the store.
  const [thumb, setThumb] = useState<string | null>(null);
  const isFileImage = isTrayImageFile(entry);
  const isItemImage = entry.kind === "item" && !confidential && !!item && contentType(item) === "image";
  useEffect(() => {
    let on = true;
    setThumb(null);
    if (isFileImage && entry.path) void readImageAsDataUrl(entry.path).then((d) => on && setThumb(d)).catch(() => {});
    else if (isItemImage && item) void getImageDataUrl(item.id).then((d) => on && setThumb(d)).catch(() => {});
    return () => {
      on = false;
    };
  }, [entry.path, entry.kind, isFileImage, isItemImage, item?.id]);

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
  const canDragOut = !confidential; // never drag a secret out of Quickboard
  const draggable = canDragOut;
  const showCheck = selected || anySelected || !!moveSelect;
  const cursor = canPaste ? "cursor-pointer" : draggable ? "cursor-grab active:cursor-grabbing" : "cursor-default";
  const hint = moveSelect
    ? canDragOut
      ? canPaste
        ? "Click to paste, drag out, or use Move"
        : "Drag out, or use Move"
      : canPaste
        ? "Click to paste or use Move"
        : "Use Move to organize"
    : canPaste
      ? "click to paste"
      : canDragOut
        ? "drag out"
        : "open in app";

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
        "group/row relative flex select-none items-center gap-2.5 rounded-[12px] py-2.5 pl-1.5 pr-2 transition-colors",
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

      <motion.span whileHover={{ scale: 1.08 }} transition={{ type: "spring", stiffness: 400, damping: 18 }} className="relative z-10 grid h-9 w-9 shrink-0 place-items-center overflow-hidden rounded-[9px]" style={{ color: tintColor }}>
        {thumb ? (
          <motion.img
            src={thumb}
            alt=""
            draggable={false}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.25, ease: EASE }}
            className="h-full w-full rounded-[9px] object-cover ring-1 ring-inset ring-black/[0.07]"
          />
        ) : (
          <Icon size={19} strokeWidth={1.9} />
        )}
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
            <motion.span key="actions" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className={cn("flex items-center gap-0.5 transition-opacity", moveSelect ? "opacity-100" : "opacity-0 group-hover/row:opacity-100")}>
              {moveSelect}
              {canPaste && (
                <motion.button whileTap={{ scale: 0.85 }} type="button" onClick={(ev) => { ev.stopPropagation(); onPaste(); }} aria-label="Paste at cursor" className="grid h-6 w-6 place-items-center rounded-[7px] text-[var(--muted)] hover:bg-black/[0.06]">
                  <CornerDownLeft size={12} />
                </motion.button>
              )}
              {onRemove && (
                <motion.button whileTap={{ scale: 0.85 }} type="button" onClick={(ev) => { ev.stopPropagation(); onRemove(); }} aria-label="Remove" className="grid h-6 w-6 place-items-center rounded-[7px] text-[var(--faint)] hover:bg-black/[0.06] hover:text-[#b4424f]">
                  <X size={12} />
                </motion.button>
              )}
            </motion.span>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}

function TabButton({ active, onClick, icon: Icon, label, count, seg = "tray-tab" }: { active: boolean; onClick: () => void; icon: LucideIcon; label: string; count: number; seg?: string }) {
  return (
    <button type="button" aria-pressed={active} onClick={onClick} className="relative rounded-[8px] px-2 py-1">
      {active && <motion.span layoutId={seg} transition={{ type: "spring", stiffness: 520, damping: 36 }} className="absolute inset-0 rounded-[8px] bg-white shadow-[0_1px_2px_rgba(0,0,0,0.09),0_1px_1px_rgba(0,0,0,0.04)]" />}
      <span className={cn("relative z-10 flex items-center gap-1.5 text-[11.5px] font-semibold transition-colors", active ? "text-[var(--ink)]" : "text-[var(--muted)]")}>
        <Icon size={12.5} strokeWidth={2.2} />
        {label}
        {count > 0 && <span className={cn("grid h-[15px] min-w-[15px] place-items-center rounded-full px-1 text-[9.5px] font-bold tabular", active ? "bg-black/[0.07] text-[var(--muted)]" : "bg-black/[0.05] text-[var(--faint)]")}>{count}</span>}
      </span>
    </button>
  );
}

// The ad-hoc "lane" chips under the Shelf tabs: All · <lanes> · Unsorted · +.
// Click a chip to filter. The active lane carries a ⋯ menu (Rename / Delete);
// + creates one. The ⋯ menu renders through a portal so the scrolling chip row
// can't clip it.
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
          <LaneInput key={l} value={draft} onChange={setDraft} onCommit={commit} onCancel={cancel} placeholder="Lane name" />
        ) : (
          <LaneChip
            key={l}
            label={l}
            count={tray.filter((e) => e.lane === l).length}
            active={active === l}
            onClick={() => onChoose(l)}
            onRename={() => { setEditing(l); setDraft(l); }}
            onDelete={() => onDelete(l)}
          />
        ),
      )}
      {unsorted > 0 && <LaneChip label="Unsorted" icon={Inbox} count={unsorted} active={active === ""} onClick={() => onChoose("")} />}
      {editing === "" ? (
        <LaneInput value={draft} onChange={setDraft} onCommit={commit} onCancel={cancel} placeholder="New lane" />
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
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const dotsRef = useRef<HTMLButtonElement>(null);
  const manageable = active && !!onRename && !!onDelete;

  useEffect(() => {
    if (!menu) return;
    const close = () => setMenu(null);
    window.addEventListener("click", close);
    window.addEventListener("resize", close);
    return () => {
      window.removeEventListener("click", close);
      window.removeEventListener("resize", close);
    };
  }, [menu]);

  const body = (
    <>
      {Icon && <Icon size={11} strokeWidth={2.3} />}
      <span className="max-w-[96px] truncate">{label}</span>
      <span className={cn("tabular", active ? "text-white/55" : "text-[var(--faint)]")}>{count}</span>
    </>
  );
  if (!manageable) {
    return (
      <motion.button
        type="button"
        onClick={onClick}
        whileTap={{ scale: 0.93 }}
        transition={{ type: "spring", stiffness: 600, damping: 26 }}
        className={cn(
          "relative flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold transition-colors",
          active ? "text-white" : "bg-black/[0.05] text-[var(--muted)] hover:bg-black/[0.08]",
        )}
      >
        {active && <motion.span layoutId="lane-pill" transition={{ type: "spring", stiffness: 520, damping: 36 }} className="absolute inset-0 rounded-full bg-[var(--ink)]" />}
        <span className="relative z-10 flex items-center gap-1">{body}</span>
      </motion.button>
    );
  }

  return (
    <div className="relative flex shrink-0 items-center rounded-full py-1 pl-2.5 pr-1 text-[11px] font-semibold text-white">
      <motion.span layoutId="lane-pill" transition={{ type: "spring", stiffness: 520, damping: 36 }} className="absolute inset-0 rounded-full bg-[var(--ink)]" />
      <button type="button" onClick={onClick} className="relative z-10 flex items-center gap-1">
        {body}
      </button>
      <button
        ref={dotsRef}
        type="button"
        aria-label="Lane options"
        onClick={(e) => {
          e.stopPropagation();
          if (menu) {
            setMenu(null);
            return;
          }
          const r = dotsRef.current?.getBoundingClientRect();
          if (r) setMenu({ x: Math.min(r.left, window.innerWidth - 152), y: r.bottom + 6 });
        }}
        className="relative z-10 ml-1 grid h-[18px] w-[18px] place-items-center rounded-full text-white/70 transition-colors hover:bg-white/15 hover:text-white"
      >
        <MoreHorizontal size={12} strokeWidth={2.4} />
      </button>
      {menu &&
        createPortal(
          <motion.div
            onClick={(e) => e.stopPropagation()}
            initial={{ opacity: 0, scale: 0.92, y: -4 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            transition={{ duration: 0.14, ease: EASE }}
            style={{ position: "fixed", left: menu.x, top: menu.y, zIndex: 80, transformOrigin: "top left" }}
            className="min-w-[140px] overflow-hidden rounded-[11px] border border-black/[0.08] bg-white p-1 text-[var(--ink)] shadow-[0_12px_34px_-10px_rgba(0,0,0,0.5)]"
          >
            <button type="button" onClick={() => { setMenu(null); onRename?.(); }} className="flex w-full items-center gap-2 rounded-[8px] px-2.5 py-1.5 text-left text-[12px] font-semibold transition-colors hover:bg-black/[0.05]">
              <Pencil size={12} className="text-[var(--muted)]" /> Rename
            </button>
            <button type="button" onClick={() => { setMenu(null); onDelete?.(); }} className="flex w-full items-center gap-2 rounded-[8px] px-2.5 py-1.5 text-left text-[12px] font-semibold text-[#b4424f] transition-colors hover:bg-[#b4424f]/[0.08]">
              <Trash2 size={12} /> Delete
            </button>
          </motion.div>,
          document.body,
        )}
    </div>
  );
}

function LaneInput({ value, onChange, onCommit, onCancel, placeholder = "Lane name" }: { value: string; onChange: (v: string) => void; onCommit: () => void; onCancel: () => void; placeholder?: string }) {
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
        placeholder={placeholder}
        className="w-[88px] bg-transparent text-[11px] font-semibold text-[var(--ink)] placeholder:font-medium placeholder:text-[var(--fainter)] focus:outline-none"
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

function LaneMoveSelect({ lanes, onMove }: { lanes: string[]; onMove: (lane: string | undefined) => void }) {
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const ref = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!menu) return;
    const close = () => setMenu(null);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("click", close);
    window.addEventListener("resize", close);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("click", close);
      window.removeEventListener("resize", close);
      window.removeEventListener("keydown", onKey);
    };
  }, [menu]);

  function openMenu() {
    const r = ref.current?.getBoundingClientRect();
    if (!r) return;
    setMenu({ x: Math.max(8, Math.min(r.left, window.innerWidth - 154)), y: Math.max(8, Math.min(r.bottom + 6, window.innerHeight - 158)) });
  }

  function choose(lane: string | undefined) {
    onMove(lane);
    setMenu(null);
    ref.current?.focus();
  }

  return (
    <>
      <button
        ref={ref}
        type="button"
        aria-haspopup="menu"
        aria-expanded={!!menu}
        aria-label="Move to lane"
        onMouseDown={(e) => e.stopPropagation()}
        onClick={(e) => {
          e.stopPropagation();
          if (menu) setMenu(null);
          else openMenu();
        }}
        title="Move to lane"
        className="flex h-6 w-8 shrink-0 items-center justify-center gap-0.5 rounded-[7px] bg-black/[0.05] text-[var(--muted)] outline-none transition-colors hover:bg-black/[0.08] hover:text-[var(--ink)] focus-visible:ring-2 focus-visible:ring-[var(--ink)]/25"
      >
        <FolderInput size={12} />
        <ChevronDown size={9} className={cn("transition-transform", menu && "rotate-180")} />
      </button>
      {menu &&
        createPortal(
          <motion.div
            role="menu"
            aria-label="Move to lane"
            onClick={(e) => e.stopPropagation()}
            initial={{ opacity: 0, scale: 0.96, y: -3 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97, y: -2 }}
            transition={{ duration: 0.12, ease: EASE }}
            style={{ position: "fixed", left: menu.x, top: menu.y, zIndex: 80, transformOrigin: "top left" }}
            className="max-h-[150px] min-w-[146px] overflow-y-auto rounded-[11px] border border-black/[0.08] bg-white p-1 text-[var(--ink)] shadow-[0_12px_34px_-10px_rgba(0,0,0,0.5)] [&::-webkit-scrollbar]:hidden"
          >
            {lanes.map((lane) => (
              <button key={lane} type="button" role="menuitem" onClick={() => choose(lane)} className="flex w-full items-center gap-2 rounded-[8px] px-2 py-1.5 text-left text-[12px] font-semibold transition-colors hover:bg-black/[0.05] focus-visible:bg-black/[0.05] focus-visible:outline-none">
                <Layers size={12} className="shrink-0 text-[var(--muted)]" /> <span className="truncate">{lane}</span>
              </button>
            ))}
            <button type="button" role="menuitem" onClick={() => choose(undefined)} className="flex w-full items-center gap-2 rounded-[8px] px-2 py-1.5 text-left text-[12px] font-medium text-[var(--muted)] transition-colors hover:bg-black/[0.05] focus-visible:bg-black/[0.05] focus-visible:outline-none">
              <Inbox size={12} className="shrink-0" /> Unsorted
            </button>
          </motion.div>,
          document.body,
        )}
    </>
  );
}

function ClearClipsMenu({ onClear }: { onClear: (seconds?: number) => void }) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    window.addEventListener("click", close);
    return () => window.removeEventListener("click", close);
  }, [open]);

  return (
    <div className="relative ml-auto">
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setOpen((o) => !o);
        }}
        className="flex items-center gap-1.5 rounded-[9px] px-2.5 py-1.5 text-[11.5px] font-medium text-[var(--muted)] transition-colors hover:bg-black/[0.05]"
      >
        <Trash2 size={13} /> Clear <ChevronDown size={11} className={cn("transition-transform", open && "rotate-180")} />
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 6, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 4, scale: 0.98 }}
            transition={{ duration: 0.14 }}
            onClick={(e) => e.stopPropagation()}
            className="absolute bottom-full right-0 z-[60] mb-1.5 min-w-[150px] overflow-hidden rounded-[11px] border border-black/[0.08] bg-white p-1 shadow-[0_10px_30px_-10px_rgba(0,0,0,0.45)]"
          >
            <div className="px-2 pb-1 pt-0.5 text-[10px] font-bold uppercase tracking-wide text-[var(--fainter)]">Clear recent</div>
            <button type="button" onClick={() => { onClear(15 * 60); setOpen(false); }} className="flex w-full items-center gap-2 rounded-[8px] px-2 py-1.5 text-left text-[12px] font-semibold text-[var(--ink)] hover:bg-black/[0.05]">
              Last 15 min
            </button>
            <button type="button" onClick={() => { onClear(60 * 60); setOpen(false); }} className="flex w-full items-center gap-2 rounded-[8px] px-2 py-1.5 text-left text-[12px] font-semibold text-[var(--ink)] hover:bg-black/[0.05]">
              Last hour
            </button>
            <button type="button" onClick={() => { onClear(undefined); setOpen(false); }} className="flex w-full items-center gap-2 rounded-[8px] px-2 py-1.5 text-left text-[12px] font-semibold text-[#b4424f] hover:bg-[#b4424f]/[0.08]">
              All clips
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// Board mode: pick the environment to pull from, then multi-select categories.
function BoardControls({
  env,
  envOptions,
  items,
  cats,
  catList,
  onChangeEnv,
  onToggleCat,
  onAllCats,
}: {
  env: string;
  envOptions: string[];
  items: Item[];
  cats: Set<string>;
  catList: string[];
  onChangeEnv: (env: string) => void;
  onToggleCat: (c: string) => void;
  onAllCats: () => void;
}) {
  const envCount = items.filter((i) => i.environment === env).length;
  return (
    <div className="flex shrink-0 items-center gap-1 overflow-x-auto px-2.5 pb-1.5 pt-1 [&::-webkit-scrollbar]:hidden">
      <EnvPicker value={env} options={envOptions} onChange={onChangeEnv} />
      <CatChip label="All" count={envCount} active={cats.size === 0} onClick={onAllCats} />
      {catList.map((c) => (
        <CatChip key={c} label={c} count={items.filter((i) => i.environment === env && i.category === c).length} active={cats.has(c)} onClick={() => onToggleCat(c)} />
      ))}
    </div>
  );
}

function EnvPicker({ value, options, onChange }: { value: string; options: string[]; onChange: (v: string) => void }) {
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const ref = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!menu) return;
    const close = () => setMenu(null);
    window.addEventListener("click", close);
    window.addEventListener("resize", close);
    return () => {
      window.removeEventListener("click", close);
      window.removeEventListener("resize", close);
    };
  }, [menu]);
  return (
    <>
      <button
        ref={ref}
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          if (menu) {
            setMenu(null);
            return;
          }
          const r = ref.current?.getBoundingClientRect();
          if (r) setMenu({ x: r.left, y: r.bottom + 6 });
        }}
        className="flex shrink-0 items-center gap-1 rounded-[9px] bg-black/[0.05] px-2.5 py-1.5 text-[12px] font-semibold text-[var(--ink)] transition-colors hover:bg-black/[0.08]"
      >
        <span className="max-w-[100px] truncate">{value || "Environment"}</span>
        <ChevronDown size={13} className={cn("shrink-0 text-[var(--muted)] transition-transform", menu && "rotate-180")} />
      </button>
      {menu &&
        createPortal(
          <motion.div
            onClick={(e) => e.stopPropagation()}
            initial={{ opacity: 0, scale: 0.92, y: -4 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            transition={{ duration: 0.14, ease: EASE }}
            style={{ position: "fixed", left: menu.x, top: menu.y, zIndex: 80, transformOrigin: "top left" }}
            className="max-h-[220px] min-w-[160px] overflow-y-auto rounded-[11px] border border-black/[0.08] bg-white p-1 shadow-[0_12px_34px_-10px_rgba(0,0,0,0.5)] [&::-webkit-scrollbar]:hidden"
          >
            {options.length === 0 ? (
              <div className="px-2.5 py-2 text-[12px] text-[var(--faint)]">No environments yet</div>
            ) : (
              options.map((o) => (
                <button key={o} type="button" onClick={() => { onChange(o); setMenu(null); }} className={cn("flex w-full items-center gap-2 rounded-[8px] px-2.5 py-1.5 text-left text-[12px] font-semibold transition-colors hover:bg-black/[0.05]", o === value ? "text-[var(--ink)]" : "text-[var(--muted)]")}>
                  {o}
                  {o === value && <Check size={12} className="ml-auto text-[var(--ink)]" />}
                </button>
              ))
            )}
          </motion.div>,
          document.body,
        )}
    </>
  );
}

function CatChip({ label, count, active, onClick }: { label: string; count: number; active: boolean; onClick: () => void }) {
  return (
    <motion.button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      whileTap={{ scale: 0.93 }}
      transition={{ type: "spring", stiffness: 600, damping: 26 }}
      className={cn(
        "flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold transition-colors",
        active ? "bg-[var(--ink)] text-white" : "bg-black/[0.05] text-[var(--muted)] hover:bg-black/[0.08]",
      )}
    >
      <span className="max-w-[110px] truncate">{label}</span>
      <span className={cn("tabular", active ? "text-white/55" : "text-[var(--faint)]")}>{count}</span>
    </motion.button>
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

function ClipRow({
  clip,
  flash,
  onPaste,
  onSave,
  onStage,
  onRemove,
}: {
  clip: ClipEntry;
  flash: boolean;
  onPaste: () => void;
  onSave: () => void;
  onStage: () => void;
  onRemove: () => void;
}) {
  const Icon = clip.kind === "image" ? ImageIcon : clip.isUrl ? Link2 : StickyNote;
  const canDrag = clip.kind === "text" || (clip.kind === "image" && !!clip.path);
  const preview = clipPreview(clip);
  const source = clip.sourceApp?.trim();
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
              if (clip.kind === "image" && clip.path) void dragPathOut(clip.path, true);
              else void dragTextOut(clip.value ?? "", clip.label);
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
        {clip.kind === "image" && clip.thumb ? <img src={clip.thumb} alt="" draggable={false} className="h-full w-full object-cover" /> : <Icon size={16} strokeWidth={1.9} />}
      </span>
      <span className="relative z-10 min-w-0 flex-1">
        <span className="block truncate text-[12.5px] font-semibold tracking-[-0.01em] text-[var(--ink)]">{clip.label}</span>
        <span className="block truncate text-[10.5px] text-[var(--faint)]">{preview && preview !== clip.label ? preview : source ? `From ${source}` : relativeTime(clip.ts)}</span>
        {preview && preview !== clip.label && <span className="block truncate text-[10px] text-[var(--fainter)] tabular">{source ? `${source} · ${relativeTime(clip.ts)}` : relativeTime(clip.ts)}</span>}
      </span>
      <div className="relative z-10 flex shrink-0 items-center gap-0.5">
        {(clip.kind === "text" || clip.kind === "image") && (
          <>
            <motion.button whileTap={{ scale: 0.85 }} type="button" onClick={(ev) => { ev.stopPropagation(); onPaste(); }} aria-label="Paste at cursor" title="Paste" className="grid h-6 w-6 place-items-center rounded-[7px] text-[var(--muted)] hover:bg-black/[0.06]">
              <CornerDownLeft size={12} />
            </motion.button>
            <motion.button whileTap={{ scale: 0.85 }} type="button" onClick={(ev) => { ev.stopPropagation(); onSave(); }} aria-label="Save to board" title="Save" className="grid h-6 w-6 place-items-center rounded-[7px] text-[var(--muted)] hover:bg-black/[0.06]">
              <Bookmark size={12} />
            </motion.button>
            <motion.button whileTap={{ scale: 0.85 }} type="button" onClick={(ev) => { ev.stopPropagation(); onStage(); }} aria-label="Stage in Shelf" title="Stage" className="grid h-6 w-6 place-items-center rounded-[7px] text-[var(--muted)] hover:bg-black/[0.06]">
              <FolderInput size={12} />
            </motion.button>
          </>
        )}
        <motion.button whileTap={{ scale: 0.85 }} type="button" onClick={(ev) => { ev.stopPropagation(); onRemove(); }} aria-label="Remove" title="Remove" className="grid h-6 w-6 place-items-center rounded-[7px] text-[var(--faint)] hover:bg-black/[0.06] hover:text-[#b4424f]">
          <X size={12} />
        </motion.button>
      </div>
    </motion.div>
  );
}
