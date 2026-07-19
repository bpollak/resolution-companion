/**
 * Unit tests for the pure progress/score math in client/lib/progress.ts.
 *
 * All tests run with TZ=America/Los_Angeles (see the "test" script in
 * package.json) because the module's core guarantee is that date keys and
 * weekdays come from the LOCAL calendar, not UTC. Several tests pin system
 * time to an evening hour where the UTC date has already rolled over to the
 * next day — the exact condition that produced the original UTC-vs-local
 * date bugs.
 */

import {
  getLocalDateString,
  buildLogIndex,
  getTrackableDays,
  computeBenchmarkProgress,
  computeMomentumScore,
  computeStreak,
  computeMilestoneProgress,
  computeWeeklyRecap,
  computeLapse,
  MILESTONE_TARGET_DAYS,
  sortWeekdays,
  formatScheduleDays,
  formatTargetCountdown,
  buildProgressSnapshot,
} from "@/lib/progress";
import type { Benchmark, ElementalAction, DailyLog } from "@/lib/storage";

const DAILY = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

let seq = 0;
const uid = (prefix: string) => `${prefix}-${++seq}`;

function makeBenchmark(overrides: Partial<Benchmark> = {}): Benchmark {
  return {
    id: uid("benchmark"),
    personaId: "persona-1",
    title: "Test benchmark",
    targetDate: null,
    status: "active",
    createdAt: "2026-01-01T12:00:00",
    ...overrides,
  };
}

function makeAction(
  frequency: string[] = DAILY,
  createdAt = "2026-01-01T12:00:00",
  overrides: Partial<ElementalAction> = {},
): ElementalAction {
  return {
    id: uid("action"),
    benchmarkId: "benchmark-x",
    title: "Test action",
    frequency,
    anchorLink: "after breakfast",
    kickstartVersion: "2-minute version",
    createdAt,
    ...overrides,
  };
}

function makeLog(actionId: string, date: string, status = true): DailyLog {
  return {
    id: uid("log"),
    actionId,
    logDate: date,
    status,
    createdAt: `${date}T12:00:00`,
  };
}

/** Local YYYY-MM-DD for `n` days before the (possibly faked) current day. */
function daysAgo(n: number): string {
  const d = new Date();
  d.setHours(12, 0, 0, 0);
  d.setDate(d.getDate() - n);
  return getLocalDateString(d);
}

/** Logs for `action` on each local date string in `dates`. */
function logsFor(action: ElementalAction, dates: string[]): DailyLog[] {
  return dates.map((date) => makeLog(action.id, date));
}

beforeEach(() => {
  jest.useFakeTimers();
});

afterEach(() => {
  jest.useRealTimers();
});

// Reference weekdays used throughout (verified against the 2026 calendar):
// 2026-07-06 is a Monday, 2026-07-01 is a Wednesday.
// DST: spring forward Sunday 2026-03-08, fall back Sunday 2026-11-01.

describe("getLocalDateString", () => {
  it("returns the local calendar date on an evening in PDT, not the UTC next day", () => {
    // 9:30 PM Pacific on July 6 — in UTC it is already July 7
    jest.setSystemTime(new Date(2026, 6, 6, 21, 30));
    const now = new Date();
    expect(now.toISOString().slice(0, 10)).toBe("2026-07-07"); // sanity: UTC rolled over
    expect(getLocalDateString(now)).toBe("2026-07-06");
  });

  it("zero-pads month and day", () => {
    expect(getLocalDateString(new Date(2026, 0, 5, 8, 0))).toBe("2026-01-05");
  });

  it("handles the first of a month", () => {
    expect(getLocalDateString(new Date(2026, 7, 1, 0, 0))).toBe("2026-08-01");
  });

  it("handles DST transition days", () => {
    expect(getLocalDateString(new Date(2026, 2, 8, 12, 0))).toBe("2026-03-08");
    expect(getLocalDateString(new Date(2026, 10, 1, 12, 0))).toBe("2026-11-01");
  });
});

describe("buildLogIndex", () => {
  it("indexes logs by actionId and date, stripping any time component", () => {
    const log = makeLog("a1", "2026-07-06T08:00:00");
    const index = buildLogIndex([log]);
    expect(index.get("a1|2026-07-06")).toBe(log);
  });

  it("keeps the first occurrence when duplicate logs exist for the same day", () => {
    const first = makeLog("a1", "2026-07-06", true);
    const second = makeLog("a1", "2026-07-06", false);
    const index = buildLogIndex([first, second]);
    expect(index.get("a1|2026-07-06")).toBe(first);
  });
});

describe("getTrackableDays", () => {
  it("returns the last 30 local days ending today when persona has no creation date", () => {
    jest.setSystemTime(new Date(2026, 6, 6, 21, 30)); // evening: UTC is already 07-07
    const days = getTrackableDays(null);
    expect(days).toHaveLength(30);
    expect(days[0]).toBe("2026-07-06");
    expect(days[29]).toBe("2026-06-07");
  });

  it("excludes days before the persona was created", () => {
    jest.setSystemTime(new Date(2026, 6, 6, 9, 0));
    const createdAt = new Date(2026, 6, 1); // local midnight July 1
    const days = getTrackableDays(createdAt);
    expect(days).toEqual([
      "2026-07-06",
      "2026-07-05",
      "2026-07-04",
      "2026-07-03",
      "2026-07-02",
      "2026-07-01",
    ]);
  });

  it("produces unique days across the spring-forward DST transition", () => {
    jest.setSystemTime(new Date(2026, 2, 10, 9, 0)); // Tue after 03-08 spring forward
    const days = getTrackableDays(null, 7);
    expect(days).toHaveLength(7);
    expect(new Set(days).size).toBe(7);
    expect(days).toContain("2026-03-08");
    expect(days).toContain("2026-03-07");
  });

  it("produces unique days across the fall-back DST transition", () => {
    jest.setSystemTime(new Date(2026, 10, 3, 9, 0)); // Tue after 11-01 fall back
    const days = getTrackableDays(null, 5);
    expect(days).toEqual([
      "2026-11-03",
      "2026-11-02",
      "2026-11-01",
      "2026-10-31",
      "2026-10-30",
    ]);
  });
});

