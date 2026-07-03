import { useEffect, useRef, useState } from "react";
import { useReducedMotion } from "framer-motion";
import { getTextValue } from "./ipc";
import { getSettings } from "./settings";
import { useToast } from "../components/Toast";
import { AUTH_FAIL_MESSAGE, authFailIcon, isAuthCancel } from "./confidential-errors";

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
  const toast = useToast();
  const reduce = useReducedMotion();

  function clearTimer() {
    if (timer.current !== null) {
      window.clearTimeout(timer.current);
      timer.current = null;
    }
  }

  // Clear any pending auto-hide on unmount.
  useEffect(() => clearTimer, []);

  // Security: hide a revealed secret when the window loses focus (if enabled).
  useEffect(() => {
    if (value === null || !getSettings().lockOnBlur) return;
    const onBlur = () => {
      clearTimer();
      setValue(null);
    };
    window.addEventListener("blur", onBlur);
    return () => window.removeEventListener("blur", onBlur);
  }, [value]);

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
      }, getSettings().autoHideSeconds * 1000);
    } catch (err) {
      // Either way the secret stays hidden. A deliberate cancel is silent; a
      // real failure says so, so the user knows it wasn't a no-op.
      if (!isAuthCancel(err)) {
        toast({ message: AUTH_FAIL_MESSAGE, icon: authFailIcon(!!reduce), tone: "rose" });
      }
    } finally {
      setBusy(false);
    }
  }

  return { revealed: value !== null, value, busy, toggle, hide };
}
