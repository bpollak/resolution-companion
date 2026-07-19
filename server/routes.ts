import type { Express, Request, Response, NextFunction } from "express";
import { createServer, type Server } from "node:http";
import * as crypto from "node:crypto";
import OpenAI from "openai";
import { db } from "./db";
import {
  websiteFeedback,
  deviceSubscriptions,
  deviceAiUsage,
  aiUsageDaily,
  deviceEvents,
} from "../shared/schema";
import { sql, eq } from "drizzle-orm";
import { rateLimiter } from "./rate-limit";
import { requireApiKey, requireAdminKey } from "./auth";
import {
  Environment,
  SignedDataVerifier,
} from "@apple/app-store-server-library";

// Lazily construct the OpenAI client so a missing API key degrades the AI
// endpoints instead of crashing the whole server (website, webhooks, legal pages).
let openaiClient: OpenAI | null = null;

// gpt-5-mini outperforms gpt-4o on instruction-following and structured
// output at roughly a tenth of the input cost; override via env if needed
const OPENAI_MODEL = process.env.AI_MODEL || "gpt-5-mini";
const LIFETIME_PRODUCT_ID = "com.resolutioncompanion.lifetime";
const YEARLY_TEST_PRODUCT_ID =
  process.env.YEARLY_PRICE_TEST_PRODUCT_ID ||
  "com.resolutioncompanion.annual.2026b";

function isLifetimeProduct(productId: string): boolean {
  return productId === LIFETIME_PRODUCT_ID || productId.includes("lifetime");
}

function planForProduct(productId: string): "monthly" | "yearly" | "lifetime" {
  if (isLifetimeProduct(productId)) return "lifetime";
  return productId.toLowerCase().includes("yearly") ||
    productId.toLowerCase().includes("year") ||
    productId.toLowerCase().includes("annual")
    ? "yearly"
    : "monthly";
}

function getOpenAI(): OpenAI {
  if (!process.env.AI_INTEGRATIONS_OPENAI_API_KEY) {
    throw new Error("AI_INTEGRATIONS_OPENAI_API_KEY is not configured");
  }
  if (!openaiClient) {
    openaiClient = new OpenAI({
      apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
      baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
    });
  }
  return openaiClient;
}

type ModelUsage = {
  prompt_tokens?: number | null;
  completion_tokens?: number | null;
};

async function recordAiModelUsage(
  endpoint: "chat" | "extract" | "reflection" | "milestone-proposal",
  usage: ModelUsage | null | undefined,
): Promise<void> {
  if (!db) return;
  try {
    const inputTokens = Math.max(0, usage?.prompt_tokens ?? 0);
    const outputTokens = Math.max(0, usage?.completion_tokens ?? 0);
    await db
      .insert(aiUsageDaily)
      .values({
        day: new Date().toISOString().slice(0, 10),
        endpoint,
        model: OPENAI_MODEL,
        requests: 1,
        inputTokens,
        outputTokens,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: [aiUsageDaily.day, aiUsageDaily.endpoint, aiUsageDaily.model],
        set: {
          requests: sql`${aiUsageDaily.requests} + 1`,
          inputTokens: sql`${aiUsageDaily.inputTokens} + ${inputTokens}`,
          outputTokens: sql`${aiUsageDaily.outputTokens} + ${outputTokens}`,
          updatedAt: new Date(),
        },
      });
  } catch (error) {
    // Operational metering must never make coaching fail.
    console.error("AI usage aggregation error:", error);
  }
}

if (!process.env.AI_INTEGRATIONS_OPENAI_API_KEY) {
  console.error(
    "WARNING: AI_INTEGRATIONS_OPENAI_API_KEY is not set — AI chat, onboarding, and reflection endpoints will fail.",
  );
}

// --- App Store Server API v2 (preferred) ---
// Uses JWS signed transactions. Requires APPLE_ISSUER_ID, APPLE_KEY_ID, and
// APPLE_PRIVATE_KEY environment variables (from App Store Connect > Keys > In-App Purchase).
// When these are configured, this path is used instead of the deprecated verifyReceipt endpoints.

function isAppStoreServerAPIConfigured(): boolean {
  return !!(
    process.env.APPLE_ISSUER_ID &&
    process.env.APPLE_KEY_ID &&
    process.env.APPLE_PRIVATE_KEY
  );
}

async function createAppStoreJWT(): Promise<string> {
  const issuerId = process.env.APPLE_ISSUER_ID!;
  const keyId = process.env.APPLE_KEY_ID!;
  const privateKey = process.env.APPLE_PRIVATE_KEY!.replace(/\\n/g, "\n");

  const header = { alg: "ES256", kid: keyId, typ: "JWT" };
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    iss: issuerId,
    iat: now,
    exp: now + 3600,
    aud: "appstoreconnect-v1",
    bid: "com.resolutioncompanion.app",
  };

  const base64Header = Buffer.from(JSON.stringify(header)).toString(
    "base64url",
  );
  const base64Payload = Buffer.from(JSON.stringify(payload)).toString(
    "base64url",
  );
  const signatureInput = `${base64Header}.${base64Payload}`;

  const sign = crypto.createSign("SHA256");
  sign.update(signatureInput);
  // ES256 JWTs require the raw R||S signature format, not DER
  const signature = sign
    .sign({ key: privateKey, dsaEncoding: "ieee-p1363" })
    .toString("base64url");

  return `${signatureInput}.${signature}`;
}

// Official Apple Root CA - G3 (DER, base64-encoded), downloaded from Apple PKI.
// The official App Store Server Library validates the complete certificate
// chain, JWS signature, bundle id, App Store id, and environment against it.
const APPLE_ROOT_CA_G3_DER = Buffer.from(
  "MIICQzCCAcmgAwIBAgIILcX8iNLFS5UwCgYIKoZIzj0EAwMwZzEbMBkGA1UEAwwSQXBwbGUgUm9vdCBDQSAtIEczMSYwJAYDVQQLDB1BcHBsZSBDZXJ0aWZpY2F0aW9uIEF1dGhvcml0eTETMBEGA1UECgwKQXBwbGUgSW5jLjELMAkGA1UEBhMCVVMwHhcNMTQwNDMwMTgxOTA2WhcNMzkwNDMwMTgxOTA2WjBnMRswGQYDVQQDDBJBcHBsZSBSb290IENBIC0gRzMxJjAkBgNVBAsMHUFwcGxlIENlcnRpZmljYXRpb24gQXV0aG9yaXR5MRMwEQYDVQQKDApBcHBsZSBJbmMuMQswCQYDVQQGEwJVUzB2MBAGByqGSM49AgEGBSuBBAAiA2IABJjpLz1AcqTtkyJygRMc3RCV8cWjTnHcFBbZDuWmBSp3ZHtfTjjTuxxEtX/1H7YyYl3J6YRbTzBPEVoA/VhYDKX1DyxNB0cTddqXl5dvMVztK517IDvYuVTZXpmkOlEKMaNCMEAwHQYDVR0OBBYEFLuw3qFYM4iapIqZ3r6966/ayySrMA8GA1UdEwEB/wQFMAMBAf8wDgYDVR0PAQH/BAQDAgEGMAoGCCqGSM49BAMDA2gAMGUCMQCD6cHEFl4aXTQY2e3v9GwOAEZLuN+yRhHFD/3meoyhpmvOwgPUnPWTxnS4at+qIxUCMG1mihDK1A3UT82NQz60imOlM27jbdoXt2QfyFMm+YhidDkLF1vLUagM6BgD56KyKA==",
  "base64",
);
const APPLE_BUNDLE_ID = "com.resolutioncompanion.app";
const APPLE_APP_ID = 6757996708;
const appleVerifierCache = new Map<Environment, SignedDataVerifier>();

