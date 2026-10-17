export interface TrailingDebounce<T> {
  /** Replace the pending argument and restart the quiet-period timer. */
  schedule(arg: T): void;
  /** Run the pending argument now, if any. The latest schedule always wins. */
  flush(): void;
  /** Drop the pending argument without running it. */
  cancel(): void;
}

/**
 * Trailing-edge debounce that remembers only the latest argument. Used for
 * work whose final state is all that matters (reminder rescheduling): a
 * burst of check-offs collapses into one run with the last state, and
 * flush() lets a caller that is going away still apply that state.
 */
export function createTrailingDebounce<T>(
  run: (arg: T) => void,
  delayMs: number,
): TrailingDebounce<T> {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let pending: { arg: T } | null = null;

  const clear = () => {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
  };

  const flush = () => {
    clear();
    if (!pending) return;
    const { arg } = pending;
    pending = null;
    run(arg);
  };

  return {
    schedule(arg) {
      pending = { arg };
      clear();
      timer = setTimeout(flush, delayMs);
    },
    flush,
    cancel() {
      clear();
      pending = null;
    },
  };
}
