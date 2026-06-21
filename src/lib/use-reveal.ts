import { useEffect, useRef, useState } from "react";
import { getTextValue } from "./ipc";

/** How long a revealed confidential value stays on screen before auto-hiding. */
const REVEAL_MS = 12_000;

/**
 * Touch-ID-gated in-place reveal for a confidential item.
 *
 * `toggle()` asks the backend for the value — which prompts Touch ID for a
 * confidential item (see the Rust `get_text_value` gate). On success the value
 * is held for {@link REVEAL_MS} then auto-hidden; calling `toggle()` again while
 * it's shown hides it immediately. A cancelled / failed prompt leaves it hidden.
 */
export function useReveal(itemId: string) {
  const [value, setValue] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const timer = useRef<number | null>(null);

  function clearTimer() {
    if (timer.current !== null) {
      window.clearTimeout(timer.current);
      timer.current = null;
    }
  }

  // Clear any pending auto-hide on unmount.
  useEffect(() => clearTimer, []);

  function hide() {
    clearTimer();
    setValue(null);
  }

  async function toggle() {
    if (value !== null) {
      hide();
      return;
    }
    if (busy) return;
    setBusy(true);
    try {
      const v = await getTextValue(itemId); // Touch ID prompt for confidential
      setValue(v);
      clearTimer();
      timer.current = window.setTimeout(() => {
        setValue(null);
        timer.current = null;
      }, REVEAL_MS);
    } catch {
      /* cancelled or failed — stay hidden */
    } finally {
      setBusy(false);
    }
  }

  return { revealed: value !== null, value, busy, toggle, hide };
}
