/** @jest-environment node */
import { createFakeDb, type FakeQuery } from "./fixtures/fake-db";
import { startRouteServer } from "./fixtures/route-server";

const mockStore = { available: true, feedbackFails: false };
const mockFake = createFakeDb((query: FakeQuery) => {
  if (query.op === "insert" && query.table === "rate_limit_windows") {
    return [{ count: 1 }];
  }
  if (query.op === "insert" && query.table === "website_feedback") {
    if (mockStore.feedbackFails) {
      const values = query.values as { name: string; email: string };
      throw Object.assign(new Error("insert failed"), {
        code: "23502",
        detail: `Failing row contains (${values.name}, ${values.email}).`,
      });
    }
    return [{ id: 41 }];
  }
  if (query.op === "delete" && query.table === "device_subscriptions") {
    return [{ id: 1 }];
  }
  return [];
});
jest.mock("../db", () => ({
  get db() {
    return mockStore.available ? mockFake.db : null;
  },
}));

const DEVICE = "device-0000-aaaa-bbbb";
const NAME = "Synthetic Person";
const EMAIL = "synthetic.person@example.invalid";
const MESSAGE = "The reminder time picker is hard to reach.";
const savedEnv = { ...process.env };
let routes: Awaited<ReturnType<typeof startRouteServer>>;

beforeAll(async () => {
  process.env.API_SECRET = "synthetic-app-key";
  routes = await startRouteServer(
    jest.requireActual<typeof import("../routes")>("../routes").registerRoutes,
  );
});

afterAll(async () => {
  process.env = savedEnv;
  await routes?.close();
});

beforeEach(() => {
  mockFake.reset();
  mockStore.available = true;
  mockStore.feedbackFails = false;
  jest.spyOn(console, "error").mockImplementation(() => {});
  jest.spyOn(console, "log").mockImplementation(() => {});
});

afterEach(() => jest.restoreAllMocks());

const feedback = (overrides: Record<string, unknown> = {}) =>
  routes.send("POST", "/api/feedback", {
    name: NAME,
    email: EMAIL,
    type: "bug",
    message: MESSAGE,
    ...overrides,
  });

function logged(): string {
  return [console.log, console.error]
    .flatMap((spy) => (spy as jest.Mock).mock.calls)
    .map((call) => call.map(String).join(" "))
    .join("\n");
}

describe("device data deletion", () => {
  it("deletes the device's AI content reports along with its other rows", async () => {
    const response = await routes.send(
      "DELETE",
      `/api/user-data/${DEVICE}`,
      undefined,
      { "X-API-Key": "synthetic-app-key" },
    );
    expect(response.status).toBe(200);
    expect(response.json).toMatchObject({ success: true });
    const reports = mockFake.find("delete", "ai_content_reports");
    expect(reports).toHaveLength(1);
    expect(reports[0].where).toEqual({
      sql: '"ai_content_reports"."device_id" = $1',
      params: [DEVICE],
    });
    expect(mockFake.find("delete", "device_subscriptions")).toHaveLength(1);
    expect(mockFake.find("delete", "device_events")).toHaveLength(1);
  });

  it("reports a failure if the reports cannot be deleted", async () => {
    jest.spyOn(mockFake.db, "delete").mockImplementationOnce(() => {
      throw new Error("db down");
    });
    const response = await routes.send(
      "DELETE",
      `/api/user-data/${DEVICE}`,
      undefined,
      { "X-API-Key": "synthetic-app-key" },
    );
    expect(response.status).toBe(500);
  });
});

describe("website feedback validation", () => {
  it.each(["bug", "feature", "question", "other"])(
    "accepts the %s type",
    async (type) => {
      const response = await feedback({ type });
      expect(response.status).toBe(200);
      expect(response.json).toEqual({ success: true, id: 41 });
      expect(mockFake.find("insert", "website_feedback")[0].values).toEqual({
        name: NAME,
        email: EMAIL,
        feedbackType: type,
        message: MESSAGE,
      });
    },
  );

  it("accepts the longest allowed name and message", async () => {
    const response = await feedback({
      name: "n".repeat(120),
      message: "m".repeat(5000),
    });
    expect(response.status).toBe(200);
  });

  it.each([
    { field: "name over 120 characters", body: { name: "n".repeat(121) } },
    { field: "name that is not text", body: { name: { first: "x" } } },
    { field: "unknown type", body: { type: "praise" } },
    { field: "type that is not text", body: { type: ["bug"] } },
    {
      field: "message over 5000 characters",
      body: { message: "m".repeat(5001) },
    },
    { field: "message that is not text", body: { message: 12345 } },
  ])("rejects a $field", async ({ body }) => {
    const response = await feedback(body);
    expect(response.status).toBe(400);
    expect(response.json).toHaveProperty("error");
    expect(mockFake.find("insert", "website_feedback")).toHaveLength(0);
  });

  it("does not log the name, email, or message when it stores feedback", async () => {
    expect((await feedback()).status).toBe(200);
    expect(logged()).not.toContain(NAME);
    expect(logged()).not.toContain(EMAIL);
    expect(logged()).not.toContain(MESSAGE);
  });

  it("does not log the name, email, or message without a database", async () => {
    mockStore.available = false;
    const response = await feedback();
    expect(response.status).toBe(200);
    expect(response.json).toMatchObject({ success: true });
    expect(logged()).not.toContain(NAME);
    expect(logged()).not.toContain(EMAIL);
    expect(logged()).not.toContain(MESSAGE);
  });

  it("does not log the name or email when storing fails", async () => {
    // Postgres errors can quote the failing row, values included.
    mockStore.feedbackFails = true;
    const response = await feedback();
    expect(response.status).toBe(500);
    expect(console.error).toHaveBeenCalled();
    expect(logged()).not.toContain(NAME);
    expect(logged()).not.toContain(EMAIL);
    expect(logged()).not.toContain(MESSAGE);
  });
});