function getAppleVerifier(environment: Environment): SignedDataVerifier {
  const cached = appleVerifierCache.get(environment);
  if (cached) return cached;
  const verifier = new SignedDataVerifier(
    [APPLE_ROOT_CA_G3_DER],
    process.env.APPLE_JWS_ONLINE_CHECKS === "true",
    environment,
    APPLE_BUNDLE_ID,
    environment === Environment.PRODUCTION ? APPLE_APP_ID : undefined,
  );
  appleVerifierCache.set(environment, verifier);
  return verifier;
}

async function verifyAppleTransaction(
  jws: string,
  environment: Environment,
): Promise<any> {
  return getAppleVerifier(environment).verifyAndDecodeTransaction(jws);
}

async function verifyAppleNotification(jws: string): Promise<{
  payload: any;
  environment: Environment;
}> {
  try {
    return {
      payload: await getAppleVerifier(
        Environment.PRODUCTION,
      ).verifyAndDecodeNotification(jws),
      environment: Environment.PRODUCTION,
    };
  } catch (productionError) {
    try {
      return {
        payload: await getAppleVerifier(
          Environment.SANDBOX,
        ).verifyAndDecodeNotification(jws),
        environment: Environment.SANDBOX,
      };
    } catch {
      throw productionError;
    }
  }
}

async function validateAppleReceiptV2(
  transactionId: string,
  productId: string,
): Promise<{
  valid: boolean;
  expiresDate: Date | null;
  originalTransactionId: string | null;
}> {
  try {
    const jwt = await createAppStoreJWT();
    const environment =
      process.env.APPLE_SANDBOX === "true"
        ? Environment.SANDBOX
        : Environment.PRODUCTION;
    const baseUrl =
      environment === Environment.SANDBOX
        ? "https://api.storekit-sandbox.itunes.apple.com"
        : "https://api.storekit.itunes.apple.com";

    const response = await fetch(
      `${baseUrl}/inApps/v1/transactions/${transactionId}`,
      { headers: { Authorization: `Bearer ${jwt}` } },
    );

    if (!response.ok) {
      // If production fails with 4xx, try sandbox
      if (
        response.status >= 400 &&
        response.status < 500 &&
        process.env.APPLE_SANDBOX !== "true"
      ) {
        const sandboxResponse = await fetch(
          `https://api.storekit-sandbox.itunes.apple.com/inApps/v1/transactions/${transactionId}`,
          { headers: { Authorization: `Bearer ${jwt}` } },
        );
        if (!sandboxResponse.ok) {
          console.error(
            "App Store Server API v2: sandbox lookup failed",
            sandboxResponse.status,
          );
          return {
            valid: false,
            expiresDate: null,
            originalTransactionId: null,
          };
        }
        const sandboxData = await sandboxResponse.json();
        const txInfo = await verifyAppleTransaction(
          sandboxData.signedTransactionInfo,
          Environment.SANDBOX,
        );
        if (
          txInfo.productId === productId &&
          !txInfo.revocationDate &&
          ((txInfo.expiresDate && txInfo.expiresDate > Date.now()) ||
            (isLifetimeProduct(productId) && !txInfo.expiresDate))
        ) {
          return {
            valid: true,
            expiresDate: new Date(txInfo.expiresDate),
            originalTransactionId: txInfo.originalTransactionId || null,
          };
        }
        return { valid: false, expiresDate: null, originalTransactionId: null };
      }
      console.error("App Store Server API v2: lookup failed", response.status);
      return { valid: false, expiresDate: null, originalTransactionId: null };
    }

    const data = await response.json();
    // A successful HTTPS response alone is not the entitlement. Verify the
    // Apple-signed transaction before trusting its product or expiry fields.
    const txInfo = await verifyAppleTransaction(
      data.signedTransactionInfo,
      environment,
    );

    if (
      txInfo.productId === productId &&
      !txInfo.revocationDate &&
      ((txInfo.expiresDate && txInfo.expiresDate > Date.now()) ||
        (isLifetimeProduct(productId) && !txInfo.expiresDate))
    ) {
      console.log("Apple receipt validated via App Store Server API v2");
      return {
        valid: true,
        expiresDate: new Date(txInfo.expiresDate),
        originalTransactionId: txInfo.originalTransactionId || null,
      };
    }

    return { valid: false, expiresDate: null, originalTransactionId: null };
  } catch (error) {
    console.error("App Store Server API v2 validation error:", error);
    return { valid: false, expiresDate: null, originalTransactionId: null };
  }
}

// --- Legacy verifyReceipt (deprecated, used as fallback) ---

async function validateAppleReceiptWithUrl(
  receipt: string,
  productId: string,
  verifyUrl: string,
): Promise<{ valid: boolean; status: number; expiresDateMs: number | null }> {
  const sharedSecret = process.env.APPLE_SHARED_SECRET;

  if (!sharedSecret) {
    console.error(
      "APPLE_SHARED_SECRET is not configured — cannot validate receipt",
    );
    return { valid: false, status: -1, expiresDateMs: null };
  }

  const response = await fetch(verifyUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      "receipt-data": receipt,
      password: sharedSecret,
      "exclude-old-transactions": true,
    }),
  });

  const data = await response.json();

  if (data.status === 0 && data.receipt) {
    const inApp = data.receipt.in_app || [];
    const latestReceipt = data.latest_receipt_info || [];
    const allTransactions = [...inApp, ...latestReceipt];

    for (const transaction of allTransactions) {
      if (transaction.product_id === productId) {
        const expiresDate = parseInt(transaction.expires_date_ms || "0");
        if (
          expiresDate > Date.now() ||
          (isLifetimeProduct(productId) && !transaction.cancellation_date_ms)
        ) {
          return { valid: true, status: 0, expiresDateMs: expiresDate };
        }
      }
    }
    return { valid: false, status: 0, expiresDateMs: null };
  }

  return { valid: false, status: data.status, expiresDateMs: null };
}

