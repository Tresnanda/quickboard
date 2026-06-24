// Environments are derived from items on the backend (DISTINCT environment), so an
// empty one wouldn't survive there. We keep user-created environments client-side
// (localStorage) and merge them with the item-derived list, so a fresh empty
// environment shows up immediately and persists until items fill it in. Per-environment
// icon/color live in the appearance store under `env:${name}`.

import { useSyncExternalStore } from "react";

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
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* quota / unavailable — keep in-memory */
  }
  listeners.forEach((l) => l());
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
  return () => listeners.delete(cb);
}

export function useEnvironments(): string[] {
  return useSyncExternalStore(subscribe, getEnvironments, getEnvironments);
}
