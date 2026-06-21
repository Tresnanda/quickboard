import { useEffect, useRef, useState } from "react";
import { getTextValue } from "./ipc";

const COPY_REVERT_MS = 1200;

/**
 * Shared copy-to-clipboard state used by both the Library rows and the
 * Quick-access cards, so the copy -> Check morph behaves identically in both
 * places. Wires `getTextValue` -> clipboard and exposes the `copied` flag that
 * drives the <CopyMorph/> swap.
 *
 * R3: gate copy/reveal behind Touch ID (confidential items unlock here).
 */
export function useCopy(itemId: string) {
  const [copied, setCopied] = useState(false);
  const revertTimer = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (revertTimer.current !== null) {
        window.clearTimeout(revertTimer.current);
      }
    };
  }, []);

  async function copy() {
    try {
      const value = await getTextValue(itemId);
      await navigator.clipboard.writeText(value);
      setCopied(true);
      // Interruptible: a fresh click restarts the auto-revert timer.
      if (revertTimer.current !== null) {
        window.clearTimeout(revertTimer.current);
      }
      revertTimer.current = window.setTimeout(() => {
        setCopied(false);
        revertTimer.current = null;
      }, COPY_REVERT_MS);
    } catch {
      /* surfaced at a higher level later; copy stays silent for now */
    }
  }

  return { copied, copy };
}
