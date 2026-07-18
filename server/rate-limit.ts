import type { Request, Response, NextFunction } from "express";
import { sql } from "drizzle-orm";
import { db } from "./db";
import { rateLimitWindows } from "@shared/schema";

const localFallback = new Map<string, { count: number; resetTime: number }>();

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
