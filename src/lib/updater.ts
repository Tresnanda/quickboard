// In-app auto-update. Wraps the Tauri updater plugin (which checks the GitHub
// Releases `latest.json` feed configured in tauri.conf.json) behind a tiny shared
// store so the launch banner and the Settings row reflect one state. Download +
// install happens in place; `relaunch()` swaps into the new build.

import { useSyncExternalStore } from "react";
import { check, type Update } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";

export type UpdateStatus =
  | "idle" // nothing to show
  | "checking" // a manual check is in flight
  | "available" // a newer version is ready to install
  | "downloading" // fetching + applying the update
  | "ready" // installed; relaunch pending
  | "restart_required" // installed, but auto-relaunch was blocked — quit & reopen
  | "uptodate" // a manual check found nothing (transient, for feedback)
  | "error";

export type UpdaterState = {
  status: UpdateStatus;
  version: string | null; // the available update's version
  notes: string | null;
  progress: number; // 0..1 while downloading
  error: string | null;
};

let state: UpdaterState = { status: "idle", version: null, notes: null, progress: 0, error: null };
let pending: Update | null = null; // the checked handle, kept for install()
const listeners = new Set<() => void>();

function set(next: Partial<UpdaterState>): void {
  state = { ...state, ...next };
  listeners.forEach((l) => l());
}
function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}
function snapshot(): UpdaterState {
  return state;
}

export function useUpdater(): UpdaterState {
  return useSyncExternalStore(subscribe, snapshot, snapshot);
}

let inFlight = false;

/**
 * Ask GitHub whether a newer release exists. `silent` (the launch check) leaves
 * the UI untouched when there's nothing new or the feed is unreachable — before
 * the first published release the endpoint 404s, which is expected, not an error.
 */
export async function checkForUpdate(silent = false): Promise<void> {
  if (inFlight || state.status === "downloading") return;
  inFlight = true;
  if (!silent) set({ status: "checking", error: null });
  try {
    const update = await check();
    if (update) {
      pending = update;
      set({ status: "available", version: update.version, notes: update.body ?? null, error: null });
    } else {
      pending = null;
      set({ status: silent ? "idle" : "uptodate", version: null, notes: null });
    }
  } catch (e) {
    if (!silent) set({ status: "error", error: errText(e) });
  } finally {
    inFlight = false;
  }
}

/** Download + install the pending update, streaming progress, then relaunch. */
export async function installUpdate(): Promise<void> {
  if (!pending || state.status === "downloading") return;
  let total = 0;
  let got = 0;
  set({ status: "downloading", progress: 0, error: null });
  try {
    await pending.downloadAndInstall((e) => {
      if (e.event === "Started") total = e.data.contentLength ?? 0;
      else if (e.event === "Progress") {
        got += e.data.chunkLength;
        if (total > 0) set({ progress: Math.min(got / total, 1) });
      } else if (e.event === "Finished") set({ progress: 1 });
    });
  } catch (e) {
    set({ status: "error", error: errText(e) });
    return; // the download/install itself failed — nothing was applied
  }
  // Bytes are on disk now. The relaunch is separate and can be blocked (e.g. an
  // older build without the process ACL) — if so, the update is still installed,
  // so ask for a manual restart rather than reporting failure.
  set({ status: "ready", progress: 1 });
  try {
    await relaunch();
  } catch {
    set({ status: "restart_required" });
  }
}

/** Clear a transient "up to date"/error state back to idle (e.g. banner dismiss). */
export function resetUpdateStatus(): void {
  if (state.status === "uptodate" || state.status === "error") set({ status: "idle", error: null });
}

function errText(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}
