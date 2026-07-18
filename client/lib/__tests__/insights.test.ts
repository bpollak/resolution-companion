/**
 * Unit tests for the pure insights math in client/lib/insights.ts.
 * Tests run under TZ=America/Los_Angeles like the rest of the suite.
 */

import {
  computeWeekdayProfile,
  computeWeeklyTrend,
  computeCoachObservation,
  buildInsightsNarrative,
} from "@/lib/insights";
import type { ElementalAction, DailyLog } from "@/lib/storage";

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

// A Thursday
const TODAY = new Date("2026-07-16T12:00:00");

describe("computeWeekdayProfile", () => {
  it("orders Monday-first and counts completions per weekday", () => {
    const logs = [
      log("a", "2026-07-13"), // Monday
      log("a", "2026-07-06"), // Monday
      log("a", "2026-07-14"), // Tuesday
    ];
    const result = computeWeekdayProfile([action("a")], logs, 8, TODAY);
    expect(result.profile[0]).toEqual({ day: "Monday", completions: 2 });
    expect(result.profile[1]).toEqual({ day: "Tuesday", completions: 1 });
    expect(result.bestDay).toBe("Monday");
    expect(result.maxCompletions).toBe(2);
  });

  it("ignores completions outside the window", () => {
    const logs = [log("a", "2026-01-05")]; // far outside 8 weeks
    const result = computeWeekdayProfile([action("a")], logs, 8, TODAY);
    expect(result.bestDay).toBeNull();
    expect(result.maxCompletions).toBe(0);
  });
});

describe("computeWeeklyTrend", () => {
  it("returns oldest-to-newest points ending with the current week", () => {
    const trend = computeWeeklyTrend([action("a")], [], 4, TODAY);
    expect(trend).toHaveLength(4);
    // Current week starts Monday 2026-07-13
    expect(trend[3].weekKey).toBe("2026-07-13");
    expect(trend[0].weekKey).toBe("2026-06-22");
  });

  it("scores a fully-complete prior week at 100", () => {
    // Week of 2026-07-06 through 2026-07-12, all complete
    const logs = Array.from({ length: 7 }, (_, i) =>
      log("a", `2026-07-${String(6 + i).padStart(2, "0")}`),
    );
    const trend = computeWeeklyTrend([action("a")], logs, 2, TODAY);
    expect(trend[0].weekKey).toBe("2026-07-06");
    expect(trend[0].score).toBe(100);
  });
});

describe("buildInsightsNarrative", () => {
  it("invites the first vote when there is no data yet", () => {
    const profile = computeWeekdayProfile([action("a")], [], 8, TODAY);
    const trend = computeWeeklyTrend([action("a")], [], 8, TODAY);
    const narrative = buildInsightsNarrative(profile, trend, "Writer");
    expect(narrative.recommendation).toContain("2-minute");
  });

  it("names the best day and keeps the tone identity-framed", () => {
    const logs = [
      log("a", "2026-07-13"),
      log("a", "2026-07-06"),
      log("a", "2026-06-29"),
    ];
    const profile = computeWeekdayProfile([action("a")], logs, 8, TODAY);
    const trend = computeWeeklyTrend([action("a")], logs, 8, TODAY);
    const narrative = buildInsightsNarrative(profile, trend, "Writer");
    expect(narrative.headline).toContain("Monday");
    expect(narrative.headline).toContain("Writer");
    expect(narrative.recommendation).toContain("Monday");
  });
});

describe("computeCoachObservation", () => {
  it("stays silent when no pattern has emerged", () => {
    expect(
      computeCoachObservation([action("a")], [], "Writer", TODAY),
    ).toBeNull();
  });

  it("notices a weekday held for 3+ consecutive weeks", () => {
    // Mondays-only action, completed on the 3 Mondays before this week
    const logs = [
      log("a", "2026-07-13"),
      log("a", "2026-07-06"),
      log("a", "2026-06-29"),
    ];
    const observation = computeCoachObservation(
      [action("a", ["Monday"])],
      logs,
      "Writer",
      TODAY,
    );
    expect(observation).not.toBeNull();
    expect(observation!.text).toContain("Monday");
    expect(observation!.text).toContain("Writer");
    expect(observation!.id).toContain("weekday-Monday");
  });

  it("notices three consecutive rising weeks", () => {
    // Daily action: rising completion across the 3 weeks before this one
    const dates: string[] = [];
    // Week of 06-22: 2 days · week of 06-29: 4 days · week of 07-06: 6 days
    dates.push("2026-06-22", "2026-06-23");
    dates.push("2026-06-29", "2026-06-30", "2026-07-01", "2026-07-02");
    dates.push(
      "2026-07-06",
      "2026-07-07",
      "2026-07-08",
      "2026-07-09",
      "2026-07-10",
      "2026-07-11",
    );
    const logs = dates.map((d) => log("a", d));
    const observation = computeCoachObservation(
      [action("a")],
      logs,
      "Writer",
      TODAY,
    );
    expect(observation).not.toBeNull();
    expect(observation!.id).toContain("rising");
  });

  it("keeps a stable id within the same week for dismissal dedupe", () => {
    const logs = [
      log("a", "2026-07-13"),
      log("a", "2026-07-06"),
      log("a", "2026-06-29"),
    ];
    const first = computeCoachObservation(
      [action("a", ["Monday"])],
      logs,
      "Writer",
      TODAY,
    );
    const second = computeCoachObservation(
      [action("a", ["Monday"])],
      logs,
      "Writer",
      new Date("2026-07-17T09:00:00"),
    );
    expect(first!.id).toBe(second!.id);
  });
});
