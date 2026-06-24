// Client-side personalization store ("the wardrobe"). The Rust backend stores
// only Text|File + category/confidential/pinned; everything the user *dresses*
// onto an item — its tint, icon, rich content type, optional cover — lives here,
// keyed by item id, persisted to localStorage. Local-first app, local-only data.
//
// Kept deliberately swappable: if we later promote personalization into the Rust
// model, only this module changes.

import { useSyncExternalStore } from "react";
import type { ContentType } from "./types";
import type { TintName } from "./tints";
import type { IconName } from "./icons";

export type Appearance = {
  tint?: TintName;
  icon?: IconName;
  type?: ContentType; // explicit content type chosen at create time
  cover?: string; // optional cover image (data URL / asset src)
};

const KEY = "qb:appearance:v1";
const EMPTY: Appearance = {};
type Store = Record<string, Appearance>;

function load(): Store {
  try {
    return JSON.parse(localStorage.getItem(KEY) || "{}") as Store;
  } catch {
    return {};
  }
}

let store: Store = load();
const listeners = new Set<() => void>();

function persist() {
  try {
    localStorage.setItem(KEY, JSON.stringify(store));
  } catch {
    /* ignore quota / private-mode failures */
  }
  listeners.forEach((l) => l());
}

export function getAppearance(id: string): Appearance {
  return store[id] ?? EMPTY;
}

export function setAppearance(id: string, patch: Partial<Appearance>): void {
  const next: Appearance = { ...store[id], ...patch };
  for (const k of Object.keys(next) as (keyof Appearance)[]) {
    if (next[k] === undefined) delete next[k];
  }
  store = { ...store, [id]: next };
  persist();
}

export function clearAppearance(id: string): void {
  if (!(id in store)) return;
  const next = { ...store };
  delete next[id];
  store = next;
  persist();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Subscribe a component to one item's appearance (re-renders on change). */
export function useAppearance(id: string): Appearance {
  return useSyncExternalStore(
    subscribe,
    () => getAppearance(id),
    () => EMPTY,
  );
}
