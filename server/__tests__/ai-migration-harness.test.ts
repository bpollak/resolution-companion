/** @jest-environment node */
import express from "express";
import { execFile } from "node:child_process";
import type { AddressInfo } from "node:net";
import { aiMigrationCases } from "./fixtures/ai-migration";

// Exercise the comparison script through the real SDK and HTTP/SSE parsers.
// This is a synthetic provider, not evidence of actual model quality.
it.each([200, 401])(
  "keeps comparison evidence accurate with provider status %i",
  async (status) => {
    const requests: { model: string; reasoning_effort: string }[] = [];
    const provider = express();
    provider.use(express.json());
    provider.post("/v1/chat/completions", (req, res) => {
      const number = requests.length;
      const scenario = aiMigrationCases[number % aiMigrationCases.length];
      requests.push(req.body);
      if (status !== 200) {
        res.status(status).json({
          error: {
            message: "Incorrect key: synthetic-secret",
            code: "invalid_api_key",
          },
        });
        return;
      }
      const usage = { prompt_tokens: 100 + number, completion_tokens: 20 };
      const base = {
        id: `synthetic-${number}`,
        created: 0,
        model: req.body.model,
      };
      if (req.body.stream) {
        res.setHeader("Content-Type", "text/event-stream");
        for (const chunk of [
          {
            ...base,
            choices: [
              {
                index: 0,
                delta: { content: scenario.content },
                finish_reason: null,
              },
            ],
          },
          {
            ...base,
            choices: [{ index: 0, delta: {}, finish_reason: "stop" }],
          },
          { ...base, choices: [], usage },
        ])
          res.write(`data: ${JSON.stringify(chunk)}\n\n`);
        res.end("data: [DONE]\n\n");
      } else {
        res.json({
          ...base,
          choices: [
            { message: { content: scenario.content }, finish_reason: "stop" },
          ],
          usage,
        });
      }
    });
    const server = provider.listen(0, "127.0.0.1");
    await new Promise<void>((resolve) => server.on("listening", resolve));
    const port = (server.address() as AddressInfo).port;
    try {
      const { error, stdout, stderr } = await new Promise<{
        error: Error | null;
        stdout: string;
        stderr: string;
      }>((resolve) => {
        execFile(
          process.execPath,
          [require.resolve("tsx/cli"), "scripts/verify-ai-migration.ts"],
          {
            env: {
              ...process.env,
              AI_INTEGRATIONS_OPENAI_API_KEY: "synthetic-secret",
              AI_INTEGRATIONS_OPENAI_BASE_URL: `http://127.0.0.1:${port}/v1`,
            },
            timeout: 15_000,
          },
          (error, stdout, stderr) => resolve({ error, stdout, stderr }),
        );
      });
      expect(error === null).toBe(status === 200);
      expect(stdout + stderr).not.toContain("synthetic-secret");
      const { results } = JSON.parse(stdout);
      expect(requests).toHaveLength(14);
      expect(results).toHaveLength(14);
      results.forEach(
        (
          result: {
            valid: boolean;
            providerAttempts: Record<string, unknown>[];
          },
          index: number,
        ) => {
          const model = index < 7 ? "gpt-5-mini" : "gpt-6.1-terra";
          expect(requests[index]).toMatchObject({
            model,
            reasoning_effort: index < 7 ? "minimal" : "low",
          });
          expect(result.valid).toBe(status === 200);
          expect(result.providerAttempts).toHaveLength(1);
          expect(result.providerAttempts[0]).toMatchObject(
            status === 200
              ? {
                  requestedModel: model,
                  reportedModel: model,
                  finishReason: "stop",
                  usage: { prompt_tokens: 100 + index },
                }
              : { providerError: { status: 401, code: "invalid_api_key" } },
          );
        },
      );
    } finally {
      server.closeAllConnections();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  },
  20_000,
);