describe("computeBenchmarkProgress", () => {
  it("credits a Monday-scheduled action on a Monday date string (local weekday, not UTC)", () => {
    // Regression: new Date("2026-07-06") is UTC midnight, which is Sunday
    // evening in Pacific. UTC-based weekday derivation would see Sunday and
    // silently drop this scheduled completion.
    const benchmark = makeBenchmark();
    const action = makeAction(["Monday"], "2026-01-01T12:00:00", {
      benchmarkId: benchmark.id,
    });
    const logs = [makeLog(action.id, "2026-07-06")]; // Monday
    const [result] = computeBenchmarkProgress(
      [benchmark],
      [action],
      buildLogIndex(logs),
      ["2026-07-06"],
    );
    expect(result.progress).toBe(100);
    expect(result.actions[0].progress).toBe(100);
  });

  it("does not count days the action is not scheduled", () => {
    const benchmark = makeBenchmark();
    const action = makeAction(["Monday"], "2026-01-01T12:00:00", {
      benchmarkId: benchmark.id,
    });
    const [result] = computeBenchmarkProgress(
      [benchmark],
      [action],
      buildLogIndex([]),
      ["2026-07-05"], // Sunday — nothing scheduled, nothing expected
    );
    expect(result.progress).toBe(0);
    expect(result.actions[0].progress).toBe(0);
  });

  it("computes rounded completion rates over the window", () => {
    const benchmark = makeBenchmark();
    const action = makeAction(DAILY, "2026-01-01T12:00:00", {
      benchmarkId: benchmark.id,
    });
    const logs = logsFor(action, ["2026-07-04", "2026-07-05"]);
    const [result] = computeBenchmarkProgress(
      [benchmark],
      [action],
      buildLogIndex(logs),
      ["2026-07-04", "2026-07-05", "2026-07-06"],
    );
    expect(result.progress).toBe(67); // 2 of 3, rounded
  });

  it("rolls per-action progress up into the benchmark total", () => {
    const benchmark = makeBenchmark();
    const done = makeAction(["Monday"], "2026-01-01T12:00:00", {
      benchmarkId: benchmark.id,
    });
    const missed = makeAction(["Monday"], "2026-01-01T12:00:00", {
      benchmarkId: benchmark.id,
    });
    const [result] = computeBenchmarkProgress(
      [benchmark],
      [done, missed],
      buildLogIndex([makeLog(done.id, "2026-07-06")]),
      ["2026-07-06"],
    );
    expect(result.progress).toBe(50);
    expect(result.actions.find((a) => a.action.id === done.id)?.progress).toBe(
      100,
    );
    expect(
      result.actions.find((a) => a.action.id === missed.id)?.progress,
    ).toBe(0);
  });

  it("ignores logs with status false", () => {
    const benchmark = makeBenchmark();
    const action = makeAction(["Monday"], "2026-01-01T12:00:00", {
      benchmarkId: benchmark.id,
    });
    const [result] = computeBenchmarkProgress(
      [benchmark],
      [action],
      buildLogIndex([makeLog(action.id, "2026-07-06", false)]),
      ["2026-07-06"],
    );
    expect(result.progress).toBe(0);
  });

  it("returns zero progress for a benchmark with no actions", () => {
    const benchmark = makeBenchmark();
    const [result] = computeBenchmarkProgress(
      [benchmark],
      [],
      buildLogIndex([]),
      ["2026-07-06"],
    );
    expect(result).toEqual({ benchmark, actions: [], progress: 0 });
  });
});

