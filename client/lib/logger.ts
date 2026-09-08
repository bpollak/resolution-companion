/**
 * Production-safe logger. Only outputs in development (__DEV__).
 * Prevents log noise in App Store / Play Store builds.
 */

declare const __DEV__: boolean;

export const logger = {
  log: (...args: unknown[]) => {
    if (__DEV__) console.log(...args);
  },
  warn: (...args: unknown[]) => {
    if (__DEV__) console.warn(...args);
  },
  error: (...args: unknown[]) => {
    // Always log errors — they indicate real problems
    console.error(...args);
  },
};
