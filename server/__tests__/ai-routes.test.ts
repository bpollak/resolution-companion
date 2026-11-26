/** @jest-environment node */
import express from "express";
import * as http from "node:http";
import type { AddressInfo } from "node:net";
import { personaPlanResponseFormat } from "../persona-extraction";
import { aiMigrationCases, personaPlan } from "./fixtures/ai-migration";

const mockCreate = jest.fn();
jest.mock("openai", () => ({
  __esModule: true,
  default: jest.fn(() => ({ chat: { completions: { create: mockCreate } } })),
}));
// The real auth, validation, and development rate/quota middleware still run;
// no test connects to a database or purchase provider.
jest.mock("../db", () => ({ db: null }));

const savedEnv = { ...process.env };
let server: http.Server;
let port: number;
let requestNumber = 0;

beforeAll(async () => {
  process.env.AI_INTEGRATIONS_OPENAI_API_KEY = "synthetic-test-key";
  process.env.API_SECRET = "synthetic-app-key";
  delete process.env.AI_MODEL;
  const { registerRoutes } =
    jest.requireActual<typeof import("../routes")>("../routes");
  const app = express();
  app.set("trust proxy", 1);
  app.use(express.json());
  server = await registerRoutes(app);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  port = (server.address() as AddressInfo).port;
});

beforeEach(() => {
  mockCreate.mockReset();
  jest.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => jest.restoreAllMocks());

afterAll(async () => {
  process.env = savedEnv;
  if (!server) return;
  server.closeAllConnections();
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

function post(path: string, body: unknown, authenticated = true) {
  return new Promise<{ status: number; text: string }>((resolve, reject) => {
    const request = http.request(
      {
        host: "127.0.0.1",
        port,
        method: "POST",
        path,
        headers: {
          "Content-Type": "application/json",
          "X-Forwarded-For": `192.0.2.${++requestNumber}`,
          ...(authenticated ? { "X-API-Key": "synthetic-app-key" } : {}),
        },
      },
      (response) => {
        let text = "";
        response.setEncoding("utf8");
        response.on("data", (chunk) => (text += chunk));
        response.on("end", () =>
          resolve({ status: response.statusCode!, text }),
        );
      },
    );
    request.on("error", reject);
    request.end(JSON.stringify(body));
  });
}

function completion(content: string | null, finishReason: string | null) {
  return {
    choices: [{ message: { content }, finish_reason: finishReason }],
    usage: { prompt_tokens: 20, completion_tokens: 10 },
  };
}

async function* chunks(content: string | null, finishReason: string | null) {
  yield { choices: [{ delta: { content }, finish_reason: null }] };
  if (finishReason !== null) {
    yield { choices: [{ delta: {}, finish_reason: finishReason }] };
  }
  // OpenAI's final usage chunk has no choices. It must not erase the finish
  // reason, or every otherwise-complete streamed answer becomes an error.
  yield { choices: [], usage: { prompt_tokens: 20, completion_tokens: 10 } };
}

describe("AI model migration through the real server routes", () => {
  it.each(aiMigrationCases)("preserves $name", async (scenario) => {
    mockCreate.mockResolvedValueOnce(
      scenario.stream
        ? chunks(scenario.content, "stop")
        : completion(scenario.content, "stop"),
    );
    const response = await post(scenario.path, scenario.body);
    expect(response.status).toBe(200);
    expect(mockCreate).toHaveBeenCalledTimes(1);
    const [params, options] = mockCreate.mock.calls[0];
    expect(params).toMatchObject({
      model: "gpt-6.1-terra",
      reasoning_effort: "low",
    });
    expect(options.signal.aborted).toBe(false);
    if (scenario.stream) {
      expect(params).toMatchObject({
        stream: true,
        stream_options: { include_usage: true },
      });
      expect(response.text).toBe(
        `data: ${JSON.stringify({ content: scenario.content })}\n\ndata: [DONE]\n\n`,
      );
    } else {
      const expected =
        scenario.name === "reflection-legacy-json"
          ? { content: scenario.content }
          : JSON.parse(scenario.content);
      expect(JSON.parse(response.text)).toEqual(expected);
    }
    if (scenario.name === "persona-extraction") {
      expect(params.response_format).toEqual(personaPlanResponseFormat);
      expect(JSON.parse(response.text)).toEqual(personaPlan);
    } else if (!scenario.stream && scenario.name !== "reflection-legacy-json") {
      expect(params.response_format).toEqual({ type: "json_object" });
    }
    if (scenario.name === "tune-up-ambient") {
      expect(options.timeout).toBe(20_000);
    }
  });

  describe.each([
    { failure: "empty", text: "   ", finishReason: "stop" },
    { failure: "missing content", text: null, finishReason: "stop" },
    { failure: "truncated", text: "Partial answer", finishReason: "length" },
    {
      failure: "filtered",
      text: "Partial answer",
      finishReason: "content_filter",
    },
    { failure: "unterminated", text: "Partial answer", finishReason: null },
  ])("rejects $failure provider replies", ({ text, finishReason }) => {
    it.each(aiMigrationCases)("on $name", async (scenario) => {
      mockCreate.mockResolvedValueOnce(
        scenario.stream
          ? chunks(text, finishReason)
          : completion(text, finishReason),
      );
      const response = await post(scenario.path, scenario.body);
      if (scenario.stream) {
        expect(response.text).toContain('"error":');
        expect(response.text).not.toContain("[DONE]");
      } else {
        expect(response.status).toBeGreaterThanOrEqual(500);
        expect(JSON.parse(response.text)).toHaveProperty("error");
      }
    });
  });

  it("rejects an invalid persona even when the provider reports stop", async () => {
    mockCreate.mockResolvedValueOnce(completion('{"benchmarks":[]}', "stop"));
    const response = await post(
      aiMigrationCases[1].path,
      aiMigrationCases[1].body,
    );
    expect(response.status).toBe(500);
    expect(JSON.parse(response.text)).toHaveProperty("error");
  });

  it("still requires authentication before contacting the provider", async () => {
    const response = await post("/api/chat", aiMigrationCases[0].body, false);
    expect(response.status).toBe(401);
    expect(mockCreate).not.toHaveBeenCalled();
  });
});
