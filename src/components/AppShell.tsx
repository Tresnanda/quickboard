import { useEffect, useRef } from "react";
import { Outlet, useRouterState } from "@tanstack/react-router";
import { AnimatePresence, MotionConfig, motion } from "framer-motion";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { Sparkles } from "lucide-react";
import { useItems } from "../lib/items-store";
import { useSettings } from "../lib/settings";
import { addClip, labelForClipValue, nextPastedImageLabel, shouldSuppressClipboardCapture, shouldSuppressImageCapture } from "../lib/clipboard";
import { existingPaths, readImageAsDataUrl, sweepStagedFiles } from "../lib/ipc";
import { getTray, pruneDeadFiles } from "../lib/tray";
import { Sidebar } from "./Sidebar";
import { DetailModal } from "./DetailModal";
import { NewItemSheet } from "./NewItemSheet";
import { CommitSheet } from "./CommitSheet";
import { CommandPalette } from "./CommandPalette";
import { AccessibilityBanner } from "./AccessibilityBanner";
import { TrayNudge } from "./TrayNudge";
import { Onboarding } from "./Onboarding";
import { useConfetti } from "./Confetti";
import { useToast } from "./Toast";

/** Downscale a full-res image data-url to a small preview thumbnail for the lane. */
function makeThumb(dataUrl: string, max = 88): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, max / Math.max(img.width, img.height));
      const w = Math.max(1, Math.round(img.width * scale));
      const h = Math.max(1, Math.round(img.height * scale));
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        resolve(dataUrl);
        return;
      }
      ctx.drawImage(img, 0, 0, w, h);
      try {
        resolve(canvas.toDataURL("image/webp", 0.8));
      } catch {
        resolve(canvas.toDataURL("image/png"));
      }
    };
    img.onerror = () => reject(new Error("thumbnail decode failed"));
    img.src = dataUrl;
  });
}

/**
 * The window. A warm canvas with two floating rounded cards — sidebar + main —
 * and a gap between them (the "two-card" shell). Tauri Overlay titlebar: traffic
 * lights float over the sidebar card's top strip. Global surfaces (detail modal,
 * new-item sheet, ⌘K palette) mount once here.
 *
 * MotionConfig(reducedMotion="user") makes every animation in the app collapse to
 * instant when the OS "Reduce motion" setting is on.
 */
