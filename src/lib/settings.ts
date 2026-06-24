// App preferences (client-side). Reactive via useSyncExternalStore. Applied where
// relevant: motion config, density attribute, delete confirmation, reveal auto-hide,
// launch environment.

import { useSyncExternalStore } from "react";

export type Density = "comfortable" | "compact";

export type Settings = {
  confirmDelete: boolean;
  defaultEnvironment: string | null; // null = remember last / All
  reduceMotion: boolean;
  density: Density;
  autoHideSeconds: number; // revealed secrets auto-hide after this
  lockOnBlur: boolean; // hide revealed secrets when the window loses focus
  soundEffects: boolean; // tactile UI micro-sounds (summon panel)
  clipboardHistory: boolean; // opt-in: capture copies into the tray's Clipboard lane
};

const DEFAULTS: Settings = {
  confirmDelete: true,
  defaultEnvironment: null,
  reduceMotion: false,
  density: "comfortable",
  autoHideSeconds: 15,
  lockOnBlur: true,
  soundEffects: true,
  clipboardHistory: false,
};

const KEY = "qb_settings_v1";

let cache: Settings | null = null;
const listeners = new Set<() => void>();

function read(): Settings {
  if (cache) return cache;
  let value: Settings = { ...DEFAULTS };
  try {
    const parsed = JSON.parse(localStorage.getItem(KEY) || "{}");
    if (parsed && typeof parsed === "object") value = { ...DEFAULTS, ...parsed };
  } catch {
    /* defaults */
  }
  cache = value;
  return value;
}

function write(next: Settings): void {
  cache = next;
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* ignore */
  }
  listeners.forEach((l) => l());
}

export function getSettings(): Settings {
  return read();
}

export function setSetting<K extends keyof Settings>(key: K, value: Settings[K]): void {
  write({ ...read(), [key]: value });
}

function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

export function useSettings(): Settings {
  return useSyncExternalStore(subscribe, getSettings, getSettings);
}

// Cross-window sync — settings changed in one webview (tray/summon/main) take effect
// in the others (e.g. enabling clipboard history from the tray reaches the capture
// hook in the main window).
if (typeof window !== "undefined") {
  window.addEventListener("storage", (e) => {
    if (e.key === KEY || e.key === null) {
      cache = null;
      listeners.forEach((l) => l());
    }
  });
}
