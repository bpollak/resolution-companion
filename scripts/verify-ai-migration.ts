// Synthetic requests exercise the real route prompts, budgets, and parsers.
// Run with the server's AI_INTEGRATIONS_OPENAI_* credentials in the environment:
// npx tsx scripts/verify-ai-migration.ts > build/ai-migration-live.json
import express from "express";
import OpenAI from "openai";
import type {
  ChatCompletionCreateParamsNonStreaming,
  ChatCompletionCreateParamsStreaming,
} from "openai/resources/chat/completions";
import type { AddressInfo } from "node:net";
import { createServer, type Server } from "node:http";
import { aiMigrationCases } from "../server/__tests__/fixtures/ai-migration";

async function listen(server: Server): Promise<string> {
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}

async function close(server: Server) {
  server.closeAllConnections();
  await new Promise<void>((resolve) => server.close(() => resolve()));
}

async function main() {
  const apiKey = process.env.AI_INTEGRATIONS_OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error(
      "AI_INTEGRATIONS_OPENAI_API_KEY is required for live verification",
    );
  }
  const provider = new OpenAI({
    apiKey,
    baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
    timeout: 30_000,
    maxRetries: 0,
  });

  let model = "gpt-5-mini";
  let effort: "minimal" | "low" = "minimal";
  let attempts: Record<string, unknown>[] = [];
  const proxy = express();
  proxy.use(express.json());
  proxy.post("/v1/chat/completions", async (req, res) => {
    const started = performance.now();
    const metrics: Record<string, unknown> = {
      requestedModel: model,
      effort,
      completionBudget: req.body.max_completion_tokens,
    };
    attempts.push(metrics);
    const controller = new AbortController();
    res.on("close", () => {
      if (!res.writableFinished) controller.abort();
    });
    try {
      const params = { ...req.body, model, reasoning_effort: effort };
      if (params.stream === true) {
        const stream = await provider.chat.completions.create(
          { ...params, stream: true } as ChatCompletionCreateParamsStreaming,
          { signal: controller.signal },
        );
        res.setHeader("Content-Type", "text/event-stream");
        let firstContentMs: number | null = null;
        for await (const chunk of stream) {
          if (chunk.choices[0]?.delta?.content && firstContentMs === null) {
            firstContentMs = Math.round(performance.now() - started);
          }
          if (chunk.choices[0]?.finish_reason) {
            metrics.finishReason = chunk.choices[0].finish_reason;
          }
          if (chunk.usage) metrics.usage = chunk.usage;
          metrics.reportedModel = chunk.model;
          res.write(`data: ${JSON.stringify(chunk)}\n\n`);
        }
        metrics.firstContentMs = firstContentMs;
        res.end("data: [DONE]\n\n");
      } else {
        const response = await provider.chat.completions.create(
          {
            ...params,
            stream: false,
          } as ChatCompletionCreateParamsNonStreaming,
          { signal: controller.signal },
        );
        metrics.finishReason = response.choices[0]?.finish_reason;
        metrics.usage = response.usage;
        metrics.reportedModel = response.model;
        res.json(response);
      }
    } catch (error) {
      // Provider authentication errors may quote part of a key. Persist only
      // status and code; route errors see this synthetic local response.
      metrics.providerError =
        error instanceof OpenAI.APIError
          ? { status: error.status, code: error.code }
          : { type: error instanceof Error ? error.name : "UnknownError" };
      if (res.destroyed) return;
      if (res.headersSent) res.end();
      else
        res
          .status(error instanceof OpenAI.APIError ? error.status || 502 : 502)
          .json({ error: { message: "Provider verification failed" } });
    } finally {
      metrics.providerElapsedMs = Math.round(performance.now() - started);
    }
  });
  const providerServer = createServer(proxy);
  const proxyUrl = await listen(providerServer);
  let appServer: Server | undefined;
  try {
    // Keep this process independent of production data, quotas, and credentials.
    process.env.NODE_ENV = "development";
    delete process.env.DATABASE_URL;
    process.env.API_SECRET = "synthetic-verification-key";
    process.env.AI_MODEL = "gpt-6.1-terra";
    process.env.AI_INTEGRATIONS_OPENAI_API_KEY = "synthetic-local-proxy-key";
    process.env.AI_INTEGRATIONS_OPENAI_BASE_URL = `${proxyUrl}/v1`;
    const { registerRoutes } = await import("../server/routes");
    const app = express();
    app.use(express.json());
    appServer = await registerRoutes(app);
    const appUrl = await listen(appServer);
    const results: Record<string, unknown>[] = [];
    for (const candidate of ["gpt-5-mini", "gpt-6.1-terra"]) {
      model = candidate;
      effort = candidate === "gpt-5-mini" ? "minimal" : "low";
      for (const scenario of aiMigrationCases) {
        attempts = [];
        const started = performance.now();
        const response = await fetch(`${appUrl}${scenario.path}`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-API-Key": "synthetic-verification-key",
          },
          body: JSON.stringify(scenario.body),
        });
        const text = await response.text();
        const valid =
          response.ok &&
          (scenario.stream
            ? text.includes("data: [DONE]") && !text.includes('"error":')
            : !JSON.parse(text).error);
        const result = {
          scenario: scenario.name,
          model,
          effort,
          status: response.status,
          valid,
          elapsedMs: Math.round(performance.now() - started),
          providerAttempts: attempts,
          syntheticResponse: text,
        };
        results.push(result);
        process.stderr.write(
          `${scenario.name} ${model}: ${valid ? "PASS" : "FAIL"}\n`,
        );
      }
    }
    process.stdout.write(
      `${JSON.stringify({ checkedAt: new Date().toISOString(), results }, null, 2)}\n`,
    );
    if (results.some((result) => !result.valid)) process.exitCode = 1;
  } finally {
    if (appServer) await close(appServer);
    await close(providerServer);
  }
}

main().catch((error: unknown) => {
  // Do not print SDK error objects or environment contents.
  process.stderr.write(
    `${error instanceof Error ? error.message : "Verification failed"}\n`,
  );
  process.exitCode = 1;
});
