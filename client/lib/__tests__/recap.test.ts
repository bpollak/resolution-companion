/**
 * Unit tests for the pure Month-in-Votes math in client/lib/recap.ts.
 * Tests run under TZ=America/Los_Angeles like the rest of the suite.
 */

import {
  buildMonthRecap,
  buildYearRecap,
  daysSincePlanStart,
  getMonthKey,
  getPreviousMonthKey,
  yearClosingLine,
  yearRecapEdition,
  yearStoryCopy,
} from "@/lib/recap";
import { withFrequencyChange } from "@/lib/schedule-history";
import type { ElementalAction, DailyLog, Persona } from "@/lib/storage";

const persona: Persona = {
  id: "p1",
  name: "Consistent Runner",
  description: "",
  createdAt: "2026-05-01T00:00:00",
};

const ALL_DAYS = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
];

function action(
  id: string,
  frequency: string[] = ALL_DAYS,
  createdAt = "2026-05-01T00:00:00",
): ElementalAction {
  return {
    id,
    benchmarkId: "b1",
    title: `Action ${id}`,
    frequency,
    anchorLink: "",
    kickstartVersion: "",
    createdAt,
  };
}

function log(actionId: string, logDate: string, status = true): DailyLog {
  return {
    id: `log-${actionId}-${logDate}`,
    actionId,
    logDate,
    status,
    createdAt: `${logDate}T10:00:00`,
  };
}

// A "today" safely after June 2026 so the June recap covers the full month
const TODAY = new Date("2026-07-16T12:00:00");

describe("month keys", () => {
  it("derives the month key from a local date", () => {
    expect(getMonthKey(new Date("2026-07-16T12:00:00"))).toBe("2026-07");
  });

  it("computes the previous month across a year boundary", () => {
    expect(getPreviousMonthKey(new Date("2026-01-15T12:00:00"))).toBe(
      "2025-12",
    );
    expect(getPreviousMonthKey(new Date("2026-07-16T12:00:00"))).toBe(
      "2026-06",
    );
  });
});

describe("buildMonthRecap", () => {
  it("counts votes and consistency for a daily action", () => {
    const logs = [
      log("a", "2026-06-01"),
      log("a", "2026-06-02"),
      log("a", "2026-06-03"),
    ];
    const recap = buildMonthRecap(
      [action("a")],
      logs,
      persona,
      "2026-06",
      TODAY,
    );
    expect(recap.votesCast).toBe(3);
    // June 2026 has 30 days, all scheduled for a daily action
    expect(recap.scheduled).toBe(30);
    expect(recap.consistency).toBe(10);
    expect(recap.monthLabel).toBe("June 2026");
    expect(recap.personaName).toBe("Consistent Runner");
  });

  it("finds the comeback after the longest gap", () => {
    // Complete June 1-2, miss 3-6 (4-day gap), come back on the 7th
    const logs = [
      log("a", "2026-06-01"),
      log("a", "2026-06-02"),
      log("a", "2026-06-07"),
    ];
    const recap = buildMonthRecap(
      [action("a")],
      logs,
      persona,
      "2026-06",
      TODAY,
    );
    expect(recap.comeback).toEqual({ date: "2026-06-07", gapDays: 4 });
    expect(recap.closingLine).toContain("came back");
  });

  it("reports no comeback for a steady month", () => {
    const logs = Array.from({ length: 30 }, (_, i) =>
      log("a", `2026-06-${String(i + 1).padStart(2, "0")}`),
    );
    const recap = buildMonthRecap(
      [action("a")],
      logs,
      persona,
      "2026-06",
      TODAY,
    );
    expect(recap.comeback).toBeNull();
    expect(recap.consistency).toBe(100);
    expect(recap.longestRun).toBe(30);
    expect(recap.closingLine).toContain("habit");
  });

  it("identifies the best weekday", () => {
    // June 2026: the 1st, 8th, 15th, 22nd are Mondays
    const logs = [
      log("a", "2026-06-01"),
      log("a", "2026-06-08"),
      log("a", "2026-06-15"),
      log("a", "2026-06-03"),
    ];
    const recap = buildMonthRecap(
      [action("a")],
      logs,
      persona,
      "2026-06",
      TODAY,
    );
    expect(recap.bestWeekday).toBe("Monday");
    expect(recap.bestTimeOfDay).toBe("morning");
  });

  it("caps a current-month recap at today", () => {
    const logs = [log("a", "2026-07-01")];
    const recap = buildMonthRecap(
      [action("a")],
      logs,
      persona,
      "2026-07",
      TODAY,
    );
    // July 1 through July 16 only
    expect(recap.scheduled).toBe(16);
  });

  it("tells a warm story even for an empty month", () => {
    const recap = buildMonthRecap([action("a")], [], persona, "2026-06", TODAY);
    expect(recap.votesCast).toBe(0);
    expect(recap.closingLine).toContain("day one");
  });

  it("only counts scheduled weekdays", () => {
    // Mondays only: June 2026 has 5 Mondays (1, 8, 15, 22, 29)
    const recap = buildMonthRecap(
      [action("a", ["Monday"])],
      [log("a", "2026-06-01")],
      persona,
      "2026-06",
      TODAY,
    );
    expect(recap.scheduled).toBe(5);
    expect(recap.votesCast).toBe(1);
  });

  it("reports kickstart floor saves and Health auto-votes", () => {
    const kickstart = {
      ...log("a", "2026-06-01"),
      completionSource: "widget" as const,
      completionKind: "kickstart" as const,
    };
    const health = {
      ...log("a", "2026-06-02"),
      completionSource: "health" as const,
      completionKind: "full" as const,
    };
    const recap = buildMonthRecap(
      [action("a")],
      [kickstart, health],
      persona,
      "2026-06",
      TODAY,
    );
    expect(recap.kickstartVotes).toBe(1);
    expect(recap.healthVotes).toBe(1);
  });
});