async function validateAppleReceipt(
  receipt: string,
  productId: string,
  transactionId?: string,
): Promise<{
  valid: boolean;
  expiresDate: Date | null;
  originalTransactionId: string | null;
}> {
  // Prefer App Store Server API v2 when configured and transactionId is available
  if (isAppStoreServerAPIConfigured() && transactionId) {
    console.log("Using App Store Server API v2 for validation");
    return validateAppleReceiptV2(transactionId, productId);
  }

  try {
    // Legacy verifyReceipt endpoints (deprecated by Apple).
    // Will be used as fallback until APPLE_ISSUER_ID, APPLE_KEY_ID, and APPLE_PRIVATE_KEY are configured.
    const productionUrl = "https://buy.itunes.apple.com/verifyReceipt";
    const sandboxUrl = "https://sandbox.itunes.apple.com/verifyReceipt";

    const prodResult = await validateAppleReceiptWithUrl(
      receipt,
      productId,
      productionUrl,
    );

    if (prodResult.valid) {
      console.log("Apple receipt validated via production endpoint");
      return {
        valid: true,
        expiresDate: prodResult.expiresDateMs
          ? new Date(prodResult.expiresDateMs)
          : null,
        originalTransactionId: null,
      };
    }

    if (prodResult.status === -1) {
      return { valid: false, expiresDate: null, originalTransactionId: null };
    }

    if (prodResult.status === 21007) {
      console.log("Sandbox receipt detected, retrying with sandbox endpoint");
      const sandboxResult = await validateAppleReceiptWithUrl(
        receipt,
        productId,
        sandboxUrl,
      );

      if (sandboxResult.valid) {
        console.log("Apple receipt validated via sandbox endpoint");
        return {
          valid: true,
          expiresDate: sandboxResult.expiresDateMs
            ? new Date(sandboxResult.expiresDateMs)
            : null,
          originalTransactionId: null,
        };
      }

      console.log(
        "Sandbox validation failed with status:",
        sandboxResult.status,
      );
      return { valid: false, expiresDate: null, originalTransactionId: null };
    }

    if (prodResult.status === 21008) {
      console.log("Production receipt rejected by production endpoint");
      return { valid: false, expiresDate: null, originalTransactionId: null };
    }

    console.log(
      "Apple receipt validation failed with status:",
      prodResult.status,
    );
    return { valid: false, expiresDate: null, originalTransactionId: null };
  } catch (error) {
    console.error("Apple receipt validation error:", error);
    return { valid: false, expiresDate: null, originalTransactionId: null };
  }
}

