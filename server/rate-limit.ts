import type { Request, Response, NextFunction } from "express";

const rateLimitStore = new Map<string, { count: number; resetTime: number }>();

/**
 * Per-key rate limiter. `keyFn` lets the caller pick the bucket dimension;
 * default is IP-based. For AI endpoints we also key on device-id so mobile
 * carriers NAT'd behind one IP don't share a budget.
 */
export function rateLimiter(
  maxRequests: number,
  windowMs: number,
  keyFn?: (req: Request) => string
) {
  return (req: Request, res: Response, next: NextFunction) => {
    const key = keyFn
      ? keyFn(req)
      : req.ip || req.socket.remoteAddress || "unknown";
    const now = Date.now();
    const entry = rateLimitStore.get(key);

    if (!entry || now > entry.resetTime) {
      rateLimitStore.set(key, { count: 1, resetTime: now + windowMs });
      return next();
    }

    if (entry.count >= maxRequests) {
      res.status(429).json({ error: "Too many requests. Please try again later." });
      return;
    }

    entry.count++;
    next();
  };
}

export function deviceOrIpKey(req: Request): string {
  const deviceId =
    typeof req.body?.deviceId === "string" ? req.body.deviceId : null;
  const header =
    typeof req.header("x-device-id") === "string" ? req.header("x-device-id") : null;
  const ip = req.ip || req.socket.remoteAddress || "unknown";
  return `${deviceId || header || "nodev"}|${ip}`;
}

setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of rateLimitStore) {
    if (now > entry.resetTime) rateLimitStore.delete(key);
  }
}, 5 * 60 * 1000);
