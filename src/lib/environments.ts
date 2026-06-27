// Environments are derived from items on the backend (DISTINCT environment), so an
// empty one wouldn't survive there. We keep user-created environments client-side
// (localStorage) and merge them with the item-derived list, so a fresh empty
// environment shows up immediately and persists until items fill it in. Per-environment
// icon/color live in the appearance store under `env:${name}`.

import { useSyncExternalStore } from "react";
import { emit, listen } from "@tauri-apps/api/event";

const KEY = "qb_environments_v1";
let cache: string[] | null = null;
const listeners = new Set<() => void>();

function read(): string[] {
  if (cache) return cache;
  try {
    const parsed = JSON.parse(localStorage.getItem(KEY) || "[]");
    cache = Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === "string") : [];
  } catch {
    cache = [];
  }
  return cache;
}

function write(next: string[]): void {
  cache = next;
  let stored = false;
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
    stored = true;
  } catch {
    /* quota / unavailable — keep in-memory */
  }
  listeners.forEach((l) => l());
  if (stored) void emit("environments:changed").catch(() => {});
}

export function getEnvironments(): string[] {
  return read();
}

export function addEnvironment(name: string): void {
  const n = name.trim();
  if (!n) return;
  const cur = read();
  if (cur.some((e) => e.toLowerCase() === n.toLowerCase())) return;
  write([...cur, n]);
}

export function removeEnvironment(name: string): void {
  const cur = read();
  const next = cur.filter((e) => e !== name);
  if (next.length !== cur.length) write(next);
}

function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  const refresh = () => {
    cache = null;
    cb();
  };
  const onStorage = (event: StorageEvent) => {
    if (event.key === KEY) refresh();
  };
  window.addEventListener("storage", onStorage);
  const un = listen("environments:changed", refresh);
  return () => {
    listeners.delete(cb);
    window.removeEventListener("storage", onStorage);
    void un.then((f) => f());
  };
}

export function useEnvironments(): string[] {
  return useSyncExternalStore(subscribe, getEnvironments, getEnvironments);
}
