/** @jest-environment node */
import express from "express";
import * as http from "node:http";
import type { AddressInfo } from "node:net";
import { aiMigrationCases } from "./fixtures/ai-migration";
import { createFakeDb, type FakeQuery } from "./fixtures/fake-db";

const mockCreate = jest.fn();
jest.mock("openai", () => ({
  __esModule: true,
  default: jest.fn(() => ({ chat: { completions: { create: mockCreate } } })),
}));

// The real auth, validation, rate limit, budget, and quota code all run
// against a recording database; nothing connects to Postgres or a provider.
const mockState = {
  dailyTotal: 0,
  dailyTotalFails: false,
  usageCount: 0,
};
const mockFake = createFakeDb((query: FakeQuery) => {
  if (query.op === "select" && query.table === "ai_usage_daily") {
    if (mockState.dailyTotalFails) throw new Error("db down");
    // Postgres returns sum() as a string.
    return [{ total: String(mockState.dailyTotal) }];
  }
  if (query.op === "insert" && query.table === "rate_limit_windows") {
    return [{ count: 1 }];
  }
  if (query.op === "insert" && query.table === "device_ai_usage") {
    return [{ count: ++mockState.usageCount }];
  }
  if (query.op === "delete" && query.table === "device_subscriptions") {
    return [{ id: 1 }];
  }
  return [];
});
jest.mock("../db", () => ({ db: mockFake.db }));

const DEVICE = "device-0000-aaaa-bbbb";
const savedEnv = { ...process.env };
let server: http.Server;
let port: number;
let clock = Date.now();

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
  mockFake.reset();
  mockState.dailyTotal = 0;
  mockState.dailyTotalFails = false;
  mockState.usageCount = 0;
  process.env.AI_DAILY_REQUEST_CAP = "50";
  // Each test starts past the previous test's 30 second budget cache.
  clock += 31_000;
  jest.spyOn(Date, "now").mockImplementation(() => clock);
  jest.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => jest.restoreAllMocks());

