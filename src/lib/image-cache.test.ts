import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clearImageCache, getCachedImageDataUrl, invalidateImage } from "./image-cache";
import { getImageDataUrl } from "./ipc";

vi.mock("./ipc", () => ({
  getImageDataUrl: vi.fn(),
}));

const mockGet = vi.mocked(getImageDataUrl);

beforeEach(() => {
  clearImageCache();
  mockGet.mockReset();
  mockGet.mockImplementation((id: string) => Promise.resolve(`data:${id}`));
});

afterEach(() => {
  clearImageCache();
});

describe("getCachedImageDataUrl", () => {
  it("memoizes: two calls for the same id hit the IPC once and share a promise", async () => {
    const a = getCachedImageDataUrl("x");
    const b = getCachedImageDataUrl("x");
    expect(a).toBe(b);
    expect(await a).toBe("data:x");
    expect(mockGet).toHaveBeenCalledTimes(1);
  });

  it("does not cache a rejection: the next call retries the IPC", async () => {
    mockGet.mockRejectedValueOnce(new Error("touch id cancelled"));
    await expect(getCachedImageDataUrl("y")).rejects.toThrow("touch id cancelled");
    // Retry succeeds via the default resolving implementation.
    expect(await getCachedImageDataUrl("y")).toBe("data:y");
    expect(mockGet).toHaveBeenCalledTimes(2);
  });

  it("invalidateImage forces a re-fetch", async () => {
    expect(await getCachedImageDataUrl("z")).toBe("data:z");
    invalidateImage("z");
    expect(await getCachedImageDataUrl("z")).toBe("data:z");
    expect(mockGet).toHaveBeenCalledTimes(2);
  });

  it("evicts the oldest entry past the LRU cap of 64", async () => {
    // Fill the cache with 64 distinct ids, then add one more (65 total).
    for (let i = 0; i < 65; i++) {
      await getCachedImageDataUrl(`id-${i}`);
    }
    expect(mockGet).toHaveBeenCalledTimes(65);

    // id-1..id-64 remain cached (no new IPC calls).
    await getCachedImageDataUrl("id-64");
    expect(mockGet).toHaveBeenCalledTimes(65);

    // id-0 was evicted as the oldest; requesting it re-fetches.
    await getCachedImageDataUrl("id-0");
    expect(mockGet).toHaveBeenCalledTimes(66);
  });
});
