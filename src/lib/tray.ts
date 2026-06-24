// The "tray" — a temporary staging shelf you fill from the ⌥Space panel. Holds
// references to board items (collected to paste one-by-one) and captured text
// (staged before committing to the board). Client-side, reactive, shared across
// windows via localStorage (same origin).

import { useSyncExternalStore } from "react";

export type TrayEntry = {
  id: string;
  kind: "item" | "text" | "file";
  label: string;
  itemId?: string; // kind "item" — board item reference (value fetched on paste)
  value?: string; // kind "text" — captured content
  path?: string; // kind "file" — a dropped file staged temporarily
  isUrl?: boolean;
  lane?: string; // ad-hoc tray group (a "lane"); undefined = Unsorted
};

// entries not yet on the board (committable via the nudge / Save to board)
export function committable(entries: TrayEntry[]): TrayEntry[] {
  return entries.filter((e) => e.kind === "text" || e.kind === "file");
}

const KEY = "qb_tray_v1";

let cache: TrayEntry[] | null = null;
const listeners = new Set<() => void>();

function read(): TrayEntry[] {
  if (cache) return cache;
  let value: TrayEntry[] = [];
  try {
    const parsed = JSON.parse(localStorage.getItem(KEY) || "[]");
    if (Array.isArray(parsed)) value = parsed;
  } catch {
    /* defaults */
  }
  cache = value;
  return value;
}

function write(next: TrayEntry[]): void {
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

export function getTray(): TrayEntry[] {
  return read();
}

export function addToTray(entry: Omit<TrayEntry, "id">): void {
  const cur = read();
  // don't stage the same board item twice
  if (entry.kind === "item" && cur.some((e) => e.itemId === entry.itemId)) return;
  write([...cur, { ...entry, id: uid() }]);
}

export function removeFromTray(id: string): void {
  write(read().filter((e) => e.id !== id));
}

export function clearTray(): void {
  write([]);
  writeLanes([]); // empty tray → drop the (now pointless) lane structure too
}

/** Move a set of entries into a lane (undefined = back to Unsorted). */
export function moveToLane(ids: Iterable<string>, lane: string | undefined): void {
  const idSet = ids instanceof Set ? ids : new Set(ids);
  write(read().map((e) => (idSet.has(e.id) ? { ...e, lane } : e)));
}

// --- Lanes: ad-hoc, ordered group names the user creates to sort the shelf. Kept
// separately from entries so a freshly-created (still empty) lane persists. Lanes
// are tray-only and temporary — nothing here touches the board. ---

const LANES_KEY = "qb_tray_lanes_v1";
let lanesCache: string[] | null = null;
const lanesListeners = new Set<() => void>();

function readLanes(): string[] {
  if (lanesCache) return lanesCache;
  let value: string[] = [];
  try {
    const parsed = JSON.parse(localStorage.getItem(LANES_KEY) || "[]");
    if (Array.isArray(parsed)) value = parsed.filter((l): l is string => typeof l === "string");
  } catch {
    /* defaults */
  }
  lanesCache = value;
  return value;
}

function writeLanes(next: string[]): void {
  lanesCache = next;
  try {
    localStorage.setItem(LANES_KEY, JSON.stringify(next));
  } catch {
    /* ignore */
  }
  lanesListeners.forEach((l) => l());
}

export function getLanes(): string[] {
  return readLanes();
}

export function addLane(name: string): void {
  const n = name.trim();
  if (!n) return;
  const cur = readLanes();
  if (cur.includes(n)) return;
  writeLanes([...cur, n]);
}

export function renameLane(oldName: string, newName: string): void {
  const nn = newName.trim();
  if (!nn || nn === oldName) return;
  const cur = readLanes();
  // merge if the target name already exists, otherwise rename in place
  writeLanes(cur.includes(nn) ? cur.filter((l) => l !== oldName) : cur.map((l) => (l === oldName ? nn : l)));
  write(read().map((e) => (e.lane === oldName ? { ...e, lane: nn } : e)));
}

export function removeLane(name: string): void {
  writeLanes(readLanes().filter((l) => l !== name));
  // its items fall back to Unsorted — never deleted
  write(read().map((e) => (e.lane === name ? { ...e, lane: undefined } : e)));
}

function subscribeLanes(cb: () => void): () => void {
  lanesListeners.add(cb);
  return () => {
    lanesListeners.delete(cb);
  };
}

export function useLanes(): string[] {
  return useSyncExternalStore(subscribeLanes, getLanes, getLanes);
}

function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

export function useTray(): TrayEntry[] {
  return useSyncExternalStore(subscribe, getTray, getTray);
}

// Cross-window sync: the summon panel and the tray are separate webviews. A write
// in one fires `storage` in the others (same origin) — invalidate + re-render so the
// tray updates live instead of only on reload.
if (typeof window !== "undefined") {
  window.addEventListener("storage", (e) => {
    if (e.key === KEY || e.key === null) {
      cache = null;
      listeners.forEach((l) => l());
    }
    if (e.key === LANES_KEY || e.key === null) {
      lanesCache = null;
      lanesListeners.forEach((l) => l());
    }
  });
}
