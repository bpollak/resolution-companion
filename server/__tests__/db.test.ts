/** @jest-environment node */

const mockPoolOn = jest.fn();
const mockPoolEnd = jest.fn(async () => {});
const mockPool = jest.fn((_config: unknown) => ({
  on: mockPoolOn,
  end: mockPoolEnd,
  query: jest.fn(),
}));
jest.mock("pg", () => ({ Pool: mockPool }));
jest.mock("drizzle-orm/node-postgres", () => ({ drizzle: () => ({}) }));

const savedEnv = { ...process.env };

function loadDb(): typeof import("../db") {
  let loaded!: typeof import("../db");
  jest.isolateModules(() => {
    loaded = jest.requireActual<typeof import("../db")>("../db");
  });
  return loaded;
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, "error").mockImplementation(() => {});
  jest.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  process.env = { ...savedEnv };
  jest.restoreAllMocks();
});

describe("database pool", () => {
  it("bounds connection waits and statement time", () => {
    process.env.DATABASE_URL = "postgres://synthetic.invalid/db";
    loadDb();
    expect(mockPool).toHaveBeenCalledTimes(1);
    expect(mockPool.mock.calls[0][0]).toMatchObject({
      connectionString: "postgres://synthetic.invalid/db",
      connectionTimeoutMillis: 5000,
      statement_timeout: 10_000,
    });
  });

  it("logs an idle client error instead of crashing the process", () => {
    process.env.DATABASE_URL = "postgres://synthetic.invalid/db";
    loadDb();
    const errorListeners = mockPoolOn.mock.calls.filter(
      ([event]) => event === "error",
    );
    expect(errorListeners).toHaveLength(1);
    const listener = errorListeners[0][1] as (error: Error) => void;
    expect(() => listener(new Error("connection terminated"))).not.toThrow();
    expect(console.error).toHaveBeenCalledWith(
      "Database pool error:",
      "connection terminated",
    );
  });

  it("closes the pool on request, and is a no-op without a database", async () => {
    process.env.DATABASE_URL = "postgres://synthetic.invalid/db";
    await loadDb().closePool();
    expect(mockPoolEnd).toHaveBeenCalledTimes(1);

    delete process.env.DATABASE_URL;
    mockPoolEnd.mockClear();
    const withoutDatabase = loadDb();
    expect(withoutDatabase.db).toBeNull();
    await expect(withoutDatabase.closePool()).resolves.toBeUndefined();
    expect(mockPoolEnd).not.toHaveBeenCalled();
  });
});