describe("buildYearRecap", () => {
  it("aggregates monthly stories into The Year You Became", () => {
    const logs = [
      { ...log("a", "2026-05-01"), completionKind: "kickstart" as const },
      { ...log("a", "2026-06-01"), completionSource: "health" as const },
      log("a", "2026-06-04"),
    ];
    const recap = buildYearRecap([action("a")], logs, persona, 2026, TODAY);
    expect(recap.votesCast).toBe(3);
    expect(recap.activeMonths).toBe(2);
    expect(recap.kickstartVotes).toBe(1);
    expect(recap.healthVotes).toBe(1);
    expect(recap.bestMonth?.monthLabel).toBe("June 2026");
    expect(recap.closingLine).toContain("Consistent Runner");
  });

  it("produces a warm empty-year story", () => {
    const recap = buildYearRecap(
      [action("a", ALL_DAYS, "2026-07-01T00:00:00")],
      [],
      persona,
      2026,
      TODAY,
    );
    expect(recap.votesCast).toBe(0);
    expect(recap.closingLine).toContain("still open");
  });
});

describe("schedule history in recaps", () => {
  it("removing a weekday keeps that weekday's past completions in the month", () => {
    // June 2026 Mondays: 1, 8, 15, 22, 29. Tuesdays: 2, 9, 16, 23, 30.
    const before = action("a", ["Monday", "Tuesday"]);
    const dates = [
      "2026-06-01",
      "2026-06-02",
      "2026-06-08",
      "2026-06-09",
      "2026-06-15",
      "2026-06-16",
    ];
    const logs = dates.map((date) => log("a", date));
    const baseline = buildMonthRecap([before], logs, persona, "2026-06", TODAY);
    expect(baseline.votesCast).toBe(6);

    const after = withFrequencyChange(before, ["Monday"], "2026-07-10");
    const recap = buildMonthRecap([after], logs, persona, "2026-06", TODAY);
    expect(recap).toEqual(baseline);
  });

  it("adding a weekday does not add missed days to an earlier month", () => {
    const before = action("a", ["Monday"]);
    const logs = ["2026-06-01", "2026-06-08", "2026-06-15", "2026-06-22"].map(
      (date) => log("a", date),
    );
    const baseline = buildMonthRecap([before], logs, persona, "2026-06", TODAY);
    const after = withFrequencyChange(before, ALL_DAYS, "2026-07-10");
    expect(buildMonthRecap([after], logs, persona, "2026-06", TODAY)).toEqual(
      baseline,
    );
  });
});