describe("computeMomentumScore", () => {
  it("gives a perfect first day 100%, not 1/(scheduled days all month)", () => {
    // Plan created and completed on July 7: the six earlier July days were
    // before the plan existed and must not drag the month-to-date score down
    jest.setSystemTime(new Date(2026, 6, 7, 20, 0));
    const action = makeAction(DAILY, "2026-07-07T08:30:00");
    const logs = [makeLog(action.id, "2026-07-07")];
    expect(computeMomentumScore([action], logs, 7)).toBe(100);
  });

  it("only counts scheduled days since each action was created", () => {
    jest.setSystemTime(new Date(2026, 6, 7, 20, 0)); // Tuesday July 7
    // Created Sunday July 5: trackable scheduled days in the window are
    // Jul 5, 6, 7 — two completed, one missed = 67
    const action = makeAction(DAILY, "2026-07-05T09:00:00");
    const logs = logsFor(action, ["2026-07-05", "2026-07-07"]);
    expect(computeMomentumScore([action], logs, 7)).toBe(67);
  });

  it("does not penalize an unlogged today in the morning", () => {
    // 9 AM Monday: today's action is pending, not missed. If today were
    // counted as expected the score would drop to 86 overnight.
    jest.setSystemTime(new Date(2026, 6, 6, 9, 0));
    const action = makeAction();
    const logs = logsFor(action, [
      daysAgo(1),
      daysAgo(2),
      daysAgo(3),
      daysAgo(4),
      daysAgo(5),
      daysAgo(6),
    ]);
    expect(computeMomentumScore([action], logs)).toBe(100);
  });

  it("counts today once it is logged", () => {
    jest.setSystemTime(new Date(2026, 6, 6, 9, 0));
    const action = makeAction();
    const pastLogs = logsFor(action, [daysAgo(4), daysAgo(5), daysAgo(6)]);
    // 3 of 6 past days, today pending
    expect(computeMomentumScore([action], pastLogs)).toBe(50);
    // Logging today adds it to both expected and completed: 4/7 = 57
    const withToday = [...pastLogs, makeLog(action.id, daysAgo(0))];
    expect(computeMomentumScore([action], withToday)).toBe(57);
  });

  it("only counts days matching the action's weekday schedule", () => {
    jest.setSystemTime(new Date(2026, 6, 6, 9, 0)); // Monday
    const mondayAction = makeAction(["Monday"]);
    // The only Monday in the 7-day window is today, which is pending
    expect(computeMomentumScore([mondayAction], [])).toBe(0);
    expect(
      computeMomentumScore(
        [mondayAction],
        [makeLog(mondayAction.id, "2026-07-06")],
      ),
    ).toBe(100);

    const wednesdayAction = makeAction(["Wednesday"]);
    expect(
      computeMomentumScore(
        [wednesdayAction],
        [makeLog(wednesdayAction.id, "2026-07-01")],
      ),
    ).toBe(100);
    expect(computeMomentumScore([wednesdayAction], [])).toBe(0);
  });

  it("handles month-to-date usage on the 1st of the month", () => {
    jest.setSystemTime(new Date(2026, 6, 1, 9, 0)); // July 1, 9 AM
    const action = makeAction();
    const daysInMonth = new Date().getDate();
    expect(daysInMonth).toBe(1);
    // Only day in range is today: pending → nothing expected → 0
    expect(computeMomentumScore([action], [], daysInMonth)).toBe(0);
    // Once logged, the month-to-date score is 100
    expect(
      computeMomentumScore(
        [action],
        [makeLog(action.id, "2026-07-01")],
        daysInMonth,
      ),
    ).toBe(100);
  });

  it("handles month-to-date usage on the 2nd of the month", () => {
    jest.setSystemTime(new Date(2026, 6, 2, 9, 0));
    const action = makeAction();
    const logs = [makeLog(action.id, "2026-07-01")];
    // Yesterday (July 1) completed, today pending → 1/1
    expect(computeMomentumScore([action], logs, new Date().getDate())).toBe(
      100,
    );
  });

  it("returns 0 with no actions", () => {
    jest.setSystemTime(new Date(2026, 6, 6, 9, 0));
    expect(computeMomentumScore([], [])).toBe(0);
  });
});

