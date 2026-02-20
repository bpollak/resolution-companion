import type { Express, Request, Response } from "express";
import { createServer, type Server } from "node:http";
import OpenAI from "openai";
import { db } from "./db";
import { websiteFeedback, deviceSubscriptions } from "@shared/schema";
import { sql, eq } from "drizzle-orm";

const openai = new OpenAI({
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
});

async function validateAppleReceiptWithUrl(receipt: string, productId: string, verifyUrl: string): Promise<{ valid: boolean; status: number }> {
  const sharedSecret = process.env.APPLE_SHARED_SECRET;

  if (!sharedSecret) {
    console.error("APPLE_SHARED_SECRET is not configured — cannot validate receipt");
    return { valid: false, status: -1 };
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
          return { valid: true, status: 0 };
        }
      }
    }
    return { valid: false, status: 0 };
  }

  return { valid: false, status: data.status };
}

async function validateAppleReceipt(receipt: string, productId: string): Promise<boolean> {
  try {
    // NOTE: These endpoints are deprecated by Apple. Future migration to App Store Server API v2
    // (https://developer.apple.com/documentation/appstoreserverapi) is recommended.
    // The verifyReceipt endpoints still function but Apple encourages migration to the new API.
    const productionUrl = "https://buy.itunes.apple.com/verifyReceipt";
    const sandboxUrl = "https://sandbox.itunes.apple.com/verifyReceipt";

    const prodResult = await validateAppleReceiptWithUrl(receipt, productId, productionUrl);

    if (prodResult.valid) {
      console.log("Apple receipt validated via production endpoint");
      return true;
    }

    if (prodResult.status === -1) {
      return false;
    }

    if (prodResult.status === 21007) {
      console.log("Sandbox receipt detected, retrying with sandbox endpoint");
      const sandboxResult = await validateAppleReceiptWithUrl(receipt, productId, sandboxUrl);

      if (sandboxResult.valid) {
        console.log("Apple receipt validated via sandbox endpoint");
        return true;
      }

      console.log("Sandbox validation failed with status:", sandboxResult.status);
      return false;
    }

    if (prodResult.status === 21008) {
      console.log("Production receipt rejected by production endpoint");
      return false;
    }

    console.log("Apple receipt validation failed with status:", prodResult.status);
    return false;
  } catch (error) {
    console.error("Apple receipt validation error:", error);
    return false;
  }
}

async function validateGoogleReceipt(receipt: string, productId: string): Promise<boolean> {
  try {
    const serviceAccountKey = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
    if (!serviceAccountKey) {
      console.error("GOOGLE_SERVICE_ACCOUNT_KEY is not configured — cannot validate receipt");
      return false;
    }

    const credentials = JSON.parse(serviceAccountKey);
    const packageName = process.env.ANDROID_PACKAGE_NAME || "com.resolutioncompanion.app";
    
    const tokenResponse = await fetch(
      `https://oauth2.googleapis.com/token`,
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
          assertion: await createGoogleJWT(credentials),
        }),
      }
    );
    
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
      return true;
    }
    
    return data.paymentState === 1;
  } catch (error) {
    // Fail closed — do not grant access when validation cannot be confirmed
    console.error("Google receipt validation error:", error);
    return false;
  }
}

async function createGoogleJWT(credentials: { client_email: string; private_key: string }): Promise<string> {
  const header = { alg: "RS256", typ: "JWT" };
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    iss: credentials.client_email,
    scope: "https://www.googleapis.com/auth/androidpublisher",
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
  };
  
  const base64Header = Buffer.from(JSON.stringify(header)).toString("base64url");
  const base64Payload = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signatureInput = `${base64Header}.${base64Payload}`;
  
  const crypto = await import("crypto");
  const sign = crypto.createSign("RSA-SHA256");
  sign.update(signatureInput);
  const signature = sign.sign(credentials.private_key, "base64url");
  
  return `${signatureInput}.${signature}`;
}

