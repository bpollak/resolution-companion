/** @jest-environment node */
import type { Request, Response } from "express";
import { createFakeDb, type FakeQuery } from "./fixtures/fake-db";

let mockPruneFails = false;
const mockFake = createFakeDb((query: FakeQuery) => {
  if (query.op === "delete" && mockPruneFails) throw new Error("db down");
  return query.op === "insert" ? [{ count: 1 }] : [];
});
jest.mock("../db", () => ({ db: mockFake.db }));

const DAY_MS = 24 * 60 * 60 * 1000;
let clock = Date.parse("2026-12-31T20:00:00.000Z");

type Limiter = ReturnType<typeof import("../rate-limit").rateLimiter>;

function load(): Limiter {
  let limiter!: Limiter;
  jest.isolateModules(() => {
    limiter = jest
      .requireActual<typeof import("../rate-limit")>("../rate-limit")
      .rateLimiter("ai", 30, 60_000);
  });
  return limiter;
}

async function hit(limiter: Limiter) {
  const res = {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
  };
  const next = jest.fn();
  await limiter(
    { ip: "192.0.2.1", socket: {} } as unknown as Request,
    res as unknown as Response,
    next,
  );
  // The prune is deliberately not awaited by the request.
  await new Promise((resolve) => setImmediate(resolve));
  return { res, next };
}

beforeEach(() => {
  mockFake.reset();
  mockPruneFails = false;
  jest.spyOn(Date, "now").mockImplementation(() => clock);
  jest.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => jest.restoreAllMocks());

describe("rate limit window pruning", () => {
  it("deletes windows older than one day, at most once a minute", async () => {
    const limiter = load();

    expect((await hit(limiter)).next).toHaveBeenCalledTimes(1);
    const prunes = () => mockFake.find("delete", "rate_limit_windows");
    expect(prunes()).toHaveLength(1);
    expect(prunes()[0].where!.sql).toBe(
      '"rate_limit_windows"."updated_at" < $1',
    );
    expect(prunes()[0].where!.params).toEqual([
      new Date(clock - DAY_MS).toISOString(),
    ]);

    clock += 59_000;
    await hit(limiter);
    expect(prunes()).toHaveLength(1);

    clock += 2_000;
    await hit(limiter);
    expect(prunes()).toHaveLength(2);
  });

  it("never fails a request because the prune failed", async () => {
    mockPruneFails = true;
    const { res, next } = await hit(load());
    expect(next).toHaveBeenCalledTimes(1);
    expect(res.status).not.toHaveBeenCalled();
    expect(console.error).toHaveBeenCalledWith(
      "Rate limit prune error:",
      expect.any(Error),
    );
  });
});