describe("computeStreak", () => {
  it("increments on consecutive completed scheduled days, with today pending", () => {
    jest.setSystemTime(new Date(2026, 6, 6, 9, 0)); // Monday morning
    const action = makeAction(DAILY, "2026-06-30T08:00:00");
    const logs = logsFor(action, [
      "2026-06-30",
      "2026-07-01",
      "2026-07-02",
      "2026-07-03",
      "2026-07-04",
      "2026-07-05",
    ]);
    const result = computeStreak([action], logs);
    expect(result.current).toBe(6); // today unlogged = pending, not broken
    expect(result.longest).toBe(6);
    expect(result.shieldUsed).toBe(false);
    expect(result.shieldedDays).toEqual([]);
  });

  it("increments live once today is logged", () => {
    jest.setSystemTime(new Date(2026, 6, 6, 21, 30)); // Monday evening (UTC is 07-07)
    const action = makeAction(DAILY, "2026-07-03T08:00:00");
    const logs = logsFor(action, [
      "2026-07-03",
      "2026-07-04",
      "2026-07-05",
      "2026-07-06",
    ]);
    expect(computeStreak([action], logs).current).toBe(4);
  });

  it("bridges rest days without incrementing or breaking", () => {
    jest.setSystemTime(new Date(2026, 6, 6, 9, 0)); // Monday
    const action = makeAction(
      ["Monday", "Wednesday", "Friday"],
      "2026-06-22T08:00:00",
    );
    const logs = logsFor(action, [
      "2026-06-22", // Mon
      "2026-06-24", // Wed
      "2026-06-26", // Fri
      "2026-06-29", // Mon
      "2026-07-01", // Wed
      "2026-07-03", // Fri
    ]);
    const result = computeStreak([action], logs);
    expect(result.current).toBe(6); // weekends/Tue/Thu bridge, today (Mon) pending
    expect(result.longest).toBe(6);
  });

  it("does not grant a shield before seven clean scheduled days", () => {
    jest.setSystemTime(new Date(2026, 6, 6, 9, 0));
    const action = makeAction(DAILY, "2026-06-29T08:00:00");
    const logs = logsFor(action, [
      "2026-06-29",
      "2026-06-30",
      "2026-07-01",
      // 07-02 misses before a shield is earned, so the run resets
      "2026-07-03",
      "2026-07-04",
      "2026-07-05",
    ]);
    const result = computeStreak([action], logs);
    expect(result.current).toBe(3);
    expect(result.longest).toBe(3);
    expect(result.shieldsAvailable).toBe(0);
    expect(result.shieldedDays).toEqual([]);
  });

  it("banks a shield after seven clean days and spends it on a miss", () => {
    jest.setSystemTime(new Date(2026, 6, 6, 9, 0));
    const action = makeAction(DAILY, "2026-06-22T08:00:00");
    const logs = logsFor(action, [
      "2026-06-22",
      "2026-06-23",
      "2026-06-24",
      "2026-06-25",
      "2026-06-26",
      "2026-06-27",
      "2026-06-28", // shield earned
      // 06-29 shielded
      "2026-06-30",
      "2026-07-01",
      "2026-07-02",
      "2026-07-03",
      "2026-07-04",
      "2026-07-05",
    ]);
    const result = computeStreak([action], logs);
    expect(result.current).toBe(13);
    expect(result.shieldEarnedDays).toEqual(["2026-06-28"]);
    expect(result.shieldedDays).toEqual(["2026-06-29"]);
    expect(result.shieldsAvailable).toBe(0);
    expect(result.shieldUsed).toBe(true);
  });

  it("earns a spent shield back only after another seven clean days", () => {
    jest.setSystemTime(new Date(2026, 6, 6, 9, 0));
    const action = makeAction(DAILY, "2026-06-15T08:00:00");
    const completed = [
      ...Array.from(
        { length: 7 },
        (_, i) => `2026-06-${String(15 + i).padStart(2, "0")}`,
      ),
      // 06-22 spends the first shield
      ...Array.from(
        { length: 7 },
        (_, i) => `2026-06-${String(23 + i).padStart(2, "0")}`,
      ),
      // 06-30 spends the re-earned shield
      "2026-07-01",
      "2026-07-02",
      "2026-07-03",
      "2026-07-04",
      "2026-07-05",
    ];
    const result = computeStreak([action], logsFor(action, completed));
    expect(result.shieldEarnedDays).toEqual(["2026-06-21", "2026-06-29"]);
    expect(result.shieldedDays).toEqual(["2026-06-22", "2026-06-30"]);
    expect(result.current).toBe(19);
    expect(result.shieldsAvailable).toBe(0);
  });

  it("lets premium bank and spend two earned shields", () => {
    jest.setSystemTime(new Date(2026, 6, 6, 9, 0));
    const action = makeAction(DAILY, "2026-06-15T08:00:00");
    const completed = [
      ...Array.from(
        { length: 14 },
        (_, i) => `2026-06-${String(15 + i).padStart(2, "0")}`,
      ),
      // 06-29 and 06-30 spend both banked shields
      "2026-07-01",
      "2026-07-02",
      "2026-07-03",
      "2026-07-04",
      "2026-07-05",
    ];
    const result = computeStreak(
      [action],
      logsFor(action, completed),
      undefined,
      2,
    );
    expect(result.shieldEarnedDays).toEqual(["2026-06-21", "2026-06-28"]);
    expect(result.shieldedDays).toEqual(["2026-06-29", "2026-06-30"]);
    expect(result.current).toBe(19);
    expect(result.shieldsAvailable).toBe(0);
    expect(result.maxShields).toBe(2);
  });

  it("resets on a miss after every earned premium shield is spent", () => {
    jest.setSystemTime(new Date(2026, 6, 6, 9, 0));
    const action = makeAction(DAILY, "2026-06-15T08:00:00");
    const completed = [
      ...Array.from(
        { length: 14 },
        (_, i) => `2026-06-${String(15 + i).padStart(2, "0")}`,
      ),
      // 06-29 + 06-30 shielded; 07-01 unshielded and resets
      "2026-07-02",
      "2026-07-03",
      "2026-07-04",
      "2026-07-05",
    ];
    const result = computeStreak(
      [action],
      logsFor(action, completed),
      undefined,
      2,
    );
    expect(result.current).toBe(4);
    expect(result.longest).toBe(14);
    expect(result.shieldedDays).toEqual(["2026-06-29", "2026-06-30"]);
    expect(result.shieldsAvailable).toBe(0);
    expect(result.shieldUsed).toBe(false);
  });

  it("reports no earned shield after only three clean days", () => {
    jest.setSystemTime(new Date(2026, 6, 6, 9, 0));
    const action = makeAction(DAILY, "2026-07-03T08:00:00");
    const result = computeStreak(
      [action],
      logsFor(action, ["2026-07-03", "2026-07-04", "2026-07-05"]),
      undefined,
      2,
    );
    expect(result.shieldsAvailable).toBe(0);
    expect(result.shieldEarnedDays).toEqual([]);
  });

  it("does not count days before the action existed as misses", () => {
    jest.setSystemTime(new Date(2026, 6, 6, 9, 0));
    const action = makeAction(DAILY, "2026-07-03T08:00:00");
    const logs = logsFor(action, ["2026-07-03", "2026-07-04", "2026-07-05"]);
    const result = computeStreak([action], logs);
    expect(result.current).toBe(3);
    expect(result.shieldUsed).toBe(false);
    expect(result.shieldedDays).toEqual([]);
  });

  it("counts days correctly across the spring-forward DST transition", () => {
    jest.setSystemTime(new Date(2026, 2, 10, 9, 0)); // Tue 03-10, after 03-08 spring forward
    const action = makeAction(DAILY, "2026-03-04T08:00:00");
    const logs = logsFor(action, [
      "2026-03-04",
      "2026-03-05",
      "2026-03-06",
      "2026-03-07",
      "2026-03-08",
      "2026-03-09",
    ]);
    expect(computeStreak([action], logs).current).toBe(6);
  });

  it("counts days correctly across the fall-back DST transition", () => {
    jest.setSystemTime(new Date(2026, 10, 3, 9, 0)); // Tue 11-03, after 11-01 fall back
    const action = makeAction(DAILY, "2026-10-28T08:00:00");
    const logs = logsFor(action, [
      "2026-10-28",
      "2026-10-29",
      "2026-10-30",
      "2026-10-31",
      "2026-11-01",
      "2026-11-02",
    ]);
    expect(computeStreak([action], logs).current).toBe(6);
  });

  it("returns zeros with no actions", () => {
    jest.setSystemTime(new Date(2026, 6, 6, 9, 0));
    expect(computeStreak([], [])).toEqual({
      current: 0,
      longest: 0,
      shieldUsed: false,
      shieldedDays: [],
      shieldEarnedDays: [],
      maxShields: 1,
      shieldsAvailable: 0,
    });
  });
});

