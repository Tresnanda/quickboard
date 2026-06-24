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
  label: string;
  isUrl?: boolean;
  ts: number; // captured-at (unix seconds)
};

const KEY = "qb_clipboard_v1";
const CAP = 15; // rolling buffer — oldest fall off

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

function uid(): string {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

export function getClipboard(): ClipEntry[] {
  return read();
}

/** Push a fresh copy to the front, de-duping an immediate repeat, capping the buffer. */
export function addClip(entry: Omit<ClipEntry, "id" | "ts">): void {
  const cur = read();
  const head = cur[0];
  if (head && head.kind === entry.kind && (head.value ?? "") === (entry.value ?? "") && head.label === entry.label) return;
  write([{ ...entry, id: uid(), ts: Math.floor(Date.now() / 1000) }, ...cur].slice(0, CAP));
}

export function removeClip(id: string): void {
  write(read().filter((e) => e.id !== id));
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
