// Characterization tests for clipboard.ts — pin the pure helpers and store logic.
// The module caches state in a module-level `cache` var and reads localStorage on
// first access, so each test gets a fresh module via vi.resetModules() + dynamic
// import, with localStorage cleared beforehand.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ClipEntry } from "./clipboard";

// Tauri IPC + events are unavailable under jsdom. Mock the persistence wrappers and
// the event/window bridge so the module loads and its in-memory behavior can be
// exercised. `clipHistoryLoad` resolves to an empty buffer by default.
vi.mock("./ipc", () => ({
  clipHistoryLoad: vi.fn(() => Promise.resolve("[]")),
  clipHistorySave: vi.fn(() => Promise.resolve()),
}));
vi.mock("@tauri-apps/api/event", () => ({
  emit: vi.fn(() => Promise.resolve()),
  listen: vi.fn(() => Promise.resolve(() => {})),
}));
vi.mock("@tauri-apps/api/webviewWindow", () => ({
  getCurrentWebviewWindow: () => ({ label: "main" }),
}));

async function freshModule() {
  vi.resetModules();
  return import("./clipboard");
}

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

function makeClip(overrides: Partial<ClipEntry>): ClipEntry {
  return {
    id: "c" + Math.random().toString(36).slice(2),
    kind: "text",
    value: "",
    label: "",
    ts: 0,
    ...overrides,
  };
}

describe("labelForClipValue", () => {
  it("returns the hostname (www stripped) for an http(s) URL", async () => {
    const { labelForClipValue } = await freshModule();
    expect(labelForClipValue("https://www.example.com/some/path")).toBe("example.com");
    expect(labelForClipValue("https://sub.example.com")).toBe("sub.example.com");
  });

  it("uses the first non-empty line, trimmed", async () => {
    const { labelForClipValue } = await freshModule();
    expect(labelForClipValue("\n\n  hello world  \nsecond line")).toBe("hello world");
  });

  it("caps the label at 60 characters", async () => {
    const { labelForClipValue } = await freshModule();
    const long = "x".repeat(100);
    expect(labelForClipValue(long)).toHaveLength(60);
  });

  it("returns 'Copied' for an empty value", async () => {
    const { labelForClipValue } = await freshModule();
    expect(labelForClipValue("")).toBe("Copied");
    expect(labelForClipValue("   \n  ")).toBe("Copied");
  });

  it("does not treat a bare www. host (no scheme) as a URL", async () => {
    const { labelForClipValue } = await freshModule();
    // Only /^https?:\/\//i triggers hostname parsing; www. alone falls through.
    expect(labelForClipValue("www.example.com")).toBe("www.example.com");
  });
});

describe("clipMatches", () => {
  it("returns true for an empty query", async () => {
    const { clipMatches } = await freshModule();
    expect(clipMatches(makeClip({ label: "anything" }), "")).toBe(true);
    expect(clipMatches(makeClip({ label: "anything" }), "   ")).toBe(true);
  });

  it("matches against label, value, and sourceApp (case-insensitive)", async () => {
    const { clipMatches } = await freshModule();
    const clip = makeClip({ label: "My Note", value: "some content", sourceApp: "Safari" });
    expect(clipMatches(clip, "note")).toBe(true);
    expect(clipMatches(clip, "CONTENT")).toBe(true);
    expect(clipMatches(clip, "safari")).toBe(true);
    expect(clipMatches(clip, "nomatch")).toBe(false);
  });

  it("matches the 'link' token when isUrl is set", async () => {
    const { clipMatches } = await freshModule();
    expect(clipMatches(makeClip({ isUrl: true }), "link")).toBe(true);
    expect(clipMatches(makeClip({ isUrl: false }), "link")).toBe(false);
  });
});

describe("filterClips", () => {
  it("keeps only matching clips", async () => {
    const { filterClips } = await freshModule();
    const clips = [
      makeClip({ label: "alpha" }),
      makeClip({ label: "beta" }),
      makeClip({ label: "alphabet" }),
    ];
    expect(filterClips(clips, "alpha").map((c) => c.label)).toEqual(["alpha", "alphabet"]);
  });
});