describe("computeMilestoneProgress", () => {
  it("accumulates completed scheduled days since the benchmark was created", () => {
    jest.setSystemTime(new Date(2026, 6, 6, 9, 0));
    const benchmark = makeBenchmark({ createdAt: "2026-06-26T12:00:00" });
    const action = makeAction(DAILY, "2026-06-26T12:00:00", {
      benchmarkId: benchmark.id,
    });
    const logs = logsFor(action, [
      "2026-06-26",
      "2026-06-27",
      "2026-06-28",
      "2026-06-29",
      "2026-06-30",
    ]);
    const result = computeMilestoneProgress(
      benchmark,
      [action],
      buildLogIndex(logs),
    );
    expect(result.daysDone).toBe(5);
    expect(result.target).toBe(MILESTONE_TARGET_DAYS);
    expect(result.progress).toBe(24); // round(5/21*100)
    expect(result.completed).toBe(false);
    expect(result.actions[0].daysDone).toBe(5);
  });

  it("caps daysDone at the target and marks the milestone complete", () => {
    jest.setSystemTime(new Date(2026, 6, 6, 9, 0));
    const benchmark = makeBenchmark({ createdAt: "2026-06-06T12:00:00" });
    const action = makeAction(DAILY, "2026-06-06T12:00:00", {
      benchmarkId: benchmark.id,
    });
    const dates: string[] = [];
    for (let i = 30; i >= 6; i--) dates.push(daysAgo(i)); // 25 completed days
    const result = computeMilestoneProgress(
      benchmark,
      [action],
      buildLogIndex(logsFor(action, dates)),
    );
    expect(result.daysDone).toBe(MILESTONE_TARGET_DAYS);
    expect(result.progress).toBe(100);
    expect(result.completed).toBe(true);
  });

  it("pins a benchmark stored as completed to the full target regardless of logs", () => {
    jest.setSystemTime(new Date(2026, 6, 6, 9, 0));
    const benchmark = makeBenchmark({
      status: "completed",
      createdAt: "2026-06-26T12:00:00",
    });
    const action = makeAction(DAILY, "2026-06-26T12:00:00", {
      benchmarkId: benchmark.id,
    });
    const result = computeMilestoneProgress(
      benchmark,
      [action],
      buildLogIndex([]),
    );
    expect(result.daysDone).toBe(MILESTONE_TARGET_DAYS);
    expect(result.progress).toBe(100);
    expect(result.completed).toBe(true);
  });

  it("pins a completed benchmark even when it has no actions", () => {
    jest.setSystemTime(new Date(2026, 6, 6, 9, 0));
    const benchmark = makeBenchmark({ status: "completed" });
    const result = computeMilestoneProgress(benchmark, [], buildLogIndex([]));
    expect(result).toMatchObject({
      daysDone: MILESTONE_TARGET_DAYS,
      progress: 100,
      completed: true,
      actions: [],
    });
  });

  it("treats a legacy benchmark without a status field as active", () => {
    jest.setSystemTime(new Date(2026, 6, 6, 9, 0));
    const legacy = makeBenchmark({ createdAt: "2026-07-03T12:00:00" });
    delete (legacy as Partial<Benchmark>).status;
    const action = makeAction(DAILY, "2026-07-03T12:00:00", {
      benchmarkId: legacy.id,
    });
    const result = computeMilestoneProgress(
      legacy,
      [action],
      buildLogIndex(logsFor(action, ["2026-07-03", "2026-07-04"])),
    );
    expect(result.daysDone).toBe(2); // counted normally, not pinned to 21
    expect(result.completed).toBe(false);
  });

  it("never loses progress as days pass without new completions (fill-only)", () => {
    const benchmark = makeBenchmark({ createdAt: "2026-06-26T12:00:00" });
    const action = makeAction(DAILY, "2026-06-26T12:00:00", {
      benchmarkId: benchmark.id,
    });
    const logIndex = buildLogIndex(
      logsFor(action, [
        "2026-06-26",
        "2026-06-27",
        "2026-06-28",
        "2026-06-29",
        "2026-06-30",
      ]),
    );

    jest.setSystemTime(new Date(2026, 6, 6, 9, 0));
    const before = computeMilestoneProgress(benchmark, [action], logIndex);

    jest.setSystemTime(new Date(2026, 6, 11, 9, 0)); // five days later, no new logs
    const after = computeMilestoneProgress(benchmark, [action], logIndex);

    expect(before.daysDone).toBe(5);
    expect(after.daysDone).toBe(5);
    expect(after.progress).toBe(before.progress);
  });

  it("requires every scheduled action to be completed for a day to count", () => {
    jest.setSystemTime(new Date(2026, 6, 6, 9, 0));
    const benchmark = makeBenchmark({ createdAt: "2026-07-03T12:00:00" });
    const a = makeAction(DAILY, "2026-07-03T12:00:00", {
      benchmarkId: benchmark.id,
    });
    const b = makeAction(DAILY, "2026-07-03T12:00:00", {
      benchmarkId: benchmark.id,
    });
    const logs = [
      makeLog(a.id, "2026-07-03"),
      makeLog(b.id, "2026-07-03"),
      makeLog(a.id, "2026-07-04"), // b missed — day does not count
      makeLog(a.id, "2026-07-05"),
      makeLog(b.id, "2026-07-05"),
    ];
    const result = computeMilestoneProgress(
      benchmark,
      [a, b],
      buildLogIndex(logs),
    );
    expect(result.daysDone).toBe(2);
    expect(result.actions.find((x) => x.action.id === a.id)?.daysDone).toBe(3);
    expect(result.actions.find((x) => x.action.id === b.id)?.daysDone).toBe(2);
  });

  it("only counts scheduled weekdays toward the target", () => {
    jest.setSystemTime(new Date(2026, 6, 6, 21, 30)); // Monday evening
    const benchmark = makeBenchmark({ createdAt: "2026-06-22T12:00:00" });
    const action = makeAction(["Monday"], "2026-06-22T12:00:00", {
      benchmarkId: benchmark.id,
    });
    const logs = logsFor(action, ["2026-06-22", "2026-06-29", "2026-07-06"]);
    const result = computeMilestoneProgress(
      benchmark,
      [action],
      buildLogIndex(logs),
    );
    expect(result.daysDone).toBe(3); // three completed Mondays; other days are rest days
    expect(result.progress).toBe(14); // round(3/21*100)
  });
});

