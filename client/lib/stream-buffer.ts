export interface TextStreamBuffer {
  append: (chunk: string) => void;
  flush: () => void;
  cancel: () => void;
}

/**
 * Coalesces rapid token callbacks so streamed text does not force a full React
 * render for every network chunk. `flush` always delivers the final buffered
 * text before a completed response replaces the streaming preview.
 */
export function createTextStreamBuffer(
  onFlush: (chunk: string) => void,
  delayMs: number = 50,
): TextStreamBuffer {
  let bufferedText = "";
  let timer: ReturnType<typeof setTimeout> | null = null;
  let cancelled = false;

  const flush = () => {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
    if (cancelled || bufferedText.length === 0) return;
    const chunk = bufferedText;
    bufferedText = "";
    onFlush(chunk);
  };

  return {
    append(chunk) {
      if (cancelled || chunk.length === 0) return;
      bufferedText += chunk;
      if (timer === null) timer = setTimeout(flush, delayMs);
    },
    flush,
    cancel() {
      cancelled = true;
      bufferedText = "";
      if (timer !== null) {
        clearTimeout(timer);
        timer = null;
      }
    },
  };
}
