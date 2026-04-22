import type { Request, Response, NextFunction } from "express";
import * as crypto from "node:crypto";

/**
 * API key authentication middleware.
 *
 * In production (NODE_ENV=production) API_SECRET is required — if unset, the
 * process refuses to start so we can never silently ship an unauthenticated
 * proxy to OpenAI. In development the key is optional so local tinkering works.
 */

const apiSecret = process.env.API_SECRET;

if (process.env.NODE_ENV === "production" && !apiSecret) {
  throw new Error(
    "API_SECRET must be set in production. Refusing to start with unauthenticated API endpoints."
  );
}

export function requireApiKey(req: Request, res: Response, next: NextFunction) {
  if (!apiSecret) {
    return next();
  }

  const providedKey = req.header("X-API-Key");

  if (!providedKey) {
    res.status(401).json({ error: "Unauthorized: missing API key" });
    return;
  }

  const provided = Buffer.from(providedKey);
  const expected = Buffer.from(apiSecret);

  if (
    provided.length !== expected.length ||
    !crypto.timingSafeEqual(provided, expected)
  ) {
    res.status(401).json({ error: "Unauthorized: invalid API key" });
    return;
  }

  next();
}