describe("computeWeeklyRecap", () => {
  it("recaps the last complete Monday-Sunday week from a mid-week vantage point", () => {
    const action = makeAction(DAILY, "2026-06-22T08:00:00");
    const logs = logsFor(action, [
      // prev week (06-22 .. 06-28): 3 of 7
      "2026-06-22",
      "2026-06-24",
      "2026-06-26",
      // last week (06-29 .. 07-05): 6 of 7 (Sunday missed)
      "2026-06-29",
      "2026-06-30",
      "2026-07-01",
      "2026-07-02",
      "2026-07-03",
      "2026-07-04",
      // current week (07-06 ..): 3 so far
      "2026-07-06",
      "2026-07-07",
      "2026-07-08",
    ]);
    const recap = computeWeeklyRecap(
      [action],
      logs,
      new Date(2026, 6, 8, 10, 0), // Wednesday July 8
    );
    expect(recap.weekKey).toBe("2026-06-29");
    expect(recap.lastWeek).toEqual({
      scheduled: 7,
      completed: 6,
      bestDay: "Monday", // ties resolve to the first day with the max
      score: 86,
    });
    expect(recap.prevWeek.completed).toBe(3);
    expect(recap.prevWeek.score).toBe(43);
    expect(recap.currentWeekCompleted).toBe(3);
  });

  it("picks the weekday with the most completions as best day", () => {
    const a = makeAction(DAILY, "2026-06-22T08:00:00");
    const b = makeAction(DAILY, "2026-06-22T08:00:00");
    const logs = [
      makeLog(a.id, "2026-06-29"), // Monday: 1
      makeLog(a.id, "2026-07-01"), // Wednesday: 2
      makeLog(b.id, "2026-07-01"),
    ];
    const recap = computeWeeklyRecap([a, b], logs, new Date(2026, 6, 8, 10, 0));
    expect(recap.lastWeek.bestDay).toBe("Wednesday");
    expect(recap.lastWeek.completed).toBe(3);
    expect(recap.lastWeek.scheduled).toBe(14);
  });

  it("on a Sunday, the still-running week is current — not the recapped week", () => {
    const action = makeAction(DAILY, "2026-06-22T08:00:00");
    const logs = logsFor(action, [
      "2026-06-22",
      "2026-06-23",
      "2026-06-24",
      "2026-06-25",
      "2026-06-26",
      "2026-06-27",
      "2026-06-28",
      "2026-07-05", // today (Sunday) — belongs to the current week
    ]);
    const recap = computeWeeklyRecap(
      [action],
      logs,
      new Date(2026, 6, 5, 22, 0), // Sunday July 5, evening
    );
    expect(recap.weekKey).toBe("2026-06-22");
    expect(recap.lastWeek.completed).toBe(7);
    expect(recap.lastWeek.score).toBe(100);
    expect(recap.currentWeekCompleted).toBe(1);
  });

  it("on a Monday, the week that just ended becomes the recapped week", () => {
    const action = makeAction(DAILY, "2026-06-29T08:00:00");
    const logs = logsFor(action, [
      "2026-06-29",
      "2026-06-30",
      "2026-07-01",
      "2026-07-02",
      "2026-07-03",
      "2026-07-04",
      "2026-07-05",
      "2026-07-06", // today (Monday)
    ]);
    const recap = computeWeeklyRecap(
      [action],
      logs,
      new Date(2026, 6, 6, 7, 0), // Monday July 6, early morning
    );
    expect(recap.weekKey).toBe("2026-06-29");
    expect(recap.lastWeek.completed).toBe(7);
    expect(recap.currentWeekCompleted).toBe(1);
  });

  it("respects each action's creation date — no phantom misses before it existed", () => {
    const action = makeAction(DAILY, "2026-07-02T08:00:00"); // Thursday of last week
    const logs = logsFor(action, ["2026-07-02", "2026-07-03"]);
    const recap = computeWeeklyRecap(
      [action],
      logs,
      new Date(2026, 6, 8, 10, 0),
    );
    expect(recap.lastWeek.scheduled).toBe(4); // Thu, Fri, Sat, Sun only
    expect(recap.lastWeek.completed).toBe(2);
    expect(recap.lastWeek.score).toBe(50);
    expect(recap.prevWeek).toEqual({
      scheduled: 0,
      completed: 0,
      bestDay: null,
      score: 0,
    });
  });
});

