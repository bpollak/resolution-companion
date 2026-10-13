// Clients mint a random UUID (client/lib/storage.ts getDeviceId). The pattern
// is a little wider than UUID so any older install id still matches, and it is
// the same shape the telemetry and AI report routes already accept.
export const DEVICE_ID_RE = /^[A-Za-z0-9._-]{8,64}$/;

export function isValidDeviceId(value: unknown): value is string {
  return typeof value === "string" && DEVICE_ID_RE.test(value);
}

// The header is unauthenticated input that becomes a quota bucket key and a
// subscription lookup. A malformed value falls back to the IP bucket, the same
// path as a missing header, rather than a 400: that keeps coaching working for
// any client with an unexpected id while denying arbitrary strings their own
// fresh quota bucket.
export function aiUsageIdentity(
  deviceIdHeader: string | undefined,
  ip: string | undefined,
): { deviceId: string | null; usageKey: string } {
  if (isValidDeviceId(deviceIdHeader)) {
    return { deviceId: deviceIdHeader, usageKey: deviceIdHeader };
  }
  return { deviceId: null, usageKey: `ip:${ip}` };
}