describe("suppression consume-once semantics", () => {
  it("returns true only for the first check, then false", async () => {
    const { suppressClipboardCapture, shouldSuppressClipboardCapture } = await freshModule();
    suppressClipboardCapture("secret");
    expect(shouldSuppressClipboardCapture("secret")).toBe(true);
    expect(shouldSuppressClipboardCapture("secret")).toBe(false);
  });

  it("returns false for a value that was never suppressed", async () => {
    const { shouldSuppressClipboardCapture } = await freshModule();
    expect(shouldSuppressClipboardCapture("never")).toBe(false);
  });

  it("expires suppressions after the 5s TTL", async () => {
    const { suppressClipboardCapture, shouldSuppressClipboardCapture } = await freshModule();
    const base = 1_000_000;
    const spy = vi.spyOn(Date, "now").mockReturnValue(base);
    suppressClipboardCapture("stale");
    // advance past the 5000ms TTL
    spy.mockReturnValue(base + 6000);
    expect(shouldSuppressClipboardCapture("stale")).toBe(false);
  });
});

describe("addClip de-dupe", () => {
  it("does not re-add an immediate identical repeat (same value+label+sourceApp)", async () => {
    const { addClip, getClipboard } = await freshModule();
    addClip({ kind: "text", value: "hello", label: "hello", sourceApp: "Safari" });
    addClip({ kind: "text", value: "hello", label: "hello", sourceApp: "Safari" });
    expect(getClipboard()).toHaveLength(1);
  });

  it("adds a repeat that comes from a different sourceApp", async () => {
    const { addClip, getClipboard } = await freshModule();
    addClip({ kind: "text", value: "hello", label: "hello", sourceApp: "Safari" });
    addClip({ kind: "text", value: "hello", label: "hello", sourceApp: "Notes" });
    expect(getClipboard()).toHaveLength(2);
  });

  it("pushes new distinct clips to the front", async () => {
    const { addClip, getClipboard } = await freshModule();
    addClip({ kind: "text", value: "first", label: "first" });
    addClip({ kind: "text", value: "second", label: "second" });
    expect(getClipboard().map((c) => c.value)).toEqual(["second", "first"]);
  });
});

describe("clearClipsSince / restoreClips round-trip", () => {
  it("clears everything and restores it back", async () => {
    const { addClip, getClipboard, clearClipsSince, restoreClips } = await freshModule();
    addClip({ kind: "text", value: "one", label: "one" });
    addClip({ kind: "text", value: "two", label: "two" });
    const before = getClipboard();
    expect(before).toHaveLength(2);

    const removed = clearClipsSince();
    expect(getClipboard()).toHaveLength(0);
    expect(removed).toHaveLength(2);

    restoreClips(removed);
    const after = getClipboard();
    expect(after).toHaveLength(2);
    expect(after.map((c) => c.value).sort()).toEqual(["one", "two"]);
  });

  it("clearClipsSince(cutoff) removes only clips at/after the cutoff ts", async () => {
    const { restoreClips, clearClipsSince, getClipboard } = await freshModule();
    // addClip stamps ts via Date.now, so seed controlled timestamps through
    // restoreClips (which preserves the given ts) instead.
    restoreClips([
      makeClip({ id: "old", value: "old", ts: 100 }),
      makeClip({ id: "new", value: "new", ts: 200 }),
    ]);
    const removed = clearClipsSince(150);
    expect(removed.map((c) => c.id)).toEqual(["new"]);
    expect(getClipboard().map((c) => c.id)).toEqual(["old"]);
  });
});

describe("encrypted persistence", () => {
  it("a write schedules clipHistorySave with the buffer after the 250ms debounce", async () => {
    vi.useFakeTimers();
    try {
      const { addClip } = await freshModule();
      // Import after freshModule so both resolve from the same reset registry.
      const ipc = await import("./ipc");
      const save = vi.mocked(ipc.clipHistorySave);
      save.mockClear();

      addClip({ kind: "text", value: "hello", label: "hello" });
      // Debounced: nothing persisted synchronously.
      expect(save).not.toHaveBeenCalled();

      vi.advanceTimersByTime(250);
      expect(save).toHaveBeenCalledTimes(1);
      const persisted = JSON.parse(save.mock.calls[0][0]) as ClipEntry[];
      expect(persisted[0].value).toBe("hello");
    } finally {
      vi.useRealTimers();
    }
  });

  it("does not write the clip buffer to localStorage", async () => {
    const { addClip } = await freshModule();
    addClip({ kind: "text", value: "secret", label: "secret" });
    expect(localStorage.getItem("qb_clipboard_v1")).toBeNull();
  });
});