describe("computeLapse", () => {
  it("detects consecutive fully-missed scheduled days ending yesterday", () => {
    jest.setSystemTime(new Date(2026, 6, 6, 9, 0)); // Monday
    const action = makeAction(DAILY, "2026-06-29T08:00:00");
    const logs = logsFor(action, [
      "2026-06-29",
      "2026-06-30",
      "2026-07-01",
      "2026-07-02",
      "2026-07-03",
      // 07-04 and 07-05 fully missed
    ]);
    expect(computeLapse([action], logs)).toEqual({
      missedDays: 2,
      lastMissedDate: "2026-07-05",
    });
  });

  it("bridges rest days in the missed run", () => {
    jest.setSystemTime(new Date(2026, 6, 11, 9, 0)); // Saturday July 11
    const action = makeAction(
      ["Monday", "Wednesday", "Friday"],
      "2026-07-01T08:00:00",
    );
    const logs = [makeLog(action.id, "2026-07-06")]; // Monday completed
    // Fri 07-10 missed, Thu rest, Wed 07-08 missed, Tue rest, Mon completed
    expect(computeLapse([action], logs)).toEqual({
      missedDays: 2,
      lastMissedDate: "2026-07-10",
    });
  });

  it("does not count a pending (unlogged) today", () => {
    jest.setSystemTime(new Date(2026, 6, 6, 9, 0));
    const action = makeAction(DAILY, "2026-07-01T08:00:00");
    const logs = logsFor(action, [
      "2026-07-01",
      "2026-07-02",
      "2026-07-03",
      "2026-07-04",
      "2026-07-05",
    ]);
    // Today is unlogged but pending, never part of a lapse
    expect(computeLapse([action], logs)).toEqual({
      missedDays: 0,
      lastMissedDate: null,
    });
  });

  it("a completed day ends the missed run", () => {
    jest.setSystemTime(new Date(2026, 6, 6, 9, 0));
    const action = makeAction(DAILY, "2026-07-01T08:00:00");
    const logs = [makeLog(action.id, "2026-07-05")]; // yesterday completed
    // Earlier misses (07-01 .. 07-04) are behind the completed day
    expect(computeLapse([action], logs)).toEqual({
      missedDays: 0,
      lastMissedDate: null,
    });
  });

  it("a partial completion (any action done) ends the run", () => {
    jest.setSystemTime(new Date(2026, 6, 6, 9, 0));
    const a = makeAction(DAILY, "2026-07-01T08:00:00");
    const b = makeAction(DAILY, "2026-07-01T08:00:00");
    const logs = [makeLog(a.id, "2026-07-05")]; // b missed yesterday, a done
    expect(computeLapse([a, b], logs)).toEqual({
      missedDays: 0,
      lastMissedDate: null,
    });
  });

  it("never counts days before the action existed", () => {
    jest.setSystemTime(new Date(2026, 6, 6, 9, 0));
    const action = makeAction(DAILY, "2026-07-04T08:00:00");
    expect(computeLapse([action], [])).toEqual({
      missedDays: 2, // 07-04 and 07-05 only
      lastMissedDate: "2026-07-05",
    });
  });

  it("returns no lapse with no actions", () => {
    jest.setSystemTime(new Date(2026, 6, 6, 9, 0));
    expect(computeLapse([], [])).toEqual({
      missedDays: 0,
      lastMissedDate: null,
    });
  });
});

describe("sortWeekdays", () => {
  it("orders days Monday-first regardless of input order", () => {
    expect(sortWeekdays(["Thursday", "Monday", "Sunday", "Wednesday"])).toEqual(
      ["Monday", "Wednesday", "Thursday", "Sunday"],
    );
  });

  it("does not mutate the input array", () => {
    const input = ["Friday", "Monday"];
    sortWeekdays(input);
    expect(input).toEqual(["Friday", "Monday"]);
  });
});

describe("formatScheduleDays", () => {
  it("labels all seven days as Every day", () => {
    expect(
      formatScheduleDays([
        "Sunday",
        "Saturday",
        "Friday",
        "Thursday",
        "Wednesday",
        "Tuesday",
        "Monday",
      ]),
    ).toBe("Every day");
  });

  it("labels Mon-Fri as Weekdays", () => {
    expect(
      formatScheduleDays([
        "Friday",
        "Wednesday",
        "Monday",
        "Thursday",
        "Tuesday",
      ]),
    ).toBe("Weekdays");
  });

  it("abbreviates other sets in calendar order", () => {
    expect(formatScheduleDays(["Saturday", "Wednesday", "Monday"])).toBe(
      "Mon · Wed · Sat",
    );
  });
});

describe("buildProgressSnapshot", () => {
  it("matches the standalone progress calculations and reuses one log index", () => {
    jest.setSystemTime(new Date(2026, 6, 6, 9, 0));
    const benchmark = makeBenchmark({ id: "benchmark-snapshot" });
    const action = makeAction(DAILY, "2026-07-01T08:00:00", {
      benchmarkId: benchmark.id,
    });
    const logs = logsFor(action, [
      "2026-07-01",
      "2026-07-02",
      "2026-07-03",
      "2026-07-04",
      "2026-07-05",
      "2026-07-06",
    ]);

    const snapshot = buildProgressSnapshot([action], logs, [benchmark]);

    expect(snapshot.momentumScore).toBe(
      computeMomentumScore([action], logs, 7),
    );
    expect(snapshot.personaAlignment).toBe(
      computeMomentumScore([action], logs, 6),
    );
    expect(snapshot.streak).toEqual(computeStreak([action], logs));
    expect(snapshot.lapse).toEqual(computeLapse([action], logs));
    expect(snapshot.weeklyRecap).toEqual(computeWeeklyRecap([action], logs));
    expect(snapshot.milestoneProgress[0]).toEqual(
      computeMilestoneProgress(benchmark, [action], snapshot.logIndex),
    );
    expect(snapshot.milestoneProgressByBenchmarkId.get(benchmark.id)).toBe(
      snapshot.milestoneProgress[0],
    );
  });
});

