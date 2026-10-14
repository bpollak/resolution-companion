import {
  buildTodayProgressLine,
  canShowReminderPrimer,
  countCompletedDays,
  dayCompleteProgressText,
  isWeeklyRecapFresh,
  parseReminderPrimerDays,
  planDayNumber,
  recordReminderPrimerDay,
  REMINDER_PRIMER_MAX_DAYS,
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
  const none = {
    timeLimited: false,
    primer: false,
    widgetHint: false,
    secondary: false,
  };

  it("shows nothing when no card is eligible", () => {
    expect(selectTodayOptionalCard(none)).toBeNull();
  });

  it("puts a time-limited recap ahead of every teach-once tip", () => {
    expect(
      selectTodayOptionalCard({
        timeLimited: true,
        primer: true,
        widgetHint: true,
        secondary: true,
      }),
    ).toBe("time-limited");
    expect(
      selectTodayOptionalCard({ ...none, timeLimited: true, widgetHint: true }),
    ).toBe("time-limited");
  });

  it("prefers the reminder primer over the widget hint and nudges", () => {
    expect(
      selectTodayOptionalCard({
        ...none,
        primer: true,
        widgetHint: true,
        secondary: true,
      }),
    ).toBe("primer");
  });

  it("prefers the widget hint over the invite/nudge chain", () => {
    expect(
      selectTodayOptionalCard({ ...none, widgetHint: true, secondary: true }),
    ).toBe("widget-hint");
  });

  it("falls back to the invite/nudge chain", () => {
    expect(selectTodayOptionalCard({ ...none, secondary: true })).toBe(
      "secondary",
    );
  });
});

describe("reminder primer cap", () => {
  it("parses stored days defensively", () => {
    expect(parseReminderPrimerDays(null)).toEqual([]);
    expect(parseReminderPrimerDays("not json")).toEqual([]);
    expect(parseReminderPrimerDays('{"a":1}')).toEqual([]);
    expect(parseReminderPrimerDays('["2026-10-12", 4, "2026-10-13"]')).toEqual([
      "2026-10-12",
      "2026-10-13",
    ]);
  });

  it("allows the first three days it appears, then stops", () => {
    expect(REMINDER_PRIMER_MAX_DAYS).toBe(3);
    let days: string[] = [];
    for (const day of ["2026-10-12", "2026-10-13", "2026-10-15"]) {
      expect(canShowReminderPrimer(days, day)).toBe(true);
      days = recordReminderPrimerDay(days, day);
    }
    expect(days).toHaveLength(3);
    expect(canShowReminderPrimer(days, "2026-10-16")).toBe(false);
  });

  it("keeps showing for the rest of a day that already counted", () => {
    const days = ["2026-10-12", "2026-10-13", "2026-10-14"];
    expect(canShowReminderPrimer(days, "2026-10-14")).toBe(true);
  });

  it("does not record the same day twice", () => {
    const days = ["2026-10-12"];
    expect(recordReminderPrimerDay(days, "2026-10-12")).toBe(days);
    expect(recordReminderPrimerDay(days, "2026-10-13")).toEqual([
      "2026-10-12",
      "2026-10-13",
    ]);
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
    showConsistency: false,
  };

  it("shows Day N and hides the month figure for a new plan", () => {
    const line = buildTodayProgressLine(base);
    expect(line.parts).toEqual(["0/1 done", "Day 1"]);
    expect(line.accessibilityLabel).toBe(
      "0 of 1 done today. Day 1 of your plan.",
    );
  });

  it("shows the streak and month consistency once the month has data", () => {
    expect(
      buildTodayProgressLine({
        ...base,
        completed: 1,
        scheduled: 2,
        streak: 12,
        planDay: 33,
        consistency: 82,
        showConsistency: true,
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
      buildTodayProgressLine({
        ...base,
        planDay: 40,
        consistency: 55,
        showConsistency: true,
      }).parts,
    ).toEqual(["0/1 done", "Day 40", "55% this month"]);
  });

  it("hides the month figure on an old plan's first days of a month", () => {
    // Day 31 of the plan, but October 1 has no month history yet
    expect(
      buildTodayProgressLine({ ...base, planDay: 31, consistency: 100 }).parts,
    ).toEqual(["0/1 done", "Day 31"]);
  });
});

describe("dayCompleteProgressText", () => {
  const base = {
    showConsistency: false,
    monthName: "October",
    consistency: 100,
    planDay: 1,
    streak: 1,
  };

  it("never claims 100% month consistency on plan day one", () => {
    expect(dayCompleteProgressText(base)).toBeNull();
  });

  it("names the plan day when it differs from the streak", () => {
    expect(dayCompleteProgressText({ ...base, planDay: 4, streak: 2 })).toBe(
      "Day 4 of your plan",
    );
  });

  it("shows month consistency once the month has enough planned days", () => {
    expect(
      dayCompleteProgressText({
        ...base,
        showConsistency: true,
        consistency: 86,
        planDay: 20,
        streak: 5,
      }),
    ).toBe("October consistency: 86%");
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
