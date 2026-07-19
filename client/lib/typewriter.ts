export const TYPEWRITER_DELAY_MS = 30;

export interface TypewriterController {
  cancel: () => void;
}

/**
 * Reveals deterministic copy one character at a time. Returning a controller
 * lets the owning screen stop a stale animation when its session changes.
 */
export function startTextTypewriter(
  text: string,
  onUpdate: (visibleText: string) => void,
  onComplete: () => void,
  delayMs: number = TYPEWRITER_DELAY_MS,
): TypewriterController {
  let visibleLength = 0;
  let cancelled = false;
  let timer: ReturnType<typeof setTimeout> | null = null;

  const tick = () => {
    if (cancelled) return;
    visibleLength += 1;
    onUpdate(text.slice(0, visibleLength));
    if (visibleLength >= text.length) {
      timer = null;
      onComplete();
      return;
    }
    timer = setTimeout(tick, delayMs);
  };

  if (text.length === 0) {
    onComplete();
  } else {
    timer = setTimeout(tick, delayMs);
  }

  return {
    cancel() {
      cancelled = true;
      if (timer !== null) {
        clearTimeout(timer);
        timer = null;
      }
    },
  };
}