describe("formatTargetCountdown", () => {
  const today = new Date(2026, 6, 15); // Jul 15, 2026 (local)

  it("returns null when no target date is set", () => {
    expect(formatTargetCountdown(null, today)).toBeNull();
  });

  it("labels near-term targets in days", () => {
    expect(formatTargetCountdown("2026-07-15", today)).toBe("target today");
    expect(formatTargetCountdown("2026-07-16", today)).toBe("1 day left");
    expect(formatTargetCountdown("2026-07-20", today)).toBe("5 days left");
    expect(formatTargetCountdown("2026-07-28", today)).toBe("13 days left");
  });

  it("labels two weeks and beyond in weeks", () => {
    expect(formatTargetCountdown("2026-07-29", today)).toBe("2 weeks left");
    expect(formatTargetCountdown("2026-08-05", today)).toBe("3 weeks left");
    expect(formatTargetCountdown("2026-10-15", today)).toBe("13 weeks left");
  });

  it("is gentle past the target — no negative counts", () => {
    expect(formatTargetCountdown("2026-07-14", today)).toBe("past target");
    expect(formatTargetCountdown("2026-01-01", today)).toBe("past target");
  });

  it("ignores any time component on stored dates", () => {
    expect(formatTargetCountdown("2026-07-16T08:00:00.000Z", today)).toBe(
      "1 day left",
    );
  });
});

describe("backfilled completions before action creation", () => {
  // Regression: users can backfill past days from the Journey day detail,
  // and the calendar paints them green — the scorers must agree. A completed
  // log proves the day was trackable even if it predates action.createdAt;
  // non-logged pre-creation days stay excluded (day-one 100% behavior).

  it("computeMomentumScore counts a backfilled pre-creation day as 1/1", () => {
    jest.setSystemTime(new Date(2026, 6, 12, 10, 0)); // Sun Jul 12, morning
    const action = makeAction(DAILY, "2026-07-12T08:00:00"); // created today
    const logs = logsFor(action, ["2026-07-08", "2026-07-09", "2026-07-10"]);
    // Window = day of month (12): backfilled 8-10 count 3/3; Jul 11 is
    // pre-creation with no log (excluded); today unlogged (excluded)
    expect(computeMomentumScore([action], logs, 12)).toBe(100);
  });

  it("computeMomentumScore still shows 100% on a fresh day-one plan", () => {
    jest.setSystemTime(new Date(2026, 6, 12, 20, 0));
    const action = makeAction(DAILY, "2026-07-12T08:00:00");
    const logs = logsFor(action, ["2026-07-12"]);
    expect(computeMomentumScore([action], logs, 12)).toBe(100);
  });

  it("computeStreak counts backfilled pre-creation days in the run", () => {
    jest.setSystemTime(new Date(2026, 6, 12, 10, 0));
    const action = makeAction(DAILY, "2026-07-12T08:00:00");
    const logs = logsFor(action, ["2026-07-10", "2026-07-11", "2026-07-12"]);
    const streak = computeStreak([action], logs);
    expect(streak.current).toBe(3);
    expect(streak.longest).toBe(3);
  });

  it("computeWeeklyRecap counts backfilled days as scheduled+completed", () => {
    jest.setSystemTime(new Date(2026, 6, 15, 10, 0)); // Wed Jul 15
    const action = makeAction(DAILY, "2026-07-14T08:00:00"); // created Tue
    // Last complete week is Jul 6-12, all before creation; backfill 3 days
    const logs = logsFor(action, ["2026-07-08", "2026-07-09", "2026-07-10"]);
    const recap = computeWeeklyRecap([action], logs);
    expect(recap.lastWeek.completed).toBe(3);
    expect(recap.lastWeek.scheduled).toBe(3);
    expect(recap.lastWeek.score).toBe(100);
  });

  it("computeMilestoneProgress counts backfilled days toward the target", () => {
    jest.setSystemTime(new Date(2026, 6, 12, 10, 0));
    const benchmark = makeBenchmark({ createdAt: "2026-07-12T08:00:00" });
    const action = makeAction(DAILY, "2026-07-12T08:00:00", {
      benchmarkId: benchmark.id,
    });
    const logs = logsFor(action, ["2026-07-08", "2026-07-09", "2026-07-10"]);
    const result = computeMilestoneProgress(
      benchmark,
      [action],
      buildLogIndex(logs),
    );
    expect(result.daysDone).toBe(3);
  });

  it("computeLapse: a backfilled completion ends the missed-days walk", () => {
    jest.setSystemTime(new Date(2026, 6, 12, 10, 0));
    const action = makeAction(DAILY, "2026-07-05T08:00:00");
    // Missed Jul 10-11, but Jul 9 was completed: lapse = 2, not more
    const logs = logsFor(action, ["2026-07-09"]);
    const lapse = computeLapse([action], logs);
    expect(lapse.missedDays).toBe(2);
    expect(lapse.lastMissedDate).toBe("2026-07-11");
  });
});
