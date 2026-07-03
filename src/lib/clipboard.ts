// The "Clipboard" lane — a rolling history of what you copy, separate from the
// curated Shelf. It is the single most sensitive data class in the app, so the
// buffer persists through the Rust side encrypted with the board's DEK — NOT the
// webview's plaintext localStorage. The in-memory `cache` stays the synchronous
// source of truth the UI reads; persistence is async + debounced underneath, and
// cross-window sync rides a Tauri `clips:changed` event instead of `storage`.

import { useSyncExternalStore } from "react";
import { emit, listen } from "@tauri-apps/api/event";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import { clipHistoryLoad, clipHistorySave } from "./ipc";

export type ClipEntry = {
  id: string;
  kind: "text" | "image";
  value?: string; // kind "text"
  thumb?: string; // kind "image" — small data-url preview
  path?: string; // kind "image" — temp file holding the full-res bytes (paste/stage/save/drag)
  mime?: string; // kind "image" — e.g. "image/png"
  label: string;
  isUrl?: boolean;
  sourceApp?: string;
  ts: number; // captured-at (unix seconds)
};

const KEY = "qb_clipboard_v1";
const SUPPRESS_KEY = "qb_clipboard_suppress_v1";
const IMG_SUPPRESS_KEY = "qb_clipboard_img_suppress_v1";
export const CLIPBOARD_CAP = 100; // rolling buffer — oldest fall off
const SUPPRESS_TTL_MS = 5000;

const SAVE_DEBOUNCE_MS = 250;

let cache: ClipEntry[] | null = null;
const listeners = new Set<() => void>();

// This window's Tauri label ("main" | "summon" | "tray"), used to (a) ignore our
// own cross-window echo and (b) gate the one-shot localStorage migration to main.
function selfLabel(): string {
  try {
    return getCurrentWebviewWindow().label;
  } catch {
    return "main";
  }
}

// `cache` is the synchronous source of truth. Before the first async hydrate lands
// (or outside Tauri, e.g. tests) treat a null cache as empty.
function read(): ClipEntry[] {
  return cache ?? [];
}

let saveTimer: ReturnType<typeof setTimeout> | null = null;
// Persist the current buffer, encrypted, via the Rust side, and tell other windows.
// Fire-and-forget with a trailing debounce: a force-quit can lose the last quarter
// second of history — acceptable; do NOT make this synchronous over IPC.
function scheduleSave(): void {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    saveTimer = null;
    const json = JSON.stringify(cache ?? []);
    void clipHistorySave(json).catch(() => {
      /* best-effort persistence */
    });
    void emit("clips:changed", { source: selfLabel() }).catch(() => {
      /* best-effort cross-window nudge */
    });
  }, SAVE_DEBOUNCE_MS);
}

function write(next: ClipEntry[]): void {
  cache = next;
  listeners.forEach((l) => l());
  scheduleSave();
}

// Load the encrypted buffer from Rust into `cache` and notify. `force` re-hydrates
// even when a cache already exists (used when another window signals a change); the
// initial load bails if a synchronous write beat it, so it never clobbers fresh state.
// A decrypt failure (e.g. keychain locked) degrades to an empty lane, never a crash.
async function hydrate(force = false): Promise<void> {
  let loaded: ClipEntry[] = [];
  try {
    const parsed = JSON.parse(await clipHistoryLoad());
    if (Array.isArray(parsed)) loaded = parsed;
  } catch {
    loaded = [];
  }
  // One-shot migration off the legacy plaintext localStorage buffer. Only the main
  // window migrates (writes there aren't 3-way raced), and only on initial hydrate.
  if (!force && selfLabel() === "main") {
    try {
      const legacy = localStorage.getItem(KEY);
      if (legacy) {
        const parsed = JSON.parse(legacy);
        if (Array.isArray(parsed) && parsed.length) {
          const seen = new Set(loaded.map((e) => e.id));
          const merged = [...loaded, ...parsed.filter((e: ClipEntry) => e && !seen.has(e.id))]
            .sort((a, b) => b.ts - a.ts)
            .slice(0, CLIPBOARD_CAP);
          loaded = merged;
          void clipHistorySave(JSON.stringify(merged)).catch(() => {});
        }
        localStorage.removeItem(KEY);
      }
    } catch {
      /* best-effort migration */
    }
  }
  // A synchronous write may have populated the cache while we awaited the load —
  // on the initial (non-force) hydrate, don't overwrite it.
  if (!force && cache !== null) return;
  cache = loaded;
  listeners.forEach((l) => l());
}

type SuppressedClip = { value: string; ts: number };

function readSuppressions(now = Date.now()): SuppressedClip[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(SUPPRESS_KEY) || "[]");
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((e): e is SuppressedClip => typeof e?.value === "string" && typeof e?.ts === "number" && now - e.ts < SUPPRESS_TTL_MS);
  } catch {
    return [];
  }
}

function writeSuppressions(next: SuppressedClip[]): void {
  try {
    localStorage.setItem(SUPPRESS_KEY, JSON.stringify(next));
  } catch {
    /* ignore */
  }
}

