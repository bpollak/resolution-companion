/**
 * The progress snapshot is derived data that depends on "today". An app left
 * in memory overnight must notice the local date changed. Runs under
 * TZ=America/Los_Angeles.
 */

import { msUntilNextLocalDay } from "@/lib/day-rollover";
import { buildProgressSnapshot } from "@/lib/progress";
import type { DailyLog, ElementalAction } from "@/lib/storage";

const DAILY = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
];

describe("msUntilNextLocalDay", () => {
  it("counts to the next local midnight, not the next UTC day", () => {
    // 9:30 PM Pacific is already tomorrow in UTC
    const wait = msUntilNextLocalDay(new Date(2026, 6, 6, 21, 30, 0));
    expect(wait).toBeGreaterThanOrEqual(2.5 * 3600_000);
    expect(wait).toBeLessThanOrEqual(2.5 * 3600_000 + 5_000);
  });

  it("lands just after midnight, never before it", () => {
    const now = new Date(2026, 6, 6, 23, 59, 59, 900);
    const fired = new Date(now.getTime() + msUntilNextLocalDay(now));
    expect(fired.getDate()).toBe(7);
  });

  it("handles the 23-hour spring-forward day", () => {
    const now = new Date(2026, 2, 8, 0, 30, 0); // Sun Mar 8, before 2 AM
    const fired = new Date(now.getTime() + msUntilNextLocalDay(now));
    expect(fired.getDate()).toBe(9);
    expect(fired.getHours()).toBe(0);
    expect(msUntilNextLocalDay(now)).toBeLessThan(23 * 3600_000);
  });

  it("handles the 25-hour fall-back day", () => {
    const now = new Date(2026, 10, 1, 0, 30, 0); // Sun Nov 1
    const fired = new Date(now.getTime() + msUntilNextLocalDay(now));
    expect(fired.getDate()).toBe(2);
    expect(fired.getHours()).toBe(0);
  });
});

describe("buildProgressSnapshot across midnight", () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  const action: ElementalAction = {
    id: "a1",
    benchmarkId: "b1",
    title: "Walk",
    frequency: DAILY,
    anchorLink: "",
    kickstartVersion: "",
    createdAt: "2026-07-01T09:00:00",
  };
  const logs: DailyLog[] = ["2026-07-04", "2026-07-05"].map((date) => ({
    id: date,
    actionId: "a1",
    logDate: date,
    status: true,
    createdAt: `${date}T10:00:00`,
  }));

  it("names the local day it was computed for", () => {
    jest.setSystemTime(new Date(2026, 6, 6, 23, 50)); // Mon Jul 6, late
    expect(buildProgressSnapshot([action], logs, []).dayKey).toBe("2026-07-06");
    expect(
      buildProgressSnapshot([action], logs, [], { dayKey: "2026-07-06" })
        .dayKey,
    ).toBe("2026-07-06");
  });

  it("a snapshot rebuilt after midnight sees yesterday as over", () => {
    jest.setSystemTime(new Date(2026, 6, 6, 23, 50));
    const before = buildProgressSnapshot([action], logs, []);
    // Jul 6 is still pending: nothing missed yet
    expect(before.lapse.missedDays).toBe(0);
    expect(before.streak.current).toBe(2);

    jest.setSystemTime(new Date(2026, 6, 7, 0, 1));
    const after = buildProgressSnapshot([action], logs, []);
    expect(after.dayKey).toBe("2026-07-07");
    expect(after.lapse.missedDays).toBe(1);
    expect(after.streak.current).toBe(0);
  });
});