async function validateGoogleReceipt(
  receipt: string,
  productId: string,
): Promise<{ valid: boolean; expiresDate: Date | null }> {
  try {
    const serviceAccountKey = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
    if (!serviceAccountKey) {
      console.error(
        "GOOGLE_SERVICE_ACCOUNT_KEY is not configured — cannot validate receipt",
      );
      return { valid: false, expiresDate: null };
    }

    const credentials = JSON.parse(serviceAccountKey);
    const packageName =
      process.env.ANDROID_PACKAGE_NAME || "com.resolutioncompanion.app";

    const tokenResponse = await fetch(`https://oauth2.googleapis.com/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
        assertion: await createGoogleJWT(credentials),
      }),
    });

    const tokenData = await tokenResponse.json();
    const accessToken = tokenData.access_token;

    let receiptData;
    try {
      receiptData = JSON.parse(receipt);
    } catch {
      receiptData = { purchaseToken: receipt };
    }

    const verifyUrl = `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${packageName}/purchases/subscriptions/${productId}/tokens/${receiptData.purchaseToken}`;

    const response = await fetch(verifyUrl, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    const data = await response.json();

    if (data.expiryTimeMillis && parseInt(data.expiryTimeMillis) > Date.now()) {
      return {
        valid: true,
        expiresDate: new Date(parseInt(data.expiryTimeMillis)),
      };
    }

    if (data.paymentState === 1) {
      // Payment received but no expiry data — fall back to plan-based estimate
      return { valid: true, expiresDate: null };
    }

    return { valid: false, expiresDate: null };
  } catch (error) {
    // Fail closed — do not grant access when validation cannot be confirmed
    console.error("Google receipt validation error:", error);
    return { valid: false, expiresDate: null };
  }
}

async function createGoogleJWT(credentials: {
  client_email: string;
  private_key: string;
}): Promise<string> {
  const header = { alg: "RS256", typ: "JWT" };
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    iss: credentials.client_email,
    scope: "https://www.googleapis.com/auth/androidpublisher",
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
  };

  const base64Header = Buffer.from(JSON.stringify(header)).toString(
    "base64url",
  );
  const base64Payload = Buffer.from(JSON.stringify(payload)).toString(
    "base64url",
  );
  const signatureInput = `${base64Header}.${base64Payload}`;

  const crypto = await import("crypto");
  const sign = crypto.createSign("RSA-SHA256");
  sign.update(signatureInput);
  const signature = sign.sign(credentials.private_key, "base64url");

  return `${signatureInput}.${signature}`;
}

// Guard the OpenAI-backed endpoints against oversized payloads (token burn)
const MAX_MESSAGES = 50;
const MAX_MESSAGE_CHARS = 4000;
const MAX_TOTAL_CHARS = 50000;
const VALID_ROLES = new Set(["user", "assistant", "system"]);

function validateMessages(messages: unknown): string | null {
  if (!Array.isArray(messages) || messages.length === 0) {
    return "messages must be a non-empty array";
  }
  if (messages.length > MAX_MESSAGES) {
    return `messages must contain at most ${MAX_MESSAGES} entries`;
  }
  let totalChars = 0;
  for (const message of messages) {
    if (
      typeof message !== "object" ||
      message === null ||
      typeof (message as any).content !== "string" ||
      !VALID_ROLES.has((message as any).role)
    ) {
      return "each message must have a valid role and string content";
    }
    const length = (message as any).content.length;
    if (length > MAX_MESSAGE_CHARS) {
      return `each message must be at most ${MAX_MESSAGE_CHARS} characters`;
    }
    totalChars += length;
  }
  if (totalChars > MAX_TOTAL_CHARS) {
    return `messages must total at most ${MAX_TOTAL_CHARS} characters`;
  }
  return null;
}

// --- Server-side monthly AI quota ---
// The client enforces the advertised free tier (10 check-in SESSIONS/month);
// these limits count individual API requests (a session is many requests), so
// they are abuse ceilings far above legitimate use — hard walls against an
// extracted bundle key burning OpenAI budget, not user-visible caps.
const AI_QUOTAS = {
  chat: { free: 150, premium: 1500 },
  reflection: { free: 150, premium: 1500 },
  extract: { free: 20, premium: 200 },
} as const;

function aiQuota(endpoint: keyof typeof AI_QUOTAS) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      // Production cost controls fail closed. Development can run without a
      // database, where the scoped per-IP limiter remains the guardrail.
      if (!db) {
        if (process.env.NODE_ENV === "production") {
          res
            .status(503)
            .json({ error: "Coaching is temporarily unavailable." });
          return;
        }
        return next();
      }

      const deviceId = req.header("X-Device-Id");
      const usageKey = deviceId || `ip:${req.ip}`;
      const month = new Date().toISOString().slice(0, 7);

      let isPremium = false;
      if (deviceId) {
        const subs = await db
          .select()
          .from(deviceSubscriptions)
          .where(eq(deviceSubscriptions.deviceId, deviceId));
        const sub = subs[0];
        isPremium =
          !!sub &&
          sub.status === "active" &&
          (!sub.currentPeriodEnd ||
            new Date(sub.currentPeriodEnd) > new Date());
      }
      const limit = isPremium
        ? AI_QUOTAS[endpoint].premium
        : AI_QUOTAS[endpoint].free;

      const rows = await db
        .insert(deviceAiUsage)
        .values({
          deviceId: usageKey,
          month,
          endpoint,
          count: 1,
          updatedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: [
            deviceAiUsage.deviceId,
            deviceAiUsage.month,
            deviceAiUsage.endpoint,
          ],
          set: {
            count: sql`${deviceAiUsage.count} + 1`,
            updatedAt: new Date(),
          },
        })
        .returning({ count: deviceAiUsage.count });

      if (rows[0].count > limit) {
        res.status(429).json({
          error: isPremium
            ? "Monthly usage limit reached. Please try again next month."
            : "You've reached this month's free limit. Upgrade to Premium for unlimited coaching.",
        });
        return;
      }

      next();
    } catch (error) {
      console.error("AI quota check error:", error);
      res.status(503).json({ error: "Coaching is temporarily unavailable." });
    }
  };
}

export async function registerRoutes(app: Express): Promise<Server> {
  // Health check for deployment platforms
  app.get("/api/health", (_req: Request, res: Response) => {
    res.json({ status: "ok", timestamp: new Date().toISOString() });
  });

  // Rate limit AI endpoints: 30 requests per minute per IP
  const aiRateLimit = rateLimiter("ai", 30, 60 * 1000);
  // General rate limit for subscription/account endpoints: 60 requests per minute per IP
  const apiRateLimit = rateLimiter("api", 60, 60 * 1000);
  // Webhooks and public forms: 120 requests per minute per IP
  const publicRateLimit = rateLimiter("public", 120, 60 * 1000);

  app.post(
    "/api/chat",
    requireApiKey,
    aiRateLimit,
    aiQuota("chat"),
    async (req: Request, res: Response) => {
      try {
        const { messages } = req.body;

        const validationError = validateMessages(messages);
        if (validationError) {
          res.status(400).json({ error: validationError });
          return;
        }

        res.setHeader("Content-Type", "text/event-stream");
        res.setHeader("Cache-Control", "no-cache");
        res.setHeader("Connection", "keep-alive");
        res.flushHeaders();

        const stream = await getOpenAI().chat.completions.create({
          model: OPENAI_MODEL,
          messages,
          // gpt-5 models reason before responding; minimal effort keeps
          // first-token latency chat-grade and stops reasoning tokens from
          // consuming the completion budget (which returned empty replies).
          reasoning_effort: "minimal",
          max_completion_tokens: 1024,
          stream: true,
          stream_options: { include_usage: true },
        });

        // Mobile clients drop connections often (backgrounding, network loss).
        // Abort the upstream completion so we stop burning tokens on a dead socket.
        req.on("close", () => {
          try {
            stream.controller?.abort();
          } catch {}
        });

        let modelUsage: ModelUsage | null = null;
        for await (const chunk of stream) {
          if (chunk.usage) modelUsage = chunk.usage;
          const content = chunk.choices[0]?.delta?.content || "";
          if (content) {
            res.write(`data: ${JSON.stringify({ content })}\n\n`);
          }
        }

        await recordAiModelUsage("chat", modelUsage);

        res.write("data: [DONE]\n\n");
        res.end();
      } catch (error) {
        // A client disconnect aborts the stream (AbortError) — expected, not a
        // failure; the socket is already gone so there's nothing to send.
        if (req.destroyed || res.writableEnded) return;
        console.error("Chat error:", error);
        res.write(
          `data: ${JSON.stringify({ error: "Failed to get AI response" })}\n\n`,
        );
        res.end();
      }
    },
  );

  app.post(
    "/api/extract-persona",
    requireApiKey,
    aiRateLimit,
    aiQuota("extract"),
    async (req: Request, res: Response) => {
      try {
        const { messages, extractionPrompt } = req.body;

        const validationError = validateMessages(messages);
        if (validationError) {
          res.status(400).json({ error: validationError });
          return;
        }
        if (
          typeof extractionPrompt !== "string" ||
          extractionPrompt.length > 10000
        ) {
          res.status(400).json({
            error:
              "extractionPrompt must be a string of at most 10000 characters",
          });
          return;
        }

        const conversationText = messages
          .filter((m: { role: string }) => m.role !== "system")
          .map(
            (m: { role: string; content: string }) => `${m.role}: ${m.content}`,
          )
          .join("\n");

        const response = await getOpenAI().chat.completions.create({
          model: OPENAI_MODEL,
          messages: [
            {
              role: "system",
              content: extractionPrompt,
            },
            {
              role: "user",
              content: `Here is the conversation:\n\n${conversationText}`,
            },
          ],
          response_format: { type: "json_object" },
          // "low" keeps some reasoning for the rule-heavy extraction; budget
          // raised because reasoning tokens count against it.
          reasoning_effort: "low",
          max_completion_tokens: 4096,
        });

        await recordAiModelUsage("extract", response.usage);

        const content = response.choices[0]?.message?.content || "{}";
        const personaData = JSON.parse(content);

        res.json(personaData);
      } catch (error) {
        console.error("Extract persona error:", error);
        res.status(500).json({ error: "Failed to extract persona" });
      }
    },
  );

  app.post(
    "/api/reflection",
    requireApiKey,
    aiRateLimit,
    aiQuota("reflection"),
    async (req: Request, res: Response) => {
      try {
        const { messages, stream } = req.body;

        const validationError = validateMessages(messages);
        if (validationError) {
          res.status(400).json({ error: validationError });
          return;
        }

        // Real SSE when the client asks for it; the JSON path stays for
        // older app builds (the client previously simulated streaming by
        // replaying the full JSON reply character by character).
        if (stream === true) {
          res.setHeader("Content-Type", "text/event-stream");
          res.setHeader("Cache-Control", "no-cache");
          res.setHeader("Connection", "keep-alive");
          res.flushHeaders();

          const completion = await getOpenAI().chat.completions.create({
            model: OPENAI_MODEL,
            messages,
            reasoning_effort: "minimal",
            max_completion_tokens: 2048,
            stream: true,
            stream_options: { include_usage: true },
          });

          // Abort the upstream completion if the mobile client drops mid-stream,
          // so we don't keep generating (and paying for) tokens on a dead socket.
          req.on("close", () => {
            try {
              completion.controller?.abort();
            } catch {}
          });

          let modelUsage: ModelUsage | null = null;
          for await (const chunk of completion) {
            if (chunk.usage) modelUsage = chunk.usage;
            const content = chunk.choices[0]?.delta?.content || "";
            if (content) {
              res.write(`data: ${JSON.stringify({ content })}\n\n`);
            }
          }

          await recordAiModelUsage("reflection", modelUsage);

          res.write("data: [DONE]\n\n");
          res.end();
          return;
        }

        const response = await getOpenAI().chat.completions.create({
          model: OPENAI_MODEL,
          messages,
          reasoning_effort: "minimal",
          max_completion_tokens: 2048,
        });

        await recordAiModelUsage("reflection", response.usage);

        const content = response.choices[0]?.message?.content || "";
        res.json({ content });
      } catch (error) {
        // Client disconnect aborts the stream (AbortError) — expected; the socket
        // is gone, so don't try to write an error frame to it.
        if (req.destroyed || res.writableEnded) return;
        console.error("Reflection error:", error);
        if (res.headersSent) {
          res.write(
            `data: ${JSON.stringify({ error: "Failed to get AI response" })}\n\n`,
          );
          res.end();
        } else {
          res.status(500).json({ error: "Failed to get AI response" });
        }
      }
    },
  );

  app.post(
    "/api/milestone-proposal",
    requireApiKey,
    aiRateLimit,
    aiQuota("reflection"),
    async (req: Request, res: Response) => {
      try {
        const { completedMilestone, personaName } = req.body;
        if (
          typeof completedMilestone !== "string" ||
          completedMilestone.trim().length < 2 ||
          completedMilestone.length > 200 ||
          typeof personaName !== "string" ||
          personaName.trim().length < 2 ||
          personaName.length > 100
        ) {
          res.status(400).json({ error: "Invalid milestone context" });
          return;
        }

        const response = await getOpenAI().chat.completions.create({
          model: OPENAI_MODEL,
          messages: [
            {
              role: "system",
              content:
                "Suggest exactly one concrete next behavior milestone for an identity-based habit app. Build gently on the completed milestone, use 3-10 words, avoid numbers unless the completed milestone uses one, and never give medical or mental-health treatment advice. Return JSON with only a title field.",
            },
            {
              role: "user",
              content: `Identity: ${personaName.trim()}\nCompleted milestone: ${completedMilestone.trim()}`,
            },
          ],
          response_format: { type: "json_object" },
          reasoning_effort: "minimal",
          max_completion_tokens: 256,
        });
        await recordAiModelUsage("milestone-proposal", response.usage);
        const parsed = JSON.parse(
          response.choices[0]?.message?.content || "{}",
        ) as { title?: unknown };
        if (typeof parsed.title !== "string") {
          res.status(502).json({ error: "Invalid coach suggestion" });
          return;
        }
        const title = parsed.title
          .replace(/[\r\n]+/g, " ")
          .trim()
          .slice(0, 100);
        if (title.length < 3) {
          res.status(502).json({ error: "Invalid coach suggestion" });
          return;
        }
        res.json({ title });
      } catch (error) {
        console.error("Milestone proposal error:", error);
        res.status(500).json({ error: "Failed to suggest a milestone" });
      }
    },
  );

  app.post(
    "/api/feedback",
    publicRateLimit,
    async (req: Request, res: Response) => {
      try {
        const { name, email, type, message } = req.body;

        if (!name || !email || !type || !message) {
          res.status(400).json({ error: "All fields are required" });
          return;
        }

        if (
          typeof email !== "string" ||
          !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
        ) {
          res.status(400).json({ error: "A valid email address is required" });
          return;
        }

        if (!db) {
          console.log(
            `Feedback received (no DB): ${name} (${email}): ${type} - ${message}`,
          );
          res.json({ success: true, id: Date.now().toString() });
          return;
        }

        const [entry] = await db
          .insert(websiteFeedback)
          .values({
            name,
            email,
            feedbackType: type,
            message,
          })
          .returning();

        console.log(`New feedback received from ${name} (${email}): ${type}`);
        res.json({ success: true, id: entry.id });
      } catch (error) {
        console.error("Feedback error:", error);
        res.status(500).json({ error: "Failed to submit feedback" });
      }
    },
  );

  // Admin-only: feedback entries contain names and email addresses.
  // The regular API key ships in the app bundle, so this uses a separate
  // operator-only secret and 404s when it isn't configured.
  app.get(
    "/api/feedback",
    requireAdminKey,
    async (req: Request, res: Response) => {
      try {
        if (!db) {
          res.json([]);
          return;
        }
        const feedback = await db.select().from(websiteFeedback);
        res.json(feedback);
      } catch (error) {
        console.error("Error fetching feedback:", error);
        res.status(500).json({ error: "Failed to fetch feedback" });
      }
    },
  );

  // Aggregate product telemetry. The client batches {event, day, count}
  // increments and flushes opportunistically; the server only ever stores
  // per-day counters (see deviceEvents in shared/schema.ts). Fire-and-forget
  // from the client's perspective: always 204 unless the request is malformed,
  // so a telemetry outage can never surface as a user-visible error.
  // Fixed allowlist — mirrors the TelemetryEvent union in client/lib/telemetry.ts.
  // Free-form event names would let a caller with the (extractable) app key mint
  // unbounded distinct rows; keying rows by (deviceId, day, event) means the only
  // way to bound table growth is to bound the event and day dimensions here.
  const TELEMETRY_EVENTS = new Set<string>([
    "app_open",
    "onboarding_started",
    "onboarding_completed",
    "onboarding_declined_ai",
    "first_action_logged",
    "action_logged",
    "day_complete",
    "milestone_complete",
    "coach_session_started",
    "weekly_review_started",
    "paywall_viewed",
    "paywall_purchase_success",
    "paywall_restore_success",
    "notification_tap",
    "notification_mark_all_done",
    "widget_action_logged",
    "health_auto_vote",
    "recap_viewed",
    "recap_shared",
    "insights_viewed",
    "shield_earned",
    "shield_used",
    "reward_unlocked",
    "coach_observation_opened",
    "micro_note_read",
    "year_recap_shared",
    "witness_progress_shared",
    "icloud_backup_created",
    "icloud_backup_restored",
    "client_error",
  ]);
  const TELEMETRY_DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
  const TELEMETRY_DEVICE_RE = /^[A-Za-z0-9._-]{8,64}$/;
  // Reject semantically-bogus days (e.g. 9999-99-99) and anything outside a sane
  // recent window, so `day` can't be used as an unbounded distinct-row dimension.
  const isValidTelemetryDay = (day: string): boolean => {
    if (!TELEMETRY_DAY_RE.test(day)) return false;
    const [y, m, d] = day.split("-").map(Number);
    const dt = new Date(Date.UTC(y, m - 1, d));
    if (
      dt.getUTCFullYear() !== y ||
      dt.getUTCMonth() !== m - 1 ||
      dt.getUTCDate() !== d
    )
      return false;
    const ms = dt.getTime();
    // clean-slate app; no real telemetry predates 2024, allow ~2d future for TZ skew
    return ms >= Date.UTC(2024, 0, 1) && ms <= Date.now() + 2 * 86_400_000;
  };
  app.post(
    "/api/telemetry",
    requireApiKey,
    apiRateLimit,
    async (req: Request, res: Response) => {
      const { deviceId, events } = req.body ?? {};
      if (
        typeof deviceId !== "string" ||
        !TELEMETRY_DEVICE_RE.test(deviceId) ||
        !Array.isArray(events) ||
        events.length === 0 ||
        events.length > 50
      ) {
        res.status(400).json({ error: "Invalid telemetry payload" });
        return;
      }
      for (const entry of events) {
        if (
          !entry ||
          typeof entry.event !== "string" ||
          !TELEMETRY_EVENTS.has(entry.event) ||
          typeof entry.day !== "string" ||
          !isValidTelemetryDay(entry.day) ||
          typeof entry.count !== "number" ||
          !Number.isInteger(entry.count) ||
          entry.count < 1 ||
          entry.count > 1000
        ) {
          res.status(400).json({ error: "Invalid telemetry event" });
          return;
        }
      }

      if (db) {
        try {
          // Merge duplicate (day,event) tuples first: a single INSERT can't hit
          // the same ON CONFLICT row twice, and it collapses the old per-entry
          // loop (up to 50 sequential round-trips) into one statement.
          const merged = new Map<
            string,
            { day: string; event: string; count: number }
          >();
          for (const e of events) {
            const key = `${e.day}|${e.event}`;
            const prev = merged.get(key);
            if (prev) prev.count = Math.min(prev.count + e.count, 1_000_000);
            else
              merged.set(key, { day: e.day, event: e.event, count: e.count });
          }
          const rows = Array.from(merged.values()).map((e) => ({
            deviceId,
            day: e.day,
            event: e.event,
            count: e.count,
          }));
          await db
            .insert(deviceEvents)
            .values(rows)
            .onConflictDoUpdate({
              target: [
                deviceEvents.deviceId,
                deviceEvents.day,
                deviceEvents.event,
              ],
              set: {
                count: sql`${deviceEvents.count} + excluded.count`,
                updatedAt: sql`CURRENT_TIMESTAMP`,
              },
            });
        } catch (error) {
          // Telemetry is best-effort; never bubble a counter failure to the app.
          console.error("Telemetry write error:", error);
        }
      }
      res.status(204).end();
    },
  );

  // Admin-only aggregate view: per-event daily totals + unique device counts.
  // Deliberately never returns device ids — operators see funnels, not users.
  app.get(
    "/api/telemetry/summary",
    requireAdminKey,
    async (req: Request, res: Response) => {
      try {
        if (!db) {
          res.json([]);
          return;
        }
        const since =
          typeof req.query.since === "string" &&
          TELEMETRY_DAY_RE.test(req.query.since)
            ? req.query.since
            : "0000-00-00";
        const rows = await db
          .select({
            day: deviceEvents.day,
            event: deviceEvents.event,
            devices: sql<number>`count(distinct ${deviceEvents.deviceId})`,
            total: sql<number>`sum(${deviceEvents.count})`,
          })
          .from(deviceEvents)
          .where(sql`${deviceEvents.day} >= ${since}`)
          .groupBy(deviceEvents.day, deviceEvents.event)
          .orderBy(deviceEvents.day, deviceEvents.event);
        res.json(rows);
      } catch (error) {
        console.error("Telemetry summary error:", error);
        res.status(500).json({ error: "Failed to fetch telemetry summary" });
      }
    },
  );

  // Admin-only AI usage totals. Model + token counts let operations apply the
  // current provider price without storing a prompt, response, or device id.
  app.get(
    "/api/telemetry/ai-usage",
    requireAdminKey,
    async (req: Request, res: Response) => {
      try {
        if (!db) {
          res.json([]);
          return;
        }
        const since =
          typeof req.query.since === "string" &&
          TELEMETRY_DAY_RE.test(req.query.since)
            ? req.query.since
            : "0000-00-00";
        const rows = await db
          .select({
            day: aiUsageDaily.day,
            endpoint: aiUsageDaily.endpoint,
            model: aiUsageDaily.model,
            requests: aiUsageDaily.requests,
            inputTokens: aiUsageDaily.inputTokens,
            outputTokens: aiUsageDaily.outputTokens,
          })
          .from(aiUsageDaily)
          .where(sql`${aiUsageDaily.day} >= ${since}`)
          .orderBy(aiUsageDaily.day, aiUsageDaily.endpoint);
        res.json(rows);
      } catch (error) {
        console.error("AI usage summary error:", error);
        res.status(500).json({ error: "Failed to fetch AI usage summary" });
      }
    },
  );

  app.get(
    "/api/subscription/status/:deviceId",
    requireApiKey,
    apiRateLimit,
    async (req: Request, res: Response) => {
      try {
        const { deviceId } = req.params;

        if (!db) {
          res.json({ isPremium: false, plan: "free", status: "inactive" });
          return;
        }

        const results = await db
          .select()
          .from(deviceSubscriptions)
          .where(eq(deviceSubscriptions.deviceId, deviceId));

        if (results.length === 0) {
          res.json({ isPremium: false, plan: "free", status: "inactive" });
          return;
        }

        const sub = results[0];
        const isPremium =
          sub.status === "active" &&
          (!sub.currentPeriodEnd ||
            new Date(sub.currentPeriodEnd) > new Date());

        res.json({
          isPremium,
          plan: sub.plan,
          status: sub.status,
          currentPeriodEnd: sub.currentPeriodEnd?.toISOString() || null,
        });
      } catch (error) {
        console.error("Subscription status error:", error);
        res.status(500).json({ error: "Failed to get subscription status" });
      }
    },
  );

  // Restore subscription by looking up the active record in the database for this device.
  // Native IAP purchases are tracked server-side via /api/iap/validate; this endpoint
  // lets the client re-sync that state (e.g. after a reinstall).
  app.post(
    "/api/subscription/restore",
    requireApiKey,
    apiRateLimit,
    async (req: Request, res: Response) => {
      try {
        const { deviceId } = req.body;

        if (!deviceId) {
          res.status(400).json({ error: "deviceId is required" });
          return;
        }

        if (!db) {
          res.json({ success: false, message: "Database not available" });
          return;
        }

        const results = await db
          .select()
          .from(deviceSubscriptions)
          .where(eq(deviceSubscriptions.deviceId, deviceId));

        if (results.length === 0) {
          res.json({
            success: false,
            message: "No subscription record found for this device",
          });
          return;
        }

        const sub = results[0];
        const isPremium =
          sub.status === "active" &&
          (!sub.currentPeriodEnd ||
            new Date(sub.currentPeriodEnd) > new Date());

        if (!isPremium) {
          res.json({
            success: false,
            message: "No active subscription found for this device",
          });
          return;
        }

        res.json({
          success: true,
          isPremium: true,
          plan: sub.plan,
          currentPeriodEnd: sub.currentPeriodEnd?.toISOString() || null,
        });
      } catch (error) {
        console.error("Restore subscription error:", error);
        res.status(500).json({ error: "Failed to restore subscription" });
      }
    },
  );

  app.delete(
    "/api/user-data/:deviceId",
    requireApiKey,
    apiRateLimit,
    async (req: Request, res: Response) => {
      try {
        const { deviceId } = req.params;

        if (!deviceId) {
          res.status(400).json({ error: "deviceId is required" });
          return;
        }

        if (!db) {
          res.json({ success: true, message: "No server data to delete" });
          return;
        }

        const deleted = await db
          .delete(deviceSubscriptions)
          .where(eq(deviceSubscriptions.deviceId, deviceId))
          .returning();

        await db
          .delete(deviceAiUsage)
          .where(eq(deviceAiUsage.deviceId, deviceId));

        // Purge aggregate product telemetry too, so the "all data deleted"
        // promise stays true now that we keep per-day event counts.
        await db
          .delete(deviceEvents)
          .where(eq(deviceEvents.deviceId, deviceId));

        res.json({
          success: true,
          message:
            deleted.length > 0
              ? "All server-side data for this device has been deleted"
              : "No server data found for this device",
        });
      } catch (error) {
        console.error("User data deletion error:", error);
        res.status(500).json({ error: "Failed to delete user data" });
      }
    },
  );

  app.post(
    "/api/iap/validate",
    requireApiKey,
    apiRateLimit,
    async (req: Request, res: Response) => {
      try {
        const { deviceId, platform, productId, transactionId, receipt } =
          req.body;

        if (!deviceId || !platform || !productId || !receipt) {
          res
            .status(400)
            .json({ error: "Missing required fields", valid: false });
          return;
        }

        const allowedProducts = new Set(
          [
            "com.resolutioncompanion.monthly",
            "com.resolutioncompanion.annual",
            LIFETIME_PRODUCT_ID,
            YEARLY_TEST_PRODUCT_ID,
            "premium_monthly",
            "premium_yearly",
            "premium_lifetime",
          ].filter(Boolean),
        );
        if (!allowedProducts.has(productId)) {
          res.status(400).json({ error: "Unknown product", valid: false });
          return;
        }

        // StoreKit 2 validation is keyed by transaction ID; without it the
        // legacy verifyReceipt fallback would be handed a JWS token it cannot
        // parse, and the subscription row would be stored as "iap_undefined".
        if (platform === "ios" && !transactionId) {
          res
            .status(400)
            .json({ error: "transactionId is required for iOS", valid: false });
          return;
        }

        let isValid = false;
        let expirationDate: Date | null = null;
        let originalTransactionId: string | null = null;

        if (platform === "ios") {
          const result = await validateAppleReceipt(
            receipt,
            productId,
            transactionId,
          );
          isValid = result.valid;
          expirationDate = result.expiresDate;
          originalTransactionId = result.originalTransactionId;
        } else if (platform === "android") {
          const result = await validateGoogleReceipt(receipt, productId);
          isValid = result.valid;
          expirationDate = result.expiresDate;
        }

        // Fall back to plan-based estimate only if the store didn't provide an expiry
        if (isValid && !expirationDate && !isLifetimeProduct(productId)) {
          expirationDate =
            planForProduct(productId) === "yearly"
              ? new Date(Date.now() + 365 * 24 * 60 * 60 * 1000)
              : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
        }

        if (isValid && db) {
          const plan = planForProduct(productId);

          // For Android, store the purchase token so Play webhooks can be matched
          // to this exact subscription. For iOS, key by the ORIGINAL transaction
          // ID: App Store Server Notifications identify subscriptions by
          // originalTransactionId, which stays stable across renewals while the
          // per-renewal transactionId changes.
          const appleId = originalTransactionId || transactionId;
          let providerCustomerId = `iap_ios_${appleId}`;
          if (platform === "android") {
            let purchaseToken = receipt;
            try {
              purchaseToken = JSON.parse(receipt).purchaseToken || receipt;
            } catch {}
            providerCustomerId = `iap_android_${purchaseToken}`;
          }

          const subscriptionData = {
            providerCustomerId,
            providerTransactionId: `iap_${platform === "ios" ? appleId : transactionId}`,
            plan: plan,
            status: "active" as const,
            currentPeriodEnd: expirationDate,
            updatedAt: new Date(),
          };

          const existing = await db
            .select()
            .from(deviceSubscriptions)
            .where(eq(deviceSubscriptions.deviceId, deviceId));

          if (existing.length > 0) {
            await db
              .update(deviceSubscriptions)
              .set(subscriptionData)
              .where(eq(deviceSubscriptions.deviceId, deviceId));
          } else {
            await db.insert(deviceSubscriptions).values({
              deviceId: deviceId,
              ...subscriptionData,
            });
          }
        }

        res.json({
          valid: isValid,
          plan: planForProduct(productId),
          expirationDate: expirationDate?.toISOString() || null,
        });
      } catch (error) {
        console.error("IAP validation error:", error);
        res.status(500).json({ error: "Validation failed", valid: false });
      }
    },
  );

  // --- Apple App Store Server Notifications V2 ---
  // Configure this URL in App Store Connect > App > App Store Server Notifications
  // Apple sends JWS-signed notifications for subscription lifecycle events.
  app.post(
    "/api/webhooks/apple",
    publicRateLimit,
    async (req: Request, res: Response) => {
      try {
        const { signedPayload } = req.body;
        if (!signedPayload) {
          res.status(400).json({ error: "Missing signedPayload" });
          return;
        }

        // Verify the JWS signature chain against Apple Root CA G3
        let payload: any;
        let verifiedEnvironment: Environment;
        try {
          const verified = await verifyAppleNotification(signedPayload);
          payload = verified.payload;
          verifiedEnvironment = verified.environment;
        } catch (verifyError) {
          console.error("Apple webhook: JWS verification failed:", verifyError);
          res.status(403).json({ error: "Invalid signature" });
          return;
        }

        const notificationType = payload.notificationType;
        const subtype = payload.subtype;

        console.log(
          `Apple S2S notification: ${notificationType} (${subtype || "none"})`,
        );

        // Decode the nested transaction info
        if (!payload.data?.signedTransactionInfo) {
          console.log("No transaction info in Apple notification");
          res.status(200).json({ ok: true });
          return;
        }

        // The nested signedTransactionInfo is also JWS-signed by Apple
        const txInfo = await verifyAppleTransaction(
          payload.data.signedTransactionInfo,
          verifiedEnvironment,
        );
        const originalTransactionId =
          txInfo.originalTransactionId || txInfo.transactionId;
        const expiresDate = txInfo.expiresDate
          ? new Date(txInfo.expiresDate)
          : null;

        if (!db) {
          console.log("Apple webhook: no database available");
          res.status(200).json({ ok: true });
          return;
        }

        // Look up the subscription by the IAP transaction ID stored in providerTransactionId
        const lookupId = `iap_${originalTransactionId}`;
        const results = await db
          .select()
          .from(deviceSubscriptions)
          .where(eq(deviceSubscriptions.providerTransactionId, lookupId));

        if (results.length === 0) {
          // Also try with the prefix format used during validation
          const altResults = await db
            .select()
            .from(deviceSubscriptions)
            .where(
              sql`${deviceSubscriptions.providerTransactionId} LIKE ${"iap_%" + originalTransactionId}`,
            );

          if (altResults.length === 0) {
            console.log(
              `Apple webhook: no subscription found for transaction ${originalTransactionId}`,
            );
            res.status(200).json({ ok: true });
            return;
          }
          results.push(...altResults);
        }

        const sub = results[0];

        switch (notificationType) {
          case "DID_RENEW":
            await db
              .update(deviceSubscriptions)
              .set({
                status: "active",
                currentPeriodEnd: expiresDate,
                updatedAt: new Date(),
              })
              .where(eq(deviceSubscriptions.id, sub.id));
            console.log(
              `Apple webhook: renewed subscription for device ${sub.deviceId}`,
            );
            break;

          case "EXPIRED":
          case "REVOKE":
            await db
              .update(deviceSubscriptions)
              .set({
                status: "inactive",
                updatedAt: new Date(),
              })
              .where(eq(deviceSubscriptions.id, sub.id));
            console.log(
              `Apple webhook: ${notificationType.toLowerCase()} subscription for device ${sub.deviceId}`,
            );
            break;

          case "DID_CHANGE_RENEWAL_STATUS":
            if (subtype === "AUTO_RENEW_DISABLED") {
              console.log(
                `Apple webhook: auto-renew disabled for device ${sub.deviceId}, expires ${expiresDate?.toISOString()}`,
              );
              // Keep active until expiry — just log
            }
            break;

          case "REFUND":
            await db
              .update(deviceSubscriptions)
              .set({
                status: "inactive",
                updatedAt: new Date(),
              })
              .where(eq(deviceSubscriptions.id, sub.id));
            console.log(
              `Apple webhook: refund — revoked access for device ${sub.deviceId}`,
            );
            break;

          case "GRACE_PERIOD_EXPIRED":
            await db
              .update(deviceSubscriptions)
              .set({
                status: "inactive",
                updatedAt: new Date(),
              })
              .where(eq(deviceSubscriptions.id, sub.id));
            console.log(
              `Apple webhook: grace period expired for device ${sub.deviceId}`,
            );
            break;

          default:
            console.log(
              `Apple webhook: unhandled notification type ${notificationType}`,
            );
        }

        res.status(200).json({ ok: true });
      } catch (error) {
        console.error("Apple webhook error:", error);
        // Always return 200 to Apple so they don't retry indefinitely
        res.status(200).json({ ok: true });
      }
    },
  );

  // --- Google Real-time Developer Notifications ---
  // Configure via Google Cloud Pub/Sub push subscription pointing to this endpoint.
  // Set up in Google Play Console > Monetization > Monetization setup > Real-time developer notifications.
  app.post(
    "/api/webhooks/google",
    publicRateLimit,
    async (req: Request, res: Response) => {
      try {
        const { message } = req.body;
        if (!message?.data) {
          res.status(400).json({ error: "Missing message data" });
          return;
        }

        // Decode the base64-encoded Pub/Sub message
        const decoded = JSON.parse(
          Buffer.from(message.data, "base64").toString("utf-8"),
        );
        const subscriptionNotification = decoded.subscriptionNotification;

        if (!subscriptionNotification) {
          console.log("Google webhook: no subscriptionNotification in message");
          res.status(200).json({ ok: true });
          return;
        }

        const { notificationType, purchaseToken, subscriptionId } =
          subscriptionNotification;
        console.log(
          `Google S2S notification: type=${notificationType} subscription=${subscriptionId}`,
        );

        if (!db) {
          console.log("Google webhook: no database available");
          res.status(200).json({ ok: true });
          return;
        }

        // Google notification types:
        // 1=RECOVERED, 2=RENEWED, 3=CANCELED, 4=PURCHASED, 5=ON_HOLD,
        // 6=IN_GRACE_PERIOD, 7=RESTARTED, 12=REVOKED, 13=EXPIRED

        // Match the exact subscription this notification concerns via the stored
        // purchase token — never act on an arbitrary record.
        const results = await db
          .select()
          .from(deviceSubscriptions)
          .where(
            eq(
              deviceSubscriptions.providerCustomerId,
              `iap_android_${purchaseToken}`,
            ),
          );

        // For Google, we need to re-verify with the Play API to get current status
        if (results.length > 0) {
          const sub = results[0];

          switch (notificationType) {
            case 2: // RENEWED
            case 7: // RESTARTED
              const renewResult = await validateGoogleReceipt(
                JSON.stringify({ purchaseToken }),
                subscriptionId,
              );
              if (renewResult.valid) {
                await db
                  .update(deviceSubscriptions)
                  .set({
                    status: "active",
                    currentPeriodEnd: renewResult.expiresDate,
                    updatedAt: new Date(),
                  })
                  .where(eq(deviceSubscriptions.id, sub.id));
                console.log(
                  `Google webhook: renewed subscription for device ${sub.deviceId}`,
                );
              }
              break;

            case 3: // CANCELED (auto-renew off — access continues until expiry)
            case 12: // REVOKED
            case 13: // EXPIRED
              // Never trust the unauthenticated Pub/Sub payload to revoke access:
              // re-verify the actual subscription state with the Play API first.
              // This also keeps CANCELED subscriptions active until they expire.
              const cancelResult = await validateGoogleReceipt(
                JSON.stringify({ purchaseToken }),
                subscriptionId,
              );
              if (cancelResult.valid) {
                await db
                  .update(deviceSubscriptions)
                  .set({
                    status: "active",
                    currentPeriodEnd: cancelResult.expiresDate,
                    updatedAt: new Date(),
                  })
                  .where(eq(deviceSubscriptions.id, sub.id));
                console.log(
                  `Google webhook: type=${notificationType} but Play API reports active until ${cancelResult.expiresDate?.toISOString()} — keeping access for device ${sub.deviceId}`,
                );
              } else {
                await db
                  .update(deviceSubscriptions)
                  .set({
                    status: "inactive",
                    updatedAt: new Date(),
                  })
                  .where(eq(deviceSubscriptions.id, sub.id));
                console.log(
                  `Google webhook: deactivated subscription for device ${sub.deviceId}`,
                );
              }
              break;

            case 5: // ON_HOLD
            case 6: // IN_GRACE_PERIOD
              console.log(
                `Google webhook: subscription on hold/grace for device ${sub.deviceId}`,
              );
              break;

            default:
              console.log(`Google webhook: unhandled type ${notificationType}`);
          }
        } else {
          console.log("Google webhook: no matching subscription found");
        }

        // Always acknowledge the Pub/Sub message
        res.status(200).json({ ok: true });
      } catch (error) {
        console.error("Google webhook error:", error);
        res.status(200).json({ ok: true });
      }
    },
  );

  const httpServer = createServer(app);
  return httpServer;
}
