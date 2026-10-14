import {
  buildTodayProgressLine,
  countCompletedDays,
  isWeeklyRecapFresh,
  planDayNumber,
  selectTodayOptionalCard,
  toastDurationFor,
} from "../today-layout";
import type { DailyLog } from "../storage";

function log(logDate: string, status: boolean, actionId = "a1"): DailyLog {
  return {
    id: `${actionId}-${logDate}`,
    actionId,
    logDate,
    status,
  } as DailyLog;
}

describe("selectTodayOptionalCard", () => {
  it("shows nothing when no card is eligible", () => {
    expect(
      selectTodayOptionalCard({
        primer: false,
        widgetHint: false,
        secondary: false,
      }),
    ).toBeNull();
  });

  it("prefers the reminder primer over everything else", () => {
    expect(
      selectTodayOptionalCard({
        primer: true,
        widgetHint: true,
        secondary: true,
      }),
    ).toBe("primer");
  });

  it("prefers the widget hint over the recap/invite chain", () => {
    expect(
      selectTodayOptionalCard({
        primer: false,
        widgetHint: true,
        secondary: true,
      }),
    ).toBe("widget-hint");
  });

  it("falls back to the recap/invite chain", () => {
    expect(
      selectTodayOptionalCard({
        primer: false,
        widgetHint: false,
        secondary: true,
      }),
    ).toBe("secondary");
  });
});

describe("isWeeklyRecapFresh", () => {
  // 2026-10-12 is a Monday
  it.each([
    ["2026-10-12", true],
    ["2026-10-13", true],
    ["2026-10-14", true],
    ["2026-10-15", false],
    ["2026-10-17", false],
    ["2026-10-18", false],
  ])("%s -> %s", (dateKey, expected) => {
    expect(isWeeklyRecapFresh(new Date(`${dateKey}T09:00:00`))).toBe(expected);
  });
});

describe("countCompletedDays", () => {
  it("counts distinct dates with a completed log", () => {
    expect(
      countCompletedDays([
        log("2026-10-01", true),
        log("2026-10-01T00:00:00.000Z", true, "a2"),
        log("2026-10-02", false),
        log("2026-10-03", true),
      ]),
    ).toBe(2);
  });

  it("is zero with no completions", () => {
    expect(countCompletedDays([log("2026-10-02", false)])).toBe(0);
  });
});

describe("planDayNumber", () => {
  it("is day 1 on the start date", () => {
    expect(planDayNumber("2026-10-14", "2026-10-14")).toBe(1);
  });

  it("counts calendar days across a DST change", () => {
    expect(planDayNumber("2026-10-31", "2026-11-02")).toBe(3);
  });

  it("never goes below 1 for a future start", () => {
    expect(planDayNumber("2027-01-01", "2026-10-14")).toBe(1);
  });
});

describe("buildTodayProgressLine", () => {
  const base = {
    completed: 0,
    scheduled: 1,
    streak: 0,
    shieldUsed: false,
    planDay: 1,
    consistency: 0,
  };

  it("shows Day N and hides the month figure for a new plan", () => {
    const line = buildTodayProgressLine(base);
    expect(line.parts).toEqual(["0/1 done", "Day 1"]);
    expect(line.accessibilityLabel).toBe(
      "0 of 1 done today. Day 1 of your plan.",
    );
  });

  it("shows the streak and month consistency once a week in", () => {
    expect(
      buildTodayProgressLine({
        ...base,
        completed: 1,
        scheduled: 2,
        streak: 12,
        planDay: 33,
        consistency: 82,
      }).parts,
    ).toEqual(["1/2 done", "12-day streak", "82% this month"]);
  });

  it("marks a shield-protected streak", () => {
    expect(
      buildTodayProgressLine({ ...base, streak: 9, shieldUsed: true }).parts,
    ).toEqual(["0/1 done", "9-day streak (protected)"]);
    expect(buildTodayProgressLine({ ...base, shieldUsed: true }).parts).toEqual(
      ["0/1 done", "Protected"],
    );
  });

  it("falls back to Day N when an established streak has ended", () => {
    expect(
      buildTodayProgressLine({ ...base, planDay: 40, consistency: 55 }).parts,
    ).toEqual(["0/1 done", "Day 40", "55% this month"]);
  });
});

describe("toastDurationFor", () => {
  it("keeps short messages at two seconds", () => {
    expect(toastDurationFor("Consistency +5%")).toBe(2000);
  });

  it("scales with message length", () => {
    const message =
      "An earned rest day covered a missed day. Your streak is safe.";
    expect(toastDurationFor(message)).toBe(message.length * 60);
    expect(toastDurationFor(message)).toBeGreaterThan(2000);
  });

  it("caps very long messages", () => {
    expect(toastDurationFor("x".repeat(500))).toBe(6000);
  });
});
