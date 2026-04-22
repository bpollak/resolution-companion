import type { Express, Request, Response } from "express";
import { createServer, type Server } from "node:http";
import * as crypto from "node:crypto";
import OpenAI from "openai";
import { z } from "zod";
import { db } from "./db";
import { websiteFeedback, deviceSubscriptions } from "@shared/schema";
import { sql, eq } from "drizzle-orm";
import { rateLimiter, deviceOrIpKey } from "./rate-limit";
import { requireApiKey } from "./auth";

const openai = new OpenAI({
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
});

// --- AI request validation ---
// User text is forwarded to OpenAI. Cap lengths so abusive callers can't run
// up the bill or slip prompt-injection payloads past us, and validate shape so
// broken clients fail fast with a 400 rather than a 500 from OpenAI.

const MAX_MESSAGE_CHARS = 4000;
const MAX_MESSAGE_COUNT = 40;
const MAX_EXTRACTION_PROMPT_CHARS = 4000;

const aiMessageSchema = z.object({
  role: z.enum(["system", "user", "assistant"]),
  content: z.string().min(1).max(MAX_MESSAGE_CHARS),
});

const aiMessagesSchema = z.array(aiMessageSchema).min(1).max(MAX_MESSAGE_COUNT);

const extractPersonaSchema = z.object({
  messages: aiMessagesSchema,
  extractionPrompt: z.string().min(1).max(MAX_EXTRACTION_PROMPT_CHARS),
});

/**
 * Run OpenAI's Moderation API over just the user-authored turns. Returns true
 * iff the content is safe. On error we fail closed — we would rather block a
 * legitimate message than forward CSAM/self-harm/etc to the model.
 */
async function moderateUserContent(
  messages: { role: string; content: string }[],
): Promise<boolean> {
  const userText = messages
    .filter((m) => m.role === "user")
    .map((m) => m.content)
    .join("\n")
    .slice(0, 8000);

  if (!userText) return true;

  try {
    const res = await openai.moderations.create({
      model: "omni-moderation-latest",
      input: userText,
    });
    return !res.results.some((r) => r.flagged);
  } catch (error) {
    console.error("Moderation check failed:", error);
    return false;
  }
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
  const signature = sign.sign(privateKey, "base64url");

  return `${signatureInput}.${signature}`;
}

function decodeJWSPayload(jws: string): any {
  const parts = jws.split(".");
  if (parts.length !== 3) throw new Error("Invalid JWS format");
  return JSON.parse(Buffer.from(parts[1], "base64url").toString("utf-8"));
}

function decodeJWSHeader(jws: string): any {
  const parts = jws.split(".");
  if (parts.length !== 3) throw new Error("Invalid JWS format");
  return JSON.parse(Buffer.from(parts[0], "base64url").toString("utf-8"));
}

// Apple Root CA - G3 certificate (DER, base64-encoded)
// Download from https://www.apple.com/certificateauthority/AppleRootCA-G3.cer
// This is the trust anchor for all App Store Server Notifications V2.
const APPLE_ROOT_CA_G3_FINGERPRINT_SHA256 =
  "b0b1730ecbc7ff4505142c49f1295e6eda6bcaed7e2c68c5be91b5a11001f024";

/**
 * Verify an Apple JWS signed payload:
 * 1. Extract x5c certificate chain from JWS header
 * 2. Verify the leaf cert was issued by an intermediate signed by Apple Root CA G3
 * 3. Verify the JWS signature using the leaf cert's public key
 *
 * Returns the decoded payload if valid, throws if verification fails.
 */
