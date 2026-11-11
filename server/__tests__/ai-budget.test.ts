import { createDailyBudgetGuard, dailyTokenBudget, utcDay } from "../ai-budget";

describe("dailyTokenBudget", () => {
  it("uses the default when unset or invalid", () => {
    expect(dailyTokenBudget(undefined)).toBe(30_000_000);
    expect(dailyTokenBudget("")).toBe(30_000_000);
    expect(dailyTokenBudget("abc")).toBe(30_000_000);
    expect(dailyTokenBudget("-5")).toBe(30_000_000);
    expect(dailyTokenBudget("0")).toBe(30_000_000);
  });

  it("accepts a positive override", () => {
    expect(dailyTokenBudget("5000000")).toBe(5_000_000);
  });
});

describe("createDailyBudgetGuard", () => {
  const T0 = Date.UTC(2026, 10, 10, 12, 0, 0);

  it("is not exhausted below the budget and exhausted at it", async () => {
    let tokens = 99;
    let clock = T0;
    const guard = createDailyBudgetGuard(async () => tokens, {
      budget: () => 100,
      now: () => clock,
    });
    expect(await guard.isExhausted()).toBe(false);
    tokens = 100;
    clock += 61_000;
    expect(await guard.isExhausted()).toBe(true);
  });

  it("caches the count for a minute", async () => {
    const reader = jest.fn(async () => 10);
    let clock = T0;
    const guard = createDailyBudgetGuard(reader, {
      budget: () => 100,
      now: () => clock,
    });
    await guard.isExhausted();
    clock += 30_000;
    await guard.isExhausted();
    expect(reader).toHaveBeenCalledTimes(1);
    clock += 31_000;
    await guard.isExhausted();
    expect(reader).toHaveBeenCalledTimes(2);
  });

  it("re-reads when the UTC day rolls over", async () => {
    const reader = jest.fn(async (day: string) =>
      day === "2026-11-10" ? 500 : 0,
    );
    let clock = Date.UTC(2026, 10, 10, 23, 59, 50);
    const guard = createDailyBudgetGuard(reader, {
      budget: () => 100,
      now: () => clock,
    });
    expect(await guard.isExhausted()).toBe(true);
    clock += 20_000;
    expect(await guard.isExhausted()).toBe(false);
    expect(reader).toHaveBeenLastCalledWith("2026-11-11");
  });

  it("stays open when the usage read fails", async () => {
    const spy = jest.spyOn(console, "error").mockImplementation(() => {});
    const guard = createDailyBudgetGuard(
      async () => {
        throw new Error("db down");
      },
      { budget: () => 100, now: () => T0 },
    );
    expect(await guard.isExhausted()).toBe(false);
    spy.mockRestore();
  });

  it("formats the UTC day", () => {
    expect(utcDay(new Date(Date.UTC(2026, 0, 2, 3)))).toBe("2026-01-02");
  });
});