function uid(): string {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

function compact(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

export function labelForClipValue(value: string): string {
  const first = value.split(/\r?\n/).find((line) => line.trim())?.trim() ?? "";
  if (/^https?:\/\//i.test(first)) {
    try {
      return new URL(first).hostname.replace(/^www\./, "") || "Link";
    } catch {
      /* fall through */
    }
  }
  return first.slice(0, 60) || "Copied";
}

export function clipPreview(clip: ClipEntry): string {
  return compact(clip.value ?? clip.label);
}

export function clipMatches(clip: ClipEntry, query: string): boolean {
  const q = compact(query).toLowerCase();
  if (!q) return true;
  return [clip.label, clip.value ?? "", clip.sourceApp ?? "", clip.isUrl ? "link" : "", clip.kind].some((v) => compact(v).toLowerCase().includes(q));
}

export function filterClips(clips: ClipEntry[], query: string): ClipEntry[] {
  return clips.filter((clip) => clipMatches(clip, query));
}

export function getClipboard(): ClipEntry[] {
  return read();
}

export function suppressClipboardCapture(value: string): void {
  if (!value) return;
  const now = Date.now();
  writeSuppressions([{ value, ts: now }, ...readSuppressions(now).filter((e) => e.value !== value)].slice(0, 10));
}

export function shouldSuppressClipboardCapture(value: string): boolean {
  const cur = readSuppressions();
  const idx = cur.findIndex((e) => e.value === value);
  if (idx === -1) {
    writeSuppressions(cur);
    return false;
  }
  cur.splice(idx, 1);
  writeSuppressions(cur);
  return true;
}

// Image copies carry no stable text key, so self-paste suppression is a short-lived
// timestamp instead: pasting an image re-writes the pasteboard, which the watcher
// would otherwise re-capture. Stamped here, consumed by the next image capture.
// Cross-window via localStorage (paste fires in the tray/summon webview; capture
// mirrors in the main window).
export function suppressImageCapture(): void {
  try {
    localStorage.setItem(IMG_SUPPRESS_KEY, String(Date.now()));
  } catch {
    /* ignore */
  }
}

export function shouldSuppressImageCapture(): boolean {
  try {
    const raw = localStorage.getItem(IMG_SUPPRESS_KEY);
    if (!raw) return false;
    const ts = Number(raw);
    if (!Number.isFinite(ts) || Date.now() - ts > SUPPRESS_TTL_MS) return false;
    localStorage.removeItem(IMG_SUPPRESS_KEY);
    return true;
  } catch {
    return false;
  }
}

// Captured images have no inherent name, so give each a unique, monotonic one —
// "Pasted image 1", "Pasted image 2", … — so a lane (or board) full of them stays
// distinguishable. Persists across sessions; only the main window captures, so the
// read-increment-write isn't raced.
const IMG_SEQ_KEY = "qb_clipboard_img_seq_v1";
export function nextPastedImageLabel(): string {
  let n = 1;
  try {
    n = (Number(localStorage.getItem(IMG_SEQ_KEY)) || 0) + 1;
    localStorage.setItem(IMG_SEQ_KEY, String(n));
  } catch {
    /* ignore */
  }
  return `Pasted image ${n}`;
}

/** Push a fresh copy to the front, de-duping an immediate repeat, capping the buffer. */
export function addClip(entry: Omit<ClipEntry, "id" | "ts">): void {
  const cur = read();
  const head = cur[0];
  // de-dupe an immediate repeat from the head: images by identical pixels (their
  // per-capture label is always unique), text by value + label.
  if (head && head.kind === entry.kind && (head.sourceApp ?? "") === (entry.sourceApp ?? "")) {
    const dup = entry.kind === "image" ? (head.thumb ?? "") === (entry.thumb ?? "") : (head.value ?? "") === (entry.value ?? "") && head.label === entry.label;
    if (dup) return;
  }
  write([{ ...entry, label: entry.label || labelForClipValue(entry.value ?? ""), id: uid(), ts: Math.floor(Date.now() / 1000) }, ...cur].slice(0, CLIPBOARD_CAP));
}

export function removeClip(id: string): void {
  write(read().filter((e) => e.id !== id));
}

export function clearClipsSince(cutoffTs?: number): ClipEntry[] {
  const cur = read();
  const removed = cutoffTs === undefined ? cur : cur.filter((e) => e.ts >= cutoffTs);
  write(cutoffTs === undefined ? [] : cur.filter((e) => e.ts < cutoffTs));
  return removed;
}

export function restoreClips(clips: ClipEntry[]): void {
  const cur = read();
  const seen = new Set(cur.map((e) => e.id));
  const restored = clips.filter((e) => {
    if (seen.has(e.id)) return false;
    seen.add(e.id);
    return true;
  });
  write([...restored, ...cur].sort((a, b) => b.ts - a.ts).slice(0, CLIPBOARD_CAP));
}

export function clearClipboard(): void {
  write([]);
}

function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

export function useClipboard(): ClipEntry[] {
  return useSyncExternalStore(subscribe, getClipboard, getClipboard);
}

if (typeof window !== "undefined") {
  // Initial load (each window hydrates its own in-memory cache from the encrypted
  // buffer; the main window also runs the one-shot localStorage migration).
  void hydrate();
  // Cross-window sync: another window persisted a change — re-hydrate ours. Ignore
  // our own echo so a save doesn't bounce back and clobber newer local state.
  void listen<{ source?: string }>("clips:changed", (e) => {
    if (e.payload?.source === selfLabel()) return;
    void hydrate(true);
  });
}