export async function registerRoutes(app: Express): Promise<Server> {
  app.post("/api/chat", async (req: Request, res: Response) => {
    try {
      const { messages } = req.body;

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
      res.write(`data: ${JSON.stringify({ error: "Failed to get AI response" })}\n\n`);
      res.end();
    }
  });

  app.post("/api/extract-persona", async (req: Request, res: Response) => {
    try {
      const { messages, extractionPrompt } = req.body;

      const conversationText = messages
        .filter((m: { role: string }) => m.role !== "system")
        .map((m: { role: string; content: string }) => `${m.role}: ${m.content}`)
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
  });

  app.post("/api/reflection", async (req: Request, res: Response) => {
    try {
      const { messages } = req.body;

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
  });

  app.post("/api/feedback", async (req: Request, res: Response) => {
    try {
      const { name, email, type, message } = req.body;

      if (!name || !email || !type || !message) {
        res.status(400).json({ error: "All fields are required" });
        return;
      }

      if (!db) {
        console.log(`Feedback received (no DB): ${name} (${email}): ${type} - ${message}`);
        res.json({ success: true, id: Date.now().toString() });
        return;
      }

      const [entry] = await db.insert(websiteFeedback).values({
        name,
        email,
        feedbackType: type,
        message,
      }).returning();

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


  app.get("/api/subscription/status/:deviceId", async (req: Request, res: Response) => {
    try {
      const { deviceId } = req.params;
      
      if (!db) {
        res.json({ isPremium: false, plan: 'free', status: 'inactive' });
        return;
      }
      
      const results = await db.select().from(deviceSubscriptions).where(eq(deviceSubscriptions.deviceId, deviceId));
      
      if (results.length === 0) {
        res.json({ isPremium: false, plan: 'free', status: 'inactive' });
        return;
      }
      
      const sub = results[0];
      const isPremium = sub.status === 'active' && (
        !sub.currentPeriodEnd || new Date(sub.currentPeriodEnd) > new Date()
      );
      
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
  });


  // Restore subscription by looking up the active record in the database for this device.
  // Native IAP purchases are tracked server-side via /api/iap/validate; this endpoint
  // lets the client re-sync that state (e.g. after a reinstall).
  app.post("/api/subscription/restore", async (req: Request, res: Response) => {
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

      const results = await db.select().from(deviceSubscriptions).where(eq(deviceSubscriptions.deviceId, deviceId));

      if (results.length === 0) {
        res.json({ success: false, message: "No subscription record found for this device" });
        return;
      }

      const sub = results[0];
      const isPremium = sub.status === 'active' && (
        !sub.currentPeriodEnd || new Date(sub.currentPeriodEnd) > new Date()
      );

      if (!isPremium) {
        res.json({ success: false, message: "No active subscription found for this device" });
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
  });

  app.delete("/api/user-data/:deviceId", async (req: Request, res: Response) => {
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

      const deleted = await db.delete(deviceSubscriptions).where(eq(deviceSubscriptions.deviceId, deviceId)).returning();

      res.json({
        success: true,
        message: deleted.length > 0
          ? "All server-side data for this device has been deleted"
          : "No server data found for this device",
      });
    } catch (error) {
      console.error("User data deletion error:", error);
      res.status(500).json({ error: "Failed to delete user data" });
    }
  });

  app.post("/api/iap/validate", async (req: Request, res: Response) => {
    try {
      const { deviceId, platform, productId, transactionId, receipt, purchaseTime } = req.body;
      
      if (!deviceId || !platform || !productId || !receipt) {
        res.status(400).json({ error: "Missing required fields", valid: false });
        return;
      }

      let isValid = false;
      let expirationDate: Date | null = null;
      
      if (platform === "ios") {
        isValid = await validateAppleReceipt(receipt, productId);
        if (isValid) {
          expirationDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
        }
      } else if (platform === "android") {
        isValid = await validateGoogleReceipt(receipt, productId);
        if (isValid) {
          expirationDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
        }
      }

      if (isValid && db) {
        const plan = productId.toLowerCase().includes("yearly") || productId.toLowerCase().includes("year") || productId.toLowerCase().includes("annual")
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

        const existing = await db.select().from(deviceSubscriptions).where(eq(deviceSubscriptions.deviceId, deviceId));
        
        if (existing.length > 0) {
          await db.update(deviceSubscriptions)
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
        plan: (productId.toLowerCase().includes("yearly") || productId.toLowerCase().includes("year") || productId.toLowerCase().includes("annual")) ? "yearly" : "monthly",
        expirationDate: expirationDate?.toISOString() || null,
      });
    } catch (error) {
      console.error("IAP validation error:", error);
      res.status(500).json({ error: "Validation failed", valid: false });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}
