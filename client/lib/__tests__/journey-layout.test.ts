import {
  calendarWeekCount,
  chunkIntoWeeks,
  formatEarlyProgress,
  getMonthProgressDisplay,
  showsMonthConsistency,
  hasRhythmToSimplify,
  nextDaySelection,
  rhythmStatusText,
} from "@/lib/journey-layout";
import type { DailyLog } from "@/lib/storage";
import type { ActionRhythm } from "@/lib/ambient-coach";

const EVERY_DAY = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

function logsFor(actionId: string, dates: string[]): Map<string, DailyLog> {
  return new Map(
    dates.map((logDate) => [
      `${actionId}|${logDate}`,
      {
        id: `${actionId}-${logDate}`,
        actionId,
        logDate,
        status: true,
        createdAt: `${logDate}T12:00:00Z`,
      },
    ]),
  );
}

describe("calendarWeekCount", () => {
  test.each([
    [2026, 9, 5], // October 2026 starts Thursday, 31 days
    [2026, 7, 6], // August 2026 starts Saturday, 31 days
    [2026, 4, 6], // May 2026 starts Friday, 31 days
    [2026, 1, 4], // February 2026 starts Sunday, 28 days
    [2028, 1, 5], // February 2028 is a leap month starting Tuesday
    [2026, 10, 5], // November 2026 starts Sunday, 30 days
  ])("%i-%i needs %i rows", (year, month, rows) => {
    expect(calendarWeekCount(year, month)).toBe(rows);
  });
});

describe("chunkIntoWeeks", () => {
  test("splits a 5-row month into five rows of seven", () => {
    const days = Array.from({ length: 35 }, (_, i) => i);
    const weeks = chunkIntoWeeks(days);
    expect(weeks).toHaveLength(calendarWeekCount(2026, 9));
    expect(weeks.every((week) => week.length === 7)).toBe(true);
    expect(weeks[4][6]).toBe(34);
  });
});

