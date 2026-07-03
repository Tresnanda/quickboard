import { getImageDataUrl } from "./ipc";

// Data-URLs for full-size images can be large, so cap the cache and evict the
// oldest insertion on overflow. A Map preserves insertion order, so the first
// key is the least-recently-used; we delete+re-set on a hit to refresh recency.
const MAX_ENTRIES = 64;
const cache = new Map<string, Promise<string>>();

/** Memoized image data-URL per item id. Failed fetches don't poison the cache. */
export function getCachedImageDataUrl(id: string): Promise<string> {
  const hit = cache.get(id);
  if (hit) {
    // Refresh recency: move this key to the newest insertion slot.
    cache.delete(id);
    cache.set(id, hit);
    return hit;
  }
  const p = getImageDataUrl(id).catch((err) => {
    cache.delete(id); // don't cache failures (incl. cancelled Touch ID)
    throw err;
  });
  cache.set(id, p);
  if (cache.size > MAX_ENTRIES) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
  return p;
}

export function invalidateImage(id: string): void {
  cache.delete(id);
}

export function clearImageCache(): void {
  cache.clear();
}
