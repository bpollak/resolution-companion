import type { Request, Response, NextFunction } from "express";
import { lt, sql } from "drizzle-orm";
import { db } from "./db";
import { rateLimitWindows } from "../shared/schema";

const localFallback = new Map<string, { count: number; resetTime: number }>();

const PRUNE_INTERVAL_MS = 60 * 1000;
const PRUNE_OLDER_THAN_MS = 24 * 60 * 60 * 1000;
let lastPruneAt = 0;

// Every client and minute adds a row, so the table only grows. Old windows
// are never read again; remove them in passing, at most once a minute, and
// never make a request wait on or fail because of the cleanup.
function pruneOldWindows(now: number): void {
  if (!db || now - lastPruneAt < PRUNE_INTERVAL_MS) return;
  lastPruneAt = now;
  const logFailure = (error: unknown) =>
    console.error("Rate limit prune error:", error);
  try {
    db.delete(rateLimitWindows)
      .where(
        lt(rateLimitWindows.updatedAt, new Date(now - PRUNE_OLDER_THAN_MS)),
      )
      .catch(logFailure);
  } catch (error) {
    logFailure(error);
  }
}

/**
 * Shared fixed-window rate limiting. Production fails closed when Postgres is
 * unavailable so an extracted bundle key cannot bypass cost controls; local
 * development without DATABASE_URL uses the in-process fallback.
 */
export function rateLimiter(
  scope: string,
  maxRequests: number,
  windowMs: number,
) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const clientKey = req.ip || req.socket.remoteAddress || "unknown";
    const now = Date.now();
    const windowId = String(Math.floor(now / windowMs));

    if (db) {
      try {
        const rows = await db
          .insert(rateLimitWindows)
          .values({
            scope,
            clientKey,
            windowId,
            count: 1,
            updatedAt: new Date(),
          })
          .onConflictDoUpdate({
            target: [
              rateLimitWindows.scope,
              rateLimitWindows.clientKey,
              rateLimitWindows.windowId,
            ],
            set: {
              count: sql`${rateLimitWindows.count} + 1`,
              updatedAt: new Date(),
            },
          })
          .returning({ count: rateLimitWindows.count });
        pruneOldWindows(now);
        if (rows[0].count > maxRequests) {
          res
            .status(429)
            .json({ error: "Too many requests. Please try again later." });
          return;
        }
        next();
        return;
      } catch (error) {
        console.error("Distributed rate limit error:", error);
        res.status(503).json({ error: "Service temporarily unavailable." });
        return;
      }
    }

    if (process.env.NODE_ENV === "production") {
      res.status(503).json({ error: "Service temporarily unavailable." });
      return;
    }

    const key = `${scope}|${clientKey}`;
    const entry = localFallback.get(key);
    if (!entry || now > entry.resetTime) {
      localFallback.set(key, { count: 1, resetTime: now + windowMs });
      next();
      return;
    }
    if (entry.count >= maxRequests) {
      res
        .status(429)
        .json({ error: "Too many requests. Please try again later." });
      return;
    }
    entry.count++;
    next();
  };
}
