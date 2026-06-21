import { useEffect, useRef, useState } from "react";
import { getTextValue } from "./ipc";
import type { Item } from "./types";

/**
 * Build a short, partly-masked one-line preview from a raw value: keep the
 * first few characters, then a run of dots — enough to recognise the value
 * without exposing it. Single-line only (newlines collapse to spaces).
 */
export function maskPreview(raw: string, head = 6): string {
  const oneLine = raw.replace(/\s+/g, " ").trim();
  if (oneLine.length === 0) return "";
  if (oneLine.length <= head) return oneLine;
  return `${oneLine.slice(0, head)}••••`;
}

/**
 * Fetch a safe value preview for an item.
 *
 * - Confidential items NEVER hit the backend — we return `null` so callers
 *   render the frosted "Touch ID to reveal" affordance instead.
 * - File items have no text value — we return `null` (callers show file meta).
 * - Non-confidential Text items fetch `getTextValue` once and expose a
 *   truncated / partly-masked preview string.
 *
 * The fetch is best-effort and silent on failure (the backend is the source of
 * truth; a missing preview just falls back to the generic descriptor).
 */
export function usePreview(item: Item): {
  /** Masked preview string, or null when not applicable / not yet loaded. */
  preview: string | null;
  /** True only for confidential items (callers render the frost state). */
  confidential: boolean;
} {
  const confidential = item.confidential;
  const isText = item.kind === "Text";
  const [preview, setPreview] = useState<string | null>(null);
  // Guard against setting state after unmount / id change races.
  const activeId = useRef(item.id);

  useEffect(() => {
    activeId.current = item.id;
    // Never fetch confidential values; file items have no text value.
    if (confidential || !isText) {
      setPreview(null);
      return;
    }
    let cancelled = false;
    void getTextValue(item.id)
      .then((value) => {
        if (cancelled || activeId.current !== item.id) return;
        setPreview(maskPreview(value));
      })
      .catch(() => {
        if (cancelled) return;
        setPreview(null);
      });
    return () => {
      cancelled = true;
    };
  }, [item.id, confidential, isText]);

  return { preview, confidential };
}
