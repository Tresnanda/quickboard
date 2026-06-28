// The "Clipboard" lane — a rolling history of what you copy, separate from the
// curated Shelf. Capture (background monitoring + skipping password copies) lands
// in a later step; this is the store + reactive binding the lane renders from.
// Client-side, localStorage-backed, shared across windows (same origin).

import { useSyncExternalStore } from "react";

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

let cache: ClipEntry[] | null = null;
const listeners = new Set<() => void>();

function read(): ClipEntry[] {
  if (cache) return cache;
  let value: ClipEntry[] = [];
  try {
    const parsed = JSON.parse(localStorage.getItem(KEY) || "[]");
    if (Array.isArray(parsed)) value = parsed;
  } catch {
    /* defaults */
  }
  cache = value;
  return value;
}

function write(next: ClipEntry[]): void {
  cache = next;
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* ignore */
  }
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

/** Push a fresh copy to the front, de-duping an immediate repeat, capping the buffer. */
export function addClip(entry: Omit<ClipEntry, "id" | "ts">): void {
  const cur = read();
  const head = cur[0];
  // de-dupe an immediate repeat: same text value, or same image (identical thumb pixels)
  if (head && head.kind === entry.kind && (head.value ?? "") === (entry.value ?? "") && (head.thumb ?? "") === (entry.thumb ?? "") && head.label === entry.label && (head.sourceApp ?? "") === (entry.sourceApp ?? "")) return;
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
  window.addEventListener("storage", (e) => {
    if (e.key === KEY || e.key === null) {
      cache = null;
      listeners.forEach((l) => l());
    }
  });
}
