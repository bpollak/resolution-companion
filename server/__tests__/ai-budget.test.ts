/** @jest-environment node */
import {
  AI_DAILY_REQUEST_CAP_DEFAULT,
  aiDailyRequestCap,
  createAiBudgetBreaker,
} from "../ai-budget";

const START = Date.parse("2026-12-31T20:00:00.000Z");

function setup(initialTotal: number, cap = 100) {
  const state = { total: initialTotal, now: START, cap, fails: false };
  const fetchTotal = jest.fn(async (_day: string) => {
    if (state.fails) throw new Error("db down");
    return state.total;
  });
  const breaker = createAiBudgetBreaker({
    fetchTotal,
    cap: () => state.cap,
    now: () => state.now,
  });
  return { state, fetchTotal, breaker };
}

beforeEach(() => {
  jest.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => jest.restoreAllMocks());

describe("daily AI request cap", () => {
  it("defaults to 20000 and ignores unusable overrides", () => {
    expect(AI_DAILY_REQUEST_CAP_DEFAULT).toBe(20000);
    expect(aiDailyRequestCap({})).toBe(20000);
    expect(aiDailyRequestCap({ AI_DAILY_REQUEST_CAP: "500" })).toBe(500);
    for (const bad of ["", "abc", "0", "-5", "12.5"]) {
      expect(aiDailyRequestCap({ AI_DAILY_REQUEST_CAP: bad })).toBe(20000);
    }
  });
});

describe("daily AI budget breaker", () => {
  it("stays closed below the cap and trips at it", async () => {
    const { state, breaker } = setup(99);
    expect((await breaker.check()).exhausted).toBe(false);
    state.total = 100;
    state.now += 30_000;
    const tripped = await breaker.check();
    expect(tripped.exhausted).toBe(true);
    // 20:00:30 UTC: the budget is a UTC day, so it frees up at midnight UTC.
    expect(tripped.retryAfterSeconds).toBe(4 * 60 * 60 - 30);
  });

  it("reads the total once per 30 seconds, however many requests arrive", async () => {
    const { state, fetchTotal, breaker } = setup(0);
    await Promise.all([breaker.check(), breaker.check(), breaker.check()]);
    state.now += 29_999;
    await breaker.check();
    expect(fetchTotal).toHaveBeenCalledTimes(1);
    expect(fetchTotal).toHaveBeenCalledWith("2026-12-31");
    state.now += 1;
    await breaker.check();
    expect(fetchTotal).toHaveBeenCalledTimes(2);
  });

  it("recovers when the UTC day rolls over", async () => {
    const { state, fetchTotal, breaker } = setup(100);
    expect((await breaker.check()).exhausted).toBe(true);
    state.now = Date.parse("2027-01-01T00:00:01.000Z");
    state.total = 0;
    expect((await breaker.check()).exhausted).toBe(false);
    expect(fetchTotal).toHaveBeenLastCalledWith("2027-01-01");
  });

  it("recovers when the cap is raised, without a new read", async () => {
    const { state, fetchTotal, breaker } = setup(100);
    expect((await breaker.check()).exhausted).toBe(true);
    state.cap = 500;
    expect((await breaker.check()).exhausted).toBe(false);
    expect(fetchTotal).toHaveBeenCalledTimes(1);
  });

  it("fails open, logs, and waits out the cache when the count errors", async () => {
    const { state, fetchTotal, breaker } = setup(0);
    state.fails = true;
    expect((await breaker.check()).exhausted).toBe(false);
    expect((await breaker.check()).exhausted).toBe(false);
    expect(fetchTotal).toHaveBeenCalledTimes(1);
    expect(console.error).toHaveBeenCalledWith(
      "AI budget check error (allowing requests):",
      expect.any(Error),
    );
    state.fails = false;
    state.total = 100;
    state.now += 30_000;
    expect((await breaker.check()).exhausted).toBe(true);
  });

  it("keeps the last known total for the day when a later read errors", async () => {
    const { state, breaker } = setup(100);
    expect((await breaker.check()).exhausted).toBe(true);
    state.fails = true;
    state.now += 30_000;
    expect((await breaker.check()).exhausted).toBe(true);
  });
});
