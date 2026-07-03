import { afterEach, describe, expect, it, vi } from "vitest";
import { makeTrailingDebounce, shouldReload } from "./board-sync";

describe("shouldReload", () => {
  it("is false for an own-label payload (self-originated broadcast)", () => {
    expect(shouldReload({ source: "main" }, "main")).toBe(false);
  });

  it("is true for a foreign-label payload (another window mutated)", () => {
    expect(shouldReload({ source: "tray" }, "main")).toBe(true);
  });

  it("is true for an undefined payload (legacy / Rust-side emit)", () => {
    expect(shouldReload(undefined, "main")).toBe(true);
  });

  it("is true for a null payload", () => {
    expect(shouldReload(null, "main")).toBe(true);
  });

  it("is true for a payload without a source", () => {
    expect(shouldReload({}, "main")).toBe(true);
  });
});

describe("makeTrailingDebounce", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("coalesces three rapid calls into one invocation after the window", () => {
    vi.useFakeTimers();
    const fn = vi.fn();
    const debounced = makeTrailingDebounce(fn, 80);

    debounced();
    debounced();
    debounced();
    expect(fn).not.toHaveBeenCalled();

    vi.advanceTimersByTime(80);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("fires again for a later call after the first window elapsed", () => {
    vi.useFakeTimers();
    const fn = vi.fn();
    const debounced = makeTrailingDebounce(fn, 80);

    debounced();
    vi.advanceTimersByTime(80);
    expect(fn).toHaveBeenCalledTimes(1);

    debounced();
    vi.advanceTimersByTime(80);
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("cancel() drops a pending invocation", () => {
    vi.useFakeTimers();
    const fn = vi.fn();
    const debounced = makeTrailingDebounce(fn, 80);

    debounced();
    debounced.cancel();
    vi.advanceTimersByTime(80);
    expect(fn).not.toHaveBeenCalled();
  });
});
