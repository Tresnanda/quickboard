// Classifies the error strings the Rust Touch ID gate returns, so the frontend
// can stay quiet on a deliberate user cancel but speak up on a real failure —
// plus the shared copy/affordance for surfacing that failure.
//
// The backend wraps every biometric error as `biometric auth failed: {e:?}`
// (see `src-tauri/src/confidential.rs`), where `{e:?}` is the Debug of the
// `robius_authentication::Error` enum. A deliberate dismiss of the system prompt
// maps to `Error::UserCanceled` -> the message contains "UserCanceled".
//
// TRIPWIRE: if the Rust error strings ever change, `isAuthCancel` silently stops
// matching. The unit test pinning the exact "UserCanceled" substring is the
// intended canary — keep it in sync with confidential.rs.

import { createElement, type ReactNode } from "react";
import { motion, type Transition } from "framer-motion";
import { Fingerprint } from "lucide-react";

/** Shared copy for a genuine (non-cancel) Touch ID failure. */
export const AUTH_FAIL_MESSAGE = "Couldn't unlock. Try again";

/**
 * True when the user deliberately dismissed the Touch ID prompt.
 *
 * Matches only `UserCanceled` — NOT `AppCanceled` / `SystemCanceled`, which are
 * involuntary cancels (the app or system tore the prompt down) and should still
 * surface feedback so the user isn't left wondering why nothing happened.
 */
export function isAuthCancel(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err ?? "");
  return /UserCanceled/i.test(msg);
}

// A firm, no-overshoot horizontal shake — motion-design's error pattern scaled
// to a 14px glyph: two settling oscillations that read as "nope, try again".
// It plays once on mount inside the (already spring-entering) toast, so it never
// gates or delays the retry.
const SHAKE = { x: [0, -2.5, 2.5, -2, 2, 0] };
const SHAKE_TRANSITION: Transition = { duration: 0.4, ease: "easeInOut" };

/**
 * The icon for a failed-unlock toast: a fingerprint that shakes "denied" on
 * appear. Collapses to a still glyph under reduced motion. Pass the value from
 * `useReducedMotion()` (a hook — must be read in the component/hook, not here).
 */
export function authFailIcon(reduce: boolean): ReactNode {
  const glyph = createElement(Fingerprint, { size: 14, strokeWidth: 2.4 });
  if (reduce) return glyph;
  return createElement(
    motion.span,
    {
      style: { display: "inline-flex" },
      initial: { x: 0 },
      animate: SHAKE,
      transition: SHAKE_TRANSITION,
    },
    glyph,
  );
}
