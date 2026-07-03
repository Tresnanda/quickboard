// Pure helpers for the cross-window `board:changed` sync, kept out of the React
// provider so they can be unit-tested in isolation.

/**
 * Decide whether a `board:changed` event should trigger a full board refetch in
 * the receiving window.
 *
 * The emitting window tags the event with its own label and applies the change
 * locally, so it must NOT refetch on its own broadcast. Every other window (and
 * any untagged / legacy / Rust-side emit) must refetch to stay consistent.
 */
export function shouldReload(
  payload: { source?: string } | undefined | null,
  ownLabel: string,
): boolean {
  return payload?.source !== ownLabel;
}

export type Debounced = {
  (): void;
  cancel: () => void;
};

/**
 * Trailing debounce: coalesces a burst of calls into a single invocation of
 * `fn`, fired `ms` after the last call. `cancel()` drops any pending call.
 */
export function makeTrailingDebounce(fn: () => void, ms: number): Debounced {
  let timer: ReturnType<typeof setTimeout> | null = null;
  const debounced = () => {
    if (timer !== null) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      fn();
    }, ms);
  };
  debounced.cancel = () => {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
  };
  return debounced;
}