afterAll(async () => {
  process.env = savedEnv;
  if (!server) return;
  server.closeAllConnections();
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

function send(method: string, path: string, body?: unknown) {
  return new Promise<{
    status: number;
    text: string;
    headers: http.IncomingHttpHeaders;
  }>((resolve, reject) => {
    const request = http.request(
      {
        host: "127.0.0.1",
        port,
        method,
        path,
        headers: {
          "Content-Type": "application/json",
          "X-API-Key": "synthetic-app-key",
          "X-Device-Id": DEVICE,
        },
      },
      (response) => {
        let text = "";
        response.setEncoding("utf8");
        response.on("data", (chunk) => (text += chunk));
        response.on("end", () =>
          resolve({
            status: response.statusCode!,
            text,
            headers: response.headers,
          }),
        );
      },
    );
    request.on("error", reject);
    request.end(body === undefined ? undefined : JSON.stringify(body));
  });
}

const post = (path: string, body: unknown) => send("POST", path, body);

function completion(content: string | null, finishReason: string | null) {
  return {
    choices: [{ message: { content }, finish_reason: finishReason }],
    usage: { prompt_tokens: 20, completion_tokens: 10 },
  };
}

async function* chunks(content: string) {
  yield { choices: [{ delta: { content }, finish_reason: null }] };
  yield { choices: [{ delta: {}, finish_reason: "stop" }] };
  yield { choices: [], usage: { prompt_tokens: 20, completion_tokens: 10 } };
}

function answer(scenario: (typeof aiMigrationCases)[number]) {
  return scenario.stream
    ? chunks(scenario.content)
    : completion(scenario.content, "stop");
}

const charges = () => mockFake.find("insert", "device_ai_usage");
const refunds = () => mockFake.find("update", "device_ai_usage");
const budgetReads = () => mockFake.find("select", "ai_usage_daily");
const chat = aiMigrationCases[0];
const extract = aiMigrationCases[1];

describe("daily AI budget breaker on the AI routes", () => {
  it.each(aiMigrationCases)(
    "answers $name with 503 and Retry-After once today's total reaches the cap",
    async (scenario) => {
      mockState.dailyTotal = 50;
      const response = await post(scenario.path, scenario.body);
      expect(response.status).toBe(503);
      expect(Number(response.headers["retry-after"])).toBeGreaterThan(0);
      expect(JSON.parse(response.text)).toEqual({
        error: "Coaching is at capacity right now. Please try again later.",
      });
      expect(mockCreate).not.toHaveBeenCalled();
      expect(charges()).toHaveLength(0);
    },
  );

  it("recovers once the cached total is stale and usage is back under the cap", async () => {
    mockState.dailyTotal = 50;
    expect((await post(chat.path, chat.body)).status).toBe(503);

    mockState.dailyTotal = 49;
    // Still inside the 30 second cache: the old total stands.
    clock += 29_000;
    expect((await post(chat.path, chat.body)).status).toBe(503);
    expect(budgetReads()).toHaveLength(1);

    clock += 1_000;
    mockCreate.mockResolvedValueOnce(answer(chat));
    expect((await post(chat.path, chat.body)).status).toBe(200);
    expect(budgetReads()).toHaveLength(2);
  });

  it("reads today's total once for a burst of requests", async () => {
    mockCreate.mockImplementation(async () => answer(chat));
    const responses = await Promise.all(
      Array.from({ length: 5 }, () => post(chat.path, chat.body)),
    );
    expect(responses.map((response) => response.status)).toEqual(
      Array(5).fill(200),
    );
    expect(budgetReads()).toHaveLength(1);
    expect(budgetReads()[0].where!.params).toEqual([
      new Date(clock).toISOString().slice(0, 10),
    ]);
  });

  it("keeps coaching up when the total cannot be read", async () => {
    mockState.dailyTotalFails = true;
    mockCreate.mockResolvedValueOnce(answer(chat));
    const response = await post(chat.path, chat.body);
    expect(response.status).toBe(200);
    expect(response.text).toContain("[DONE]");
    expect(console.error).toHaveBeenCalledWith(
      "AI budget check error (allowing requests):",
      expect.any(Error),
    );
  });
});

describe("AI quota charging", () => {
  it.each([
    { name: "chat", path: "/api/chat", body: { messages: "nope" } },
    {
      name: "extract (bad messages)",
      path: "/api/extract-persona",
      body: { messages: [], extractionPrompt: "x" },
    },
    {
      name: "extract (bad prompt)",
      path: "/api/extract-persona",
      body: { ...extract.body, extractionPrompt: 7 },
    },
    {
      name: "reflection",
      path: "/api/reflection",
      body: { messages: [{ role: "user" }] },
    },
    {
      name: "milestone proposal",
      path: "/api/milestone-proposal",
      body: { completedMilestone: "", personaName: "Curious Reader" },
    },
    {
      name: "ambient tune-up",
      path: "/api/plan-tune-up",
      body: { actions: [{ slot: "zero" }] },
    },
    {
      name: "legacy tune-up",
      path: "/api/plan-tune-up",
      body: { consent: true },
    },
  ])("does not charge quota for invalid $name input", async (scenario) => {
    const response = await post(scenario.path, scenario.body);
    expect(response.status).toBe(400);
    expect(charges()).toHaveLength(0);
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it.each(aiMigrationCases)(
    "charges $name exactly once when it is served",
    async (scenario) => {
      mockCreate.mockResolvedValueOnce(answer(scenario));
      const response = await post(scenario.path, scenario.body);
      expect(response.status).toBe(200);
      expect(charges()).toHaveLength(1);
      expect(charges()[0].values).toMatchObject({
        deviceId: DEVICE,
        count: 1,
      });
      expect(refunds()).toHaveLength(0);
    },
  );

  it.each(aiMigrationCases)(
    "refunds $name when the provider call fails before any text",
    async (scenario) => {
      mockCreate.mockRejectedValueOnce(new Error("provider unavailable"));
      const response = await post(scenario.path, scenario.body);
      if (scenario.stream) {
        expect(response.text).toContain('"error":');
      } else {
        expect(response.status).toBeGreaterThanOrEqual(500);
      }
      expect(charges()).toHaveLength(1);
      expect(refunds()).toHaveLength(1);
      const refund = refunds()[0];
      const charged = charges()[0].values as {
        month: string;
        endpoint: string;
      };
      expect(refund.where!.sql).toContain('"device_ai_usage"."device_id" = $1');
      expect(refund.where!.params).toEqual([
        DEVICE,
        charged.month,
        charged.endpoint,
      ]);
    },
  );

  it("refunds a stream that breaks before its first text", async () => {
    mockCreate.mockResolvedValueOnce(
      (async function* () {
        throw new Error("stream reset");
      })(),
    );
    const response = await post(chat.path, chat.body);
    expect(response.text).toContain('"error":');
    expect(refunds()).toHaveLength(1);
  });

  it("keeps the charge when a stream breaks after text was sent", async () => {
    mockCreate.mockResolvedValueOnce(
      (async function* () {
        yield {
          choices: [{ delta: { content: "Start small" }, finish_reason: null }],
        };
        throw new Error("stream reset");
      })(),
    );
    const response = await post(chat.path, chat.body);
    expect(response.text).toContain("Start small");
    expect(response.text).toContain('"error":');
    expect(refunds()).toHaveLength(0);
  });

  it("keeps the charge when the provider answered but the answer was unusable", async () => {
    mockCreate.mockResolvedValueOnce(completion("   ", "stop"));
    const response = await post(extract.path, extract.body);
    expect(response.status).toBe(500);
    expect(charges()).toHaveLength(1);
    expect(refunds()).toHaveLength(0);
  });

  it("never fails the request because the refund failed", async () => {
    mockCreate.mockRejectedValueOnce(new Error("provider unavailable"));
    const handler = jest
      .spyOn(mockFake.db, "update")
      .mockImplementationOnce(() => {
        throw new Error("db down");
      });
    const response = await post(extract.path, extract.body);
    expect(handler).toHaveBeenCalledTimes(1);
    expect(response.status).toBe(500);
    expect(JSON.parse(response.text)).toEqual({
      error: "Failed to extract persona",
    });
  });

  it("still answers 429 past the monthly limit, without calling the provider", async () => {
    mockState.usageCount = 20;
    const response = await post(extract.path, extract.body);
    expect(response.status).toBe(429);
    expect(mockCreate).not.toHaveBeenCalled();
    expect(refunds()).toHaveLength(0);
  });
});

describe("step proposals have their own monthly counter", () => {
  const proposal = { ...extract.body, purpose: "next-step" };
  const kinds = () =>
    charges().map((query) => (query.values as { endpoint: string }).endpoint);

  it("charges a step proposal to step-proposal, not extract", async () => {
    mockCreate.mockResolvedValueOnce(answer(extract));
    expect((await post(extract.path, proposal)).status).toBe(200);
    expect(kinds()).toEqual(["step-proposal"]);
  });

  it("charges a request with no purpose, as older builds send, to extract", async () => {
    mockCreate.mockResolvedValueOnce(answer(extract));
    expect((await post(extract.path, extract.body)).status).toBe(200);
    expect(kinds()).toEqual(["extract"]);
  });

  it("treats an unknown purpose as plan extraction", async () => {
    mockCreate.mockResolvedValueOnce(answer(extract));
    await post(extract.path, { ...extract.body, purpose: "anything" });
    expect(kinds()).toEqual(["extract"]);
  });

  it("answers 429 past 20 proposals in a month without calling the provider", async () => {
    mockState.usageCount = 20;
    const response = await post(extract.path, proposal);
    expect(response.status).toBe(429);
    expect(kinds()).toEqual(["step-proposal"]);
    expect(mockCreate).not.toHaveBeenCalled();
  });
});

describe("device data deletion", () => {
  it("deletes the device's AI usage counters, as the privacy policy promises", async () => {
    const response = await send("DELETE", `/api/user-data/${DEVICE}`);
    expect(response.status).toBe(200);
    expect(JSON.parse(response.text)).toMatchObject({ success: true });
    expect(mockFake.find("delete", "device_subscriptions")).toHaveLength(1);
    expect(mockFake.find("delete", "device_events")).toHaveLength(1);
    expect(mockFake.find("delete", "ai_content_reports")).toHaveLength(1);
    const usage = mockFake.find("delete", "device_ai_usage");
    expect(usage).toHaveLength(1);
    expect(usage[0].where).toEqual({
      sql: '"device_ai_usage"."device_id" = $1',
      params: [DEVICE],
    });
  });
});
