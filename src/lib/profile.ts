// The local user profile (name, avatar color, optional photo, status). Client-side
// only — this is a single-user, local app. Surfaced on the sidebar "you" card and
// editable from there or Settings.

import { useSyncExternalStore } from "react";
import type { TintName } from "./tints";

export type Profile = {
  name: string;
  tint: TintName;
  photo?: string; // data URL
  status?: string;
};

const DEFAULTS: Profile = { name: "you", tint: "violet" };
const KEY = "qb_profile_v1";

let cache: Profile | null = null;
const listeners = new Set<() => void>();

function read(): Profile {
  if (cache) return cache;
  let value: Profile = { ...DEFAULTS };
  try {
    const parsed = JSON.parse(localStorage.getItem(KEY) || "{}");
    if (parsed && typeof parsed === "object") value = { ...DEFAULTS, ...parsed };
  } catch {
    /* defaults */
  }
  cache = value;
  return value;
}

function write(next: Profile): void {
  cache = next;
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* ignore */
  }
  listeners.forEach((l) => l());
}

export function getProfile(): Profile {
  return read();
}

export function setProfile(patch: Partial<Profile>): void {
  write({ ...read(), ...patch });
}

function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

export function useProfile(): Profile {
  return useSyncExternalStore(subscribe, getProfile, getProfile);
}

/** First letter of the name for the avatar fallback. */
export function profileInitial(name: string): string {
  return (name.trim()[0] || "y").toUpperCase();
}