function verifyAppleJWS(jws: string): any {
  const parts = jws.split(".");
  if (parts.length !== 3) throw new Error("Invalid JWS format");

  const header = decodeJWSHeader(jws);
  const x5c: string[] | undefined = header.x5c;

  if (!x5c || x5c.length < 3) {
    throw new Error(
      "Missing or incomplete x5c certificate chain in JWS header",
    );
  }

  // Build PEM certificates from the base64-encoded DER certs in x5c
  const certs = x5c.map((certBase64) => {
    const lines = certBase64.match(/.{1,64}/g)!.join("\n");
    return `-----BEGIN CERTIFICATE-----\n${lines}\n-----END CERTIFICATE-----`;
  });

  // Verify the root certificate matches Apple Root CA G3
  const rootCertDer = Buffer.from(x5c[x5c.length - 1], "base64");
  const rootFingerprint = crypto
    .createHash("sha256")
    .update(rootCertDer)
    .digest("hex");

  if (rootFingerprint !== APPLE_ROOT_CA_G3_FINGERPRINT_SHA256) {
    throw new Error(
      `Root certificate fingerprint mismatch: expected Apple Root CA G3, got ${rootFingerprint}`,
    );
  }

  // Verify the certificate chain: each cert should be signed by the next one
  for (let i = 0; i < certs.length - 1; i++) {
    const certObj = new crypto.X509Certificate(certs[i]);
    const issuerCert = new crypto.X509Certificate(certs[i + 1]);

    if (!certObj.verify(issuerCert.publicKey)) {
      throw new Error(`Certificate chain verification failed at index ${i}`);
    }
  }

  // Verify the root cert is self-signed
  const rootCertObj = new crypto.X509Certificate(certs[certs.length - 1]);
  if (!rootCertObj.verify(rootCertObj.publicKey)) {
    throw new Error("Root certificate is not self-signed");
  }

  // Verify the JWS signature using the leaf certificate's public key
  const leafCert = new crypto.X509Certificate(certs[0]);
  const signatureInput = `${parts[0]}.${parts[1]}`;
  const signature = Buffer.from(parts[2], "base64url");

  const alg = header.alg;
  let algorithm: string;
  if (alg === "ES256") {
    algorithm = "SHA256";
  } else if (alg === "PS256" || alg === "RS256") {
    algorithm = "SHA256";
  } else {
    throw new Error(`Unsupported JWS algorithm: ${alg}`);
  }

  const verifier = crypto.createVerify(algorithm);
  verifier.update(signatureInput);

  const isValid = verifier.verify(
    {
      key: leafCert.publicKey,
      // ES256 uses ECDSA with DER-encoded signatures in JWS
      ...(alg === "ES256" ? { dsaEncoding: "ieee-p1363" as const } : {}),
    },
    signature,
  );

  if (!isValid) {
    throw new Error("JWS signature verification failed");
  }

  // Signature is valid — return the decoded payload
  return JSON.parse(Buffer.from(parts[1], "base64url").toString("utf-8"));
}

