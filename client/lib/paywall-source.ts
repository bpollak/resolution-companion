/**
 * The paywall's entry point, or null for the default paywall. Route params
 * are typed but not checked at runtime: a navigation state restored from an
 * older build, or a link written for one, can carry a source this build no
 * longer has a context for, and indexing the context map with it would
 * throw on render.
 */
export function resolvePaywallSource<K extends string>(
  contexts: Record<K, unknown>,
  source: unknown,
): K | null {
  return typeof source === "string" &&
    Object.prototype.hasOwnProperty.call(contexts, source)
    ? (source as K)
    : null;
}
