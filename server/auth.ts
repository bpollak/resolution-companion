import type { Request, Response, NextFunction } from "express";

const isProduction = process.env.NODE_ENV === "production";

if (isProduction && !process.env.API_SECRET) {
  console.error(
    "FATAL: API_SECRET is not set. In production, protected API endpoints (AI chat, " +
      "subscriptions) reject all requests until API_SECRET is configured. Set the same " +
      "value as EXPO_PUBLIC_API_SECRET in your EAS build environment.",
  );
}

/**
 * API key authentication middleware.
 *
 * - Production: API_SECRET is required. If unset, protected endpoints fail closed
 *   (503) instead of silently exposing the OpenAI-backed endpoints to the internet.
 * - Development: when API_SECRET is unset, requests pass through for local testing.
 */
export function requireApiKey(req: Request, res: Response, next: NextFunction) {
  const apiSecret = process.env.API_SECRET;

  if (!apiSecret) {
    if (isProduction) {
      res
        .status(503)
        .json({ error: "Service unavailable: server is not configured" });
      return;
    }
    return next();
  }

  const providedKey = req.header("X-API-Key");

  if (!providedKey || providedKey !== apiSecret) {
    res.status(401).json({ error: "Unauthorized: invalid or missing API key" });
    return;
  }

  next();
}

/**
 * Admin-only authentication middleware.
 *
 * Guards endpoints that expose collected user data (e.g. feedback PII). The
 * regular API_SECRET ships inside the app bundle and is extractable, so it is
 * not sufficient for admin surfaces. Fails closed when ADMIN_API_SECRET is
 * unset — these endpoints are for operators, not the app.
 */
export function requireAdminKey(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  const adminSecret = process.env.ADMIN_API_SECRET;

  if (!adminSecret) {
    res.status(404).json({ error: "Not found" });
    return;
  }

  const providedKey = req.header("X-Admin-Key");

  if (!providedKey || providedKey !== adminSecret) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  next();
}