export function AppShell() {
  const { items, setAddOpen, setPaletteOpen, setCommitOpen, setCommitIds, setCommitCategory } = useItems();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const fire = useConfetti();
  const toast = useToast();
  const settings = useSettings();

  // apply density + reduce-motion preferences to the document for CSS to key off
  useEffect(() => {
    const root = document.documentElement;
    root.dataset.density = settings.density;
    root.dataset.reduceMotion = settings.reduceMotion ? "true" : "false";
  }, [settings.density, settings.reduceMotion]);

  // Milestone celebration — confetti cannons when the board crosses a round number.
  const prevCount = useRef(items.length);
  useEffect(() => {
    const prev = prevCount.current;
    const now = items.length;
    prevCount.current = now;
    if (now > prev && prev > 0 && [5, 10, 25, 50, 100, 250].includes(now)) {
      fire(window.innerWidth * 0.12, window.innerHeight);
      fire(window.innerWidth * 0.88, window.innerHeight);
      window.setTimeout(() => fire(window.innerWidth / 2, window.innerHeight * 0.6), 180);
      toast({ message: `${now} items — your board is thriving!`, icon: <Sparkles size={14} strokeWidth={2.2} />, tone: "gold" });
    }
  }, [items.length, fire, toast]);

  // Startup reconcile of the Shelf's staged image files. The tray keeps a file's
  // path forever (localStorage), but staged bytes used to live in the OS temp dir
  // and got reaped after ~3 days — a staged image would silently "turn into a
  // file". Bytes now live in a durable dir; on launch we (1) prune entries whose
  // file is already gone (unrecoverable) and (2) reclaim orphaned staged files no
  // entry points at. Main window only (always loaded, single instance); no undo
  // survives a restart, so an unreferenced staged file is a true orphan.
  useEffect(() => {
    void (async () => {
      try {
        const paths = getTray().filter((e) => e.kind === "file" && e.path).map((e) => e.path as string);
        const alive = paths.length ? await existingPaths(paths) : [];
        pruneDeadFiles(new Set(alive));
        await sweepStagedFiles(alive);
      } catch {
        /* best-effort maintenance */
      }
    })();
  }, []);

  // Clipboard history capture — the main window owns it (it's always loaded, even
  // hidden in the background). The Rust watcher only reads/emits while enabled; we
  // mirror each fresh copy into the shared store the tray's Clipboard lane renders.
  useEffect(() => {
    const enabled = settings.clipboardHistory;
    void invoke("set_clipboard_watch", { enabled });
    if (!enabled) return;
    const un = listen<{ kind?: string; value?: string; isUrl?: boolean; path?: string; sourceApp?: string | null }>("clipboard:new", async (e) => {
      const sourceApp = e.payload?.sourceApp?.trim() || undefined;
      if (e.payload?.kind === "image") {
        const path = e.payload?.path;
        if (!path) return;
        // sync check before any await, so the suppress window isn't lost to a race
        if (shouldSuppressImageCapture()) return;
        try {
          const full = await readImageAsDataUrl(path);
          const thumb = await makeThumb(full);
          addClip({ kind: "image", path, thumb, mime: "image/png", label: nextPastedImageLabel(), sourceApp });
        } catch {
          /* best-effort */
        }
        return;
      }
      const value = e.payload?.value;
      if (!value) return;
      if (shouldSuppressClipboardCapture(value)) return;
      addClip({ kind: "text", value, label: labelForClipValue(value), isUrl: !!e.payload?.isUrl, sourceApp });
    });
    return () => {
      void un.then((f) => f());
    };
  }, [settings.clipboardHistory]);

  // The tray's "Save to board" lives in another webview, so it brings this window
  // forward (open_commit) and asks us to open the batch-commit modal here — the
  // commit must happen in this context for the board to refresh.
  useEffect(() => {
    const un = listen<{ ids: string[]; category: string }>("board:commit-tray", (e) => {
      setCommitIds(e.payload?.ids ?? []);
      setCommitCategory(e.payload?.category ?? "");
      setCommitOpen(true);
    });
    return () => {
      void un.then((f) => f());
    };
  }, [setCommitOpen, setCommitIds, setCommitCategory]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const meta = e.metaKey || e.ctrlKey;
      if (!meta) return;
      const k = e.key.toLowerCase();
      if (k === "k") {
        e.preventDefault();
        setPaletteOpen(true);
      } else if (k === "n") {
        e.preventDefault();
        setAddOpen(true);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [setAddOpen, setPaletteOpen]);

  return (
    <MotionConfig reducedMotion={settings.reduceMotion ? "always" : "user"}>
      <div
        data-tauri-drag-region
        className="flex h-screen w-screen gap-2 overflow-hidden bg-[var(--canvas)] p-2 text-[var(--text)]"
      >
        <Sidebar />
        <main className="relative flex min-w-0 flex-1 flex-col overflow-hidden rounded-[18px] border border-[var(--border)] bg-[var(--board)] shadow-[var(--shadow-shell)]">
          <AccessibilityBanner />
          <TrayNudge />
          <AnimatePresence mode="wait">
            <motion.div
              key={pathname}
              className="flex h-full flex-col"
              style={{ willChange: "opacity, filter" }}
              initial={{ opacity: 0, filter: "blur(6px)" }}
              animate={{ opacity: 1, filter: "blur(0.01px)" }}
              exit={{ opacity: 0, filter: "blur(6px)" }}
              transition={{ duration: 0.24, ease: [0.23, 1, 0.32, 1] }}
            >
              <Outlet />
            </motion.div>
          </AnimatePresence>
        </main>

        <DetailModal />
        <NewItemSheet />
        <CommitSheet />
        <CommandPalette />
        <Onboarding />
      </div>
    </MotionConfig>
  );
}