describe("free look-back: first-weeks edition", () => {
  const startedOn = (date: string): Persona => ({
    ...persona,
    createdAt: `${date}T09:00:00`,
  });
  const june = [log("a", "2026-06-01"), log("a", "2026-06-04")];
  const storyText = (recap: ReturnType<typeof buildYearRecap>) =>
    Object.values(yearStoryCopy(recap)).join(" ");

  it("counts calendar days from the start day, not elapsed hours", () => {
    expect(daysSincePlanStart("2026-07-15T23:30:00", TODAY)).toBe(1);
    expect(daysSincePlanStart("2026-07-16T00:05:00", TODAY)).toBe(0);
    // Across the March daylight-saving change (a 23-hour day)
    expect(
      daysSincePlanStart(
        "2026-03-01T12:00:00",
        new Date("2026-03-15T01:00:00"),
      ),
    ).toBe(14);
    expect(daysSincePlanStart(null, TODAY)).toBe(0);
    expect(daysSincePlanStart("not a date", TODAY)).toBe(0);
  });

  it("tells 59 days as first weeks, without month ranking", () => {
    // May 18 to July 16 is 59 days
    const recap = buildYearRecap(
      [action("a")],
      june,
      startedOn("2026-05-18"),
      2026,
      TODAY,
    );
    expect(recap.edition).toBe("firstWeeks");
    expect(recap.weeksSinceStart).toBe(8);
    expect(recap.title).toBe("Your first 8 weeks");
    const text = storyText(recap);
    expect(text).not.toMatch(/led the year/i);
    expect(text).not.toMatch(/active month/i);
    expect(text).toContain("2 active days");
    expect(text).toContain("YOUR FIRST 8 WEEKS");
    // The numbers themselves are the same story either way
    expect(recap.votesCast).toBe(2);
  });

  it("tells 60 days as the year story, unchanged", () => {
    const recap = buildYearRecap(
      [action("a")],
      june,
      startedOn("2026-05-17"),
      2026,
      TODAY,
    );
    expect(recap.edition).toBe("year");
    expect(recap.title).toBe("The Year You Became");
    const copy = yearStoryCopy(recap);
    expect(copy.openingEyebrow).toBe("THE YEAR YOU BECAME · 2026");
    expect(copy.rhythmHeadline).toBe("1 active month");
    expect(copy.rhythmDetail).toBe(
      "June 2026 led the year with 2 completed actions.",
    );
    expect(copy.closingNote).toBe(
      "No rankings. No perfect year required. Just proof that you kept coming back.",
    );
  });

  it("never titles a story with fewer than one week", () => {
    expect(yearRecapEdition(0)).toEqual({
      edition: "firstWeeks",
      weeksSinceStart: 1,
    });
    expect(yearRecapEdition(6).weeksSinceStart).toBe(1);
    expect(yearRecapEdition(14).weeksSinceStart).toBe(2);
    expect(yearRecapEdition(59).edition).toBe("firstWeeks");
    expect(yearRecapEdition(60).edition).toBe("year");
  });

  it("handles a plan set up ahead with a future start date", () => {
    const today = new Date("2026-12-05T12:00:00");
    const start = "2027-01-01T00:00:00";
    const recap = buildYearRecap(
      [action("a", ALL_DAYS, start)],
      [],
      { ...persona, createdAt: start },
      2026,
      today,
    );
    expect(recap.edition).toBe("firstWeeks");
    expect(recap.title).toBe("Your first 1 week");
    expect(recap.votesCast).toBe(0);
    expect(recap.scheduled).toBe(0);
    expect(recap.closingLine).toContain("still open");
    expect(storyText(recap)).not.toMatch(/led the year|active month/i);
  });

  it("stays warm with zero completions", () => {
    const recap = buildYearRecap(
      [action("a", ALL_DAYS, "2026-07-01T00:00:00")],
      [],
      startedOn("2026-07-01"),
      2026,
      TODAY,
    );
    expect(recap.edition).toBe("firstWeeks");
    expect(recap.title).toBe("Your first 2 weeks");
    expect(recap.closingLine).toContain("still open");
    expect(yearStoryCopy(recap).rhythmDetail).toBe(
      "Your first action can still write the story.",
    );
    expect(yearStoryCopy(recap).rhythmHeadline).toBe("0 active days");
  });

  it("measures a December plan to the end of its year when read in January", () => {
    const recap = buildYearRecap(
      [action("a", ALL_DAYS, "2026-12-01T00:00:00")],
      [log("a", "2026-12-02")],
      startedOn("2026-12-01"),
      2026,
      new Date("2027-01-20T12:00:00"),
    );
    // December 1 to December 31: 30 days, not the 50 to January 20
    expect(recap.title).toBe("Your first 4 weeks");
  });

  it("closes with the plan name and one number", () => {
    expect(yearClosingLine("Consistent Runner", 143)).toBe(
      "Becoming Consistent Runner. 143 check-ins so far.",
    );
    expect(yearClosingLine("More Active Walker", 1)).toBe(
      "Becoming More Active Walker. 1 check-in so far.",
    );
    const recap = buildYearRecap(
      [action("a")],
      june,
      startedOn("2026-05-01"),
      2026,
      TODAY,
    );
    expect(recap.closingLine).toBe(
      "Becoming Consistent Runner. 2 check-ins so far.",
    );
    expect(recap.closingLine).not.toMatch(/vote/i);
    expect(recap.closingLine.match(/\d+/g)).toHaveLength(1);
  });

  it("keeps the closing number when a weekday is later removed", () => {
    const before = action("a", ["Monday", "Tuesday"]);
    const logs = ["2026-06-01", "2026-06-02", "2026-06-08", "2026-06-09"].map(
      (date) => log("a", date),
    );
    const after = withFrequencyChange(before, ["Monday"], "2026-07-10");
    const recap = buildYearRecap([after], logs, persona, 2026, TODAY);
    // Only the Tuesday after the edit (July 14) leaves the schedule; every
    // earlier Tuesday still counts, with its completions.
    const unedited = buildYearRecap([before], logs, persona, 2026, TODAY);
    expect(recap.votesCast).toBe(4);
    expect(recap.scheduled).toBe(unedited.scheduled - 1);
    expect(recap.closingLine).toBe(
      "Becoming Consistent Runner. 4 check-ins so far.",
    );
  });
});