describe("getMonthProgressDisplay", () => {
  const newAction = {
    id: "a1",
    frequency: EVERY_DAY,
    createdAt: "2026-10-12T15:00:00Z",
  };

  test("a three-day-old plan shows Day N with every day done", () => {
    const display = getMonthProgressDisplay({
      actions: [newAction],
      logIndex: logsFor("a1", ["2026-10-12", "2026-10-13", "2026-10-14"]),
      planStartedAt: "2026-10-12T15:00:00Z",
      now: new Date(2026, 9, 14, 12),
    });
    expect(display).toEqual({
      kind: "early",
      dayNumber: 3,
      completedDays: 3,
      plannedDays: 3,
      monthOnly: false,
    });
    expect(
      formatEarlyProgress(
        display as Extract<typeof display, { kind: "early" }>,
      ),
    ).toEqual({ title: "Day 3", detail: "3 of 3 days" });
  });

  test("today is not counted until it is done", () => {
    const display = getMonthProgressDisplay({
      actions: [newAction],
      logIndex: logsFor("a1", ["2026-10-12", "2026-10-13"]),
      planStartedAt: "2026-10-12T15:00:00Z",
      now: new Date(2026, 9, 14, 12),
    });
    expect(display).toMatchObject({
      kind: "early",
      completedDays: 2,
      plannedDays: 2,
    });
  });

  test("day one with nothing done yet reads as a start, not 0 of 0", () => {
    const display = getMonthProgressDisplay({
      actions: [newAction],
      logIndex: new Map(),
      planStartedAt: "2026-10-12T15:00:00Z",
      now: new Date(2026, 9, 12, 18),
    });
    expect(display.kind).toBe("early");
    expect(
      formatEarlyProgress(
        display as Extract<typeof display, { kind: "early" }>,
      ),
    ).toEqual({ title: "Day 1", detail: "Just getting started" });
  });

  test("an older plan early in a new month counts this month only", () => {
    const action = {
      id: "a1",
      frequency: EVERY_DAY,
      createdAt: "2026-09-01T15:00:00Z",
    };
    const display = getMonthProgressDisplay({
      actions: [action],
      logIndex: logsFor("a1", ["2026-10-01", "2026-10-02", "2026-10-03"]),
      planStartedAt: "2026-09-01T15:00:00Z",
      now: new Date(2026, 9, 3, 20),
    });
    expect(display).toEqual({
      kind: "early",
      dayNumber: 33,
      completedDays: 3,
      plannedDays: 3,
      monthOnly: true,
    });
    expect(
      formatEarlyProgress(display as Extract<typeof display, { kind: "early" }>)
        .detail,
    ).toBe("3 of 3 days this month");
  });

  test("an older plan on the 1st with nothing planned yet reads New month", () => {
    const action = {
      id: "a1",
      frequency: EVERY_DAY,
      createdAt: "2026-09-01T15:00:00Z",
    };
    const display = getMonthProgressDisplay({
      actions: [action],
      logIndex: logsFor("a1", ["2026-09-29", "2026-09-30"]),
      planStartedAt: "2026-09-01T15:00:00Z",
      now: new Date(2026, 9, 1, 9),
    });
    expect(display).toEqual({
      kind: "early",
      dayNumber: 31,
      completedDays: 0,
      plannedDays: 0,
      monthOnly: true,
    });
    expect(showsMonthConsistency(display)).toBe(false);
    expect(
      formatEarlyProgress(
        display as Extract<typeof display, { kind: "early" }>,
      ),
    ).toEqual({ title: "Day 31", detail: "New month" });
  });

  test("an older plan with no planned days yet this month never says getting started", () => {
    const weekendOnly = {
      id: "a1",
      frequency: ["Saturday", "Sunday"],
      createdAt: "2026-09-01T15:00:00Z",
    };
    // Thursday Oct 1 and Friday Oct 2 have nothing scheduled
    const display = getMonthProgressDisplay({
      actions: [weekendOnly],
      logIndex: new Map(),
      planStartedAt: "2026-09-01T15:00:00Z",
      now: new Date(2026, 9, 2, 9),
    });
    expect(display).toMatchObject({ kind: "early", plannedDays: 0 });
    expect(
      formatEarlyProgress(display as Extract<typeof display, { kind: "early" }>)
        .detail,
    ).toBe("New month");
  });

  test("seven planned days on a week-old plan switch to the ring", () => {
    const action = {
      id: "a1",
      frequency: EVERY_DAY,
      createdAt: "2026-09-01T15:00:00Z",
    };
    const display = getMonthProgressDisplay({
      actions: [action],
      logIndex: logsFor("a1", ["2026-10-01", "2026-10-02"]),
      planStartedAt: "2026-09-01T15:00:00Z",
      now: new Date(2026, 9, 8, 9),
    });
    // Oct 1-7 are planned (missed days still count); Oct 8 is pending.
    expect(display).toEqual({ kind: "ring" });
    expect(showsMonthConsistency(display)).toBe(true);
  });

  test("a sparse schedule stays in Day N until seven planned days", () => {
    const action = {
      id: "a1",
      frequency: ["Monday", "Thursday"],
      createdAt: "2026-10-01T15:00:00Z",
    };
    const display = getMonthProgressDisplay({
      actions: [action],
      logIndex: logsFor("a1", ["2026-10-01", "2026-10-05", "2026-10-08"]),
      planStartedAt: "2026-10-01T15:00:00Z",
      now: new Date(2026, 9, 14, 12),
    });
    expect(display).toMatchObject({
      kind: "early",
      dayNumber: 14,
      completedDays: 3,
      plannedDays: 4,
    });
  });

  test("partially done days count as planned, not completed", () => {
    const second = { ...newAction, id: "a2" };
    const logs = logsFor("a1", ["2026-10-12", "2026-10-13"]);
    for (const [key, log] of logsFor("a2", ["2026-10-12"])) logs.set(key, log);
    const display = getMonthProgressDisplay({
      actions: [newAction, second],
      logIndex: logs,
      planStartedAt: "2026-10-12T15:00:00Z",
      now: new Date(2026, 9, 14, 12),
    });
    expect(display).toMatchObject({ completedDays: 1, plannedDays: 2 });
  });
});

describe("nextDaySelection", () => {
  const today = new Date(2026, 9, 14, 9);

  test("selects a past or future day", () => {
    const past = new Date(2026, 9, 10);
    expect(nextDaySelection(null, past, today)).toBe(past);
    const tomorrow = new Date(2026, 9, 15);
    expect(nextDaySelection(past, tomorrow, today)).toBe(tomorrow);
  });

  test("tapping the selected day clears it", () => {
    expect(
      nextDaySelection(new Date(2026, 9, 10), new Date(2026, 9, 10), today),
    ).toBeNull();
  });

  test("tapping today clears the selection", () => {
    expect(
      nextDaySelection(new Date(2026, 9, 10), new Date(2026, 9, 14), today),
    ).toBeNull();
  });
});

describe("rhythm helpers", () => {
  const rhythm = (
    category: ActionRhythm["category"],
    scheduled = 28,
    completed = 20,
  ): ActionRhythm => ({
    actionId: "a1",
    category,
    scheduled,
    completed,
    rate: scheduled ? Math.round((completed / scheduled) * 100) : 0,
  });

  test("the card shows only when a habit is worth simplifying", () => {
    expect(hasRhythmToSimplify([])).toBe(false);
    expect(
      hasRhythmToSimplify([rhythm("working-well"), rhythm("still-forming")]),
    ).toBe(false);
    expect(
      hasRhythmToSimplify([
        rhythm("working-well"),
        rhythm("worth-simplifying"),
      ]),
    ).toBe(true);
  });

  test("status text matches the rhythm card copy", () => {
    expect(rhythmStatusText(rhythm("working-well", 28, 28))).toBe(
      "Working well · 28/28 completed",
    );
    expect(rhythmStatusText(rhythm("still-forming", 3, 3))).toBe(
      "Still learning your rhythm",
    );
  });
});