async function validateAppleReceiptV2(
  transactionId: string,
  productId: string,
): Promise<{ valid: boolean; expiresDate: Date | null }> {
  try {
    const jwt = await createAppStoreJWT();
    const baseUrl =
      process.env.APPLE_SANDBOX === "true"
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
          return { valid: false, expiresDate: null };
        }
        const sandboxData = await sandboxResponse.json();
        const txInfo = decodeJWSPayload(sandboxData.signedTransactionInfo);
        if (
          txInfo.productId === productId &&
          txInfo.expiresDate &&
          txInfo.expiresDate > Date.now()
        ) {
          return { valid: true, expiresDate: new Date(txInfo.expiresDate) };
        }
        return { valid: false, expiresDate: null };
      }
      console.error("App Store Server API v2: lookup failed", response.status);
      return { valid: false, expiresDate: null };
    }

    const data = await response.json();
    const txInfo = decodeJWSPayload(data.signedTransactionInfo);

    if (
      txInfo.productId === productId &&
      txInfo.expiresDate &&
      txInfo.expiresDate > Date.now()
    ) {
      console.log("Apple receipt validated via App Store Server API v2");
      return { valid: true, expiresDate: new Date(txInfo.expiresDate) };
    }

    return { valid: false, expiresDate: null };
  } catch (error) {
    console.error("App Store Server API v2 validation error:", error);
    return { valid: false, expiresDate: null };
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
        if (expiresDate > Date.now()) {
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
): Promise<{ valid: boolean; expiresDate: Date | null }> {
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
      };
    }

    if (prodResult.status === -1) {
      return { valid: false, expiresDate: null };
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
        };
      }

      console.log(
        "Sandbox validation failed with status:",
        sandboxResult.status,
      );
      return { valid: false, expiresDate: null };
    }

    if (prodResult.status === 21008) {
      console.log("Production receipt rejected by production endpoint");
      return { valid: false, expiresDate: null };
    }

    console.log(
      "Apple receipt validation failed with status:",
      prodResult.status,
    );
    return { valid: false, expiresDate: null };
  } catch (error) {
    console.error("Apple receipt validation error:", error);
    return { valid: false, expiresDate: null };
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

export async function registerRoutes(app: Express): Promise<Server> {
  // Health check for deployment platforms
  app.get("/api/health", (_req: Request, res: Response) => {
    res.json({ status: "ok", timestamp: new Date().toISOString() });
  });

  // Rate limit AI endpoints: keyed per-device so NAT'd mobile users don't share
  // a budget, and low enough that an abusive caller can't run up the bill.
  const aiRateLimit = rateLimiter(8, 60 * 1000, deviceOrIpKey);

  app.post(
    "/api/chat",
    requireApiKey,
    aiRateLimit,
    async (req: Request, res: Response) => {
      const parsed = z
        .object({ messages: aiMessagesSchema })
        .safeParse(req.body);
      if (!parsed.success) {
        res
          .status(400)
          .json({ error: "Invalid request", details: parsed.error.flatten() });
        return;
      }

      const { messages } = parsed.data;

      const safe = await moderateUserContent(messages);
      if (!safe) {
        res.status(400).json({ error: "Message violates our content policy." });
        return;
      }

      try {
        res.setHeader("Content-Type", "text/event-stream");
        res.setHeader("Cache-Control", "no-cache");
        res.setHeader("Connection", "keep-alive");
        res.flushHeaders();

        const stream = await openai.chat.completions.create({
          model: "gpt-4o",
          messages,
          max_completion_tokens: 1024,
          stream: true,
        });

        for await (const chunk of stream) {
          const content = chunk.choices[0]?.delta?.content || "";
          if (content) {
            res.write(`data: ${JSON.stringify({ content })}\n\n`);
          }
        }

        res.write("data: [DONE]\n\n");
        res.end();
      } catch (error) {
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
    async (req: Request, res: Response) => {
      const parsed = extractPersonaSchema.safeParse(req.body);
      if (!parsed.success) {
        res
          .status(400)
          .json({ error: "Invalid request", details: parsed.error.flatten() });
        return;
      }

      const { messages, extractionPrompt } = parsed.data;

      const safe = await moderateUserContent(messages);
      if (!safe) {
        res
          .status(400)
          .json({ error: "Conversation violates our content policy." });
        return;
      }

      try {
        const conversationText = messages
          .filter((m) => m.role !== "system")
          .map((m) => `${m.role}: ${m.content}`)
          .join("\n");

        const response = await openai.chat.completions.create({
          model: "gpt-4o",
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
          max_completion_tokens: 2048,
        });

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
    async (req: Request, res: Response) => {
      const parsed = z
        .object({ messages: aiMessagesSchema })
        .safeParse(req.body);
      if (!parsed.success) {
        res
          .status(400)
          .json({ error: "Invalid request", details: parsed.error.flatten() });
        return;
      }

      const { messages } = parsed.data;

      const safe = await moderateUserContent(messages);
      if (!safe) {
        res.status(400).json({ error: "Message violates our content policy." });
        return;
      }

      try {
        const response = await openai.chat.completions.create({
          model: "gpt-4o",
          messages,
          max_completion_tokens: 1024,
        });

        const content = response.choices[0]?.message?.content || "";
        res.json({ content });
      } catch (error) {
        console.error("Reflection error:", error);
        res.status(500).json({ error: "Failed to get AI response" });
      }
    },
  );

  // Lets users flag AI output as objectionable. Apple Guideline 1.2 expects
  // a user-reachable report path on any UGC-adjacent surface. We reuse the
  // websiteFeedback table with feedbackType="content_report" so there's one
  // inbox to triage; no extra schema.
  const reportRateLimit = rateLimiter(5, 60 * 1000, deviceOrIpKey);
  app.post(
    "/api/report-content",
    reportRateLimit,
    async (req: Request, res: Response) => {
      const schema = z.object({
        deviceId: z.string().min(1).max(256),
        reason: z.string().max(500).optional(),
        messageContent: z.string().max(4000),
        conversation: z.string().max(16000).optional(),
      });

      const parsed = schema.safeParse(req.body);
      if (!parsed.success) {
        res
          .status(400)
          .json({ error: "Invalid request", details: parsed.error.flatten() });
        return;
      }

      const { deviceId, reason, messageContent, conversation } = parsed.data;
      const summary = [
        `Reason: ${reason || "(none given)"}`,
        `Reported message: ${messageContent.slice(0, 1000)}`,
        conversation ? `Conversation: ${conversation.slice(0, 3000)}` : null,
      ]
        .filter(Boolean)
        .join("\n\n");

      try {
        if (db) {
          await db.insert(websiteFeedback).values({
            name: "content-report",
            email: `device-${deviceId}@reports.internal`,
            feedbackType: "content_report",
            message: summary,
          });
        } else {
          console.log(
            `[content-report] device=${deviceId} reason=${reason || "(none)"} msg=${messageContent.slice(0, 200)}`,
          );
        }
        res.json({ success: true });
      } catch (error) {
        console.error("Report content error:", error);
        res.status(500).json({ error: "Failed to submit report" });
      }
    },
  );

  app.post("/api/feedback", async (req: Request, res: Response) => {
    try {
      const { name, email, type, message } = req.body;

      if (!name || !email || !type || !message) {
        res.status(400).json({ error: "All fields are required" });
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
  });

  app.get("/api/feedback", async (req: Request, res: Response) => {
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
  });

  app.get(
    "/api/subscription/status/:deviceId",
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

  // Restore subscription. We do NOT trust the DB alone — for each device record
  // we re-verify with Apple/Google so that a refund or revoke taking effect
  // before the webhook lands does not regrant premium.
  app.post("/api/subscription/restore", async (req: Request, res: Response) => {
    try {
      const { deviceId } = z
        .object({ deviceId: z.string().min(1).max(256) })
        .parse(req.body);

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

      // Pull the transaction id out of the stripeSubscriptionId field where
      // /api/iap/validate stored it (format: `iap_<transactionId>`).
      const storedTx = sub.stripeSubscriptionId || "";
      const transactionId = storedTx.startsWith("iap_")
        ? storedTx.slice(4)
        : "";
      const platform = sub.stripeCustomerId?.startsWith("iap_android")
        ? "android"
        : "ios";

      let isPremium = false;
      let currentPeriodEnd: Date | null = sub.currentPeriodEnd;

      if (
        platform === "ios" &&
        isAppStoreServerAPIConfigured() &&
        transactionId
      ) {
        const result = await validateAppleReceiptV2(
          transactionId,
          sub.plan === "yearly"
            ? "com.resolutioncompanion.annual"
            : "com.resolutioncompanion.monthly",
        );
        isPremium = result.valid;
        currentPeriodEnd = result.expiresDate ?? currentPeriodEnd;
      } else {
        // Fallback: trust the DB state (we still store webhook-derived status),
        // but only if the period hasn't lapsed locally.
        isPremium =
          sub.status === "active" &&
          (!sub.currentPeriodEnd ||
            new Date(sub.currentPeriodEnd) > new Date());
      }

      if (!isPremium) {
        // Update DB so the next status call reflects reality.
        await db
          .update(deviceSubscriptions)
          .set({ status: "inactive", updatedAt: new Date() })
          .where(eq(deviceSubscriptions.id, sub.id));

        res.json({
          success: false,
          message: "No active subscription found for this device",
        });
        return;
      }

      // Refresh DB with the newly-confirmed expiry.
      if (currentPeriodEnd && currentPeriodEnd !== sub.currentPeriodEnd) {
        await db
          .update(deviceSubscriptions)
          .set({ status: "active", currentPeriodEnd, updatedAt: new Date() })
          .where(eq(deviceSubscriptions.id, sub.id));
      }

      res.json({
        success: true,
        isPremium: true,
        plan: sub.plan,
        currentPeriodEnd: currentPeriodEnd?.toISOString() || null,
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        res
          .status(400)
          .json({ error: "Invalid request", details: error.flatten() });
        return;
      }
      console.error("Restore subscription error:", error);
      res.status(500).json({ error: "Failed to restore subscription" });
    }
  });

  // Delete every row tied to this device across every table that stores user
  // content. The client should only show "deleted" if this succeeds.
  app.delete(
    "/api/user-data/:deviceId",
    async (req: Request, res: Response) => {
      try {
        const deviceId = req.params.deviceId;

        if (!deviceId || deviceId.length > 256) {
          res.status(400).json({ error: "deviceId is required" });
          return;
        }

        if (!db) {
          res.json({ success: true, message: "No server data to delete" });
          return;
        }

        // All current server-side storage is device-keyed in deviceSubscriptions.
        // websiteFeedback is keyed by user-supplied email, not deviceId, and is a
        // separate flow (not automatically linked). If new device-keyed tables
        // are added, extend the transaction below.
        await db.transaction(async (tx) => {
          await tx
            .delete(deviceSubscriptions)
            .where(eq(deviceSubscriptions.deviceId, deviceId));
        });

        res.json({
          success: true,
          message: "All server-side data for this device has been deleted",
        });
      } catch (error) {
        console.error("User data deletion error:", error);
        res.status(500).json({ error: "Failed to delete user data" });
      }
    },
  );

  app.post("/api/iap/validate", async (req: Request, res: Response) => {
    try {
      const { deviceId, platform, productId, transactionId, receipt } =
        req.body;

      if (!deviceId || !platform || !productId || !receipt) {
        res
          .status(400)
          .json({ error: "Missing required fields", valid: false });
        return;
      }

      let isValid = false;
      let expirationDate: Date | null = null;

      if (platform === "ios") {
        const result = await validateAppleReceipt(
          receipt,
          productId,
          transactionId,
        );
        isValid = result.valid;
        expirationDate = result.expiresDate;
      } else if (platform === "android") {
        const result = await validateGoogleReceipt(receipt, productId);
        isValid = result.valid;
        expirationDate = result.expiresDate;
      }

      // Fall back to plan-based estimate only if the store didn't provide an expiry
      if (isValid && !expirationDate) {
        const isYearly =
          productId.toLowerCase().includes("yearly") ||
          productId.toLowerCase().includes("year") ||
          productId.toLowerCase().includes("annual");
        expirationDate = isYearly
          ? new Date(Date.now() + 365 * 24 * 60 * 60 * 1000)
          : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
      }

      if (isValid && db) {
        const plan =
          productId.toLowerCase().includes("yearly") ||
          productId.toLowerCase().includes("year") ||
          productId.toLowerCase().includes("annual")
            ? "yearly"
            : "monthly";

        const subscriptionData = {
          stripeCustomerId: `iap_${platform}_${transactionId}`,
          stripeSubscriptionId: `iap_${transactionId}`,
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
        plan:
          productId.toLowerCase().includes("yearly") ||
          productId.toLowerCase().includes("year") ||
          productId.toLowerCase().includes("annual")
            ? "yearly"
            : "monthly",
        expirationDate: expirationDate?.toISOString() || null,
      });
    } catch (error) {
      console.error("IAP validation error:", error);
      res.status(500).json({ error: "Validation failed", valid: false });
    }
  });

  // --- Apple App Store Server Notifications V2 ---
  // Configure this URL in App Store Connect > App > App Store Server Notifications
  // Apple sends JWS-signed notifications for subscription lifecycle events.
  app.post("/api/webhooks/apple", async (req: Request, res: Response) => {
    try {
      const { signedPayload } = req.body;
      if (!signedPayload) {
        res.status(400).json({ error: "Missing signedPayload" });
        return;
      }

      // Verify the JWS signature chain against Apple Root CA G3
      let payload: any;
      try {
        payload = verifyAppleJWS(signedPayload);
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
      const txInfo = verifyAppleJWS(payload.data.signedTransactionInfo);
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

      // Look up the subscription by the IAP transaction ID stored in stripeSubscriptionId
      const lookupId = `iap_${originalTransactionId}`;
      const results = await db
        .select()
        .from(deviceSubscriptions)
        .where(eq(deviceSubscriptions.stripeSubscriptionId, lookupId));

      if (results.length === 0) {
        // Also try with the prefix format used during validation
        const altResults = await db
          .select()
          .from(deviceSubscriptions)
          .where(
            sql`${deviceSubscriptions.stripeSubscriptionId} LIKE ${"iap_%" + originalTransactionId}`,
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
  });

  // --- Google Real-time Developer Notifications ---
  // Configure via Google Cloud Pub/Sub push subscription pointing to this endpoint.
  // Set up in Google Play Console > Monetization > Monetization setup > Real-time developer notifications.
  app.post("/api/webhooks/google", async (req: Request, res: Response) => {
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

      // Look up subscription by purchase token stored in stripeCustomerId
      const results = await db
        .select()
        .from(deviceSubscriptions)
        .where(
          sql`${deviceSubscriptions.stripeCustomerId} LIKE ${"iap_android_%"}`,
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

          case 3: // CANCELED
          case 12: // REVOKED
          case 13: // EXPIRED
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
  });

  const httpServer = createServer(app);
  return httpServer;
}
