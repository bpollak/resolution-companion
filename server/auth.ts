import type { Request, Response, NextFunction } from "express";

/**
 * API key authentication middleware.
 * When API_SECRET env var is set, requires X-API-Key header on protected endpoints.
 * When not set, all requests pass through (backward compatible).
 */
export function requireApiKey(req: Request, res: Response, next: NextFunction) {
  const apiSecret = process.env.API_SECRET;

  // If no API_SECRET configured, skip authentication
  if (!apiSecret) {
    return next();
  }

  const providedKey = req.header("X-API-Key");

  if (!providedKey || providedKey !== apiSecret) {
    res.status(401).json({ error: "Unauthorized: invalid or missing API key" });
    return;
  }

  next();
}
