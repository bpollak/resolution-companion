/**
 * Unit tests for the pure Month-in-Votes math in client/lib/recap.ts.
 * Tests run under TZ=America/Los_Angeles like the rest of the suite.
 */

import {
  buildMonthRecap,
  buildYearRecap,
  getMonthKey,
  getPreviousMonthKey,
} from "@/lib/recap";
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
