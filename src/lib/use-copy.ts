import { createElement, useEffect, useRef, useState } from "react";
import { Check } from "lucide-react";
import { getTextValue } from "./ipc";
import { useToast } from "../components/Toast";

const COPY_REVERT_MS = 1200;

/**
 * Shared copy-to-clipboard state used by the sticky NoteCards. Wires
 * `getTextValue` -> clipboard and exposes the `copied` flag that drives the
 * brief "Copied" affordance.
 *
 * R3: gate copy/reveal behind Touch ID (confidential items unlock here).
 */
export function useCopy(itemId: string) {
  const [copied, setCopied] = useState(false);
  const revertTimer = useRef<number | null>(null);
  const toast = useToast();

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
      toast({ message: "Copied to clipboard", icon: createElement(Check, { size: 14, strokeWidth: 2.6 }), tone: "green" });
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
