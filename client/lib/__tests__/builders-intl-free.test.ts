/**
 * The progress, recap, and insights builders rerun on every check-off and
 * walk every scheduled day. Intl date formatting there cost thousands of
 * slow calls per tap (and Hermes can return "" for it), so these builders
 * must derive weekdays and month names without toLocaleDateString.
 */

import {
  buildLogIndex,
  buildProgressSnapshot,
  computeMomentumScore,
  weekdayName,
  withLogInIndex,
} from "@/lib/progress";
import { buildMonthRecap, buildYearRecap } from "@/lib/recap";
import {
  buildInsightsNarrative,
  computeCoachObservation,
  computeWeekdayProfile,
  computeWeeklyTrend,
} from "@/lib/insights";
import type {
  Benchmark,
  DailyLog,
  ElementalAction,
  Persona,
} from "@/lib/storage";

const ALL_DAYS = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
];

const persona: Persona = {
  id: "p1",
  name: "Steady Runner",
  description: "",
  createdAt: "2026-01-01T00:00:00",
};

const actions: ElementalAction[] = [
  {
    id: "a1",
    benchmarkId: "b1",
    title: "Run",
    frequency: ALL_DAYS,
    anchorLink: "",
    kickstartVersion: "",
    createdAt: "2026-01-01T00:00:00",
  },
  {
    id: "a2",
    benchmarkId: "b1",
    title: "Stretch",
    frequency: ["Monday", "Wednesday", "Friday"],
    anchorLink: "",
    kickstartVersion: "",
    createdAt: "2026-01-01T00:00:00",
  },
];

const benchmarks = [
  {
    id: "b1",
    personaId: "p1",
    title: "Run 5k",
    status: "active",
    createdAt: "2026-01-01T00:00:00",
  },
] as unknown as Benchmark[];

function buildLogs(): DailyLog[] {
  const logs: DailyLog[] = [];
  const cursor = new Date(2026, 0, 1);
  const end = new Date(2026, 6, 15);
  let i = 0;
  while (cursor <= end) {
    const key = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, "0")}-${String(cursor.getDate()).padStart(2, "0")}`;
    if (i % 5 !== 0) {
      logs.push({
        id: `l-${key}`,
        actionId: "a1",
        logDate: key,
        status: true,
        createdAt: `${key}T08:00:00`,
      });
    }
    cursor.setDate(cursor.getDate() + 1);
    i++;
  }
  return logs;
}

const TODAY = new Date("2026-07-16T12:00:00");

describe("hot-path builders avoid Intl date formatting", () => {
  let spy: jest.SpyInstance;
  beforeEach(() => {
    spy = jest.spyOn(Date.prototype, "toLocaleDateString");
  });
  afterEach(() => {
    spy.mockRestore();
  });

  it("buildProgressSnapshot makes zero toLocaleDateString calls", () => {
    buildProgressSnapshot(actions, buildLogs(), benchmarks, { maxShields: 2 });
    expect(spy).not.toHaveBeenCalled();
  });

  it("buildMonthRecap makes zero toLocaleDateString calls", () => {
    const recap = buildMonthRecap(
      actions,
      buildLogs(),
      persona,
      "2026-06",
      TODAY,
    );
    expect(recap.monthLabel).toBe("June 2026");
    expect(spy).not.toHaveBeenCalled();
  });

  it("buildYearRecap makes zero toLocaleDateString calls", () => {
    const recap = buildYearRecap(actions, buildLogs(), persona, 2026, TODAY);
    expect(recap.bestMonth?.monthLabel).toMatch(/^[A-Z][a-z]+ 2026$/);
    expect(spy).not.toHaveBeenCalled();
  });

  it("insights builders make zero toLocaleDateString calls", () => {
    const logs = buildLogs();
    const profile = computeWeekdayProfile(actions, logs, 8, TODAY);
    const trend = computeWeeklyTrend(actions, logs, 8, TODAY);
    buildInsightsNarrative(profile, trend, persona.name);
    computeCoachObservation(actions, logs, persona.name, TODAY);
    expect(spy).not.toHaveBeenCalled();
  });
});

describe("weekdayName", () => {
  it("matches the en-US Intl weekday for every day of a year", () => {
    const cursor = new Date(2026, 0, 1);
    for (let i = 0; i < 366; i++) {
      expect(weekdayName(cursor)).toBe(
        cursor.toLocaleDateString("en-US", { weekday: "long" }),
      );
      cursor.setDate(cursor.getDate() + 1);
    }
  });
});

describe("precomputed recap inputs", () => {
  it("give the same month and year recaps as building from scratch", () => {
    const logs = buildLogs();
    const snapshot = buildProgressSnapshot(actions, logs, benchmarks, {
      maxShields: 2,
    });
    expect(
      buildMonthRecap(actions, logs, persona, "2026-06", TODAY, 2, {
        logIndex: snapshot.logIndex,
        streak: snapshot.streak,
      }),
    ).toEqual(buildMonthRecap(actions, logs, persona, "2026-06", TODAY, 2));
    expect(
      buildYearRecap(actions, logs, persona, 2026, TODAY, 2, {
        logIndex: snapshot.logIndex,
      }),
    ).toEqual(buildYearRecap(actions, logs, persona, 2026, TODAY, 2));
  });
});

describe("withLogInIndex", () => {
  it("scores a toggled log the same as rebuilding the index", () => {
    const logs = buildLogs();
    const index = buildLogIndex(logs);
    const toggled: DailyLog = {
      id: "l-new",
      actionId: "a2",
      logDate: "2026-07-15",
      status: true,
      createdAt: "2026-07-15T09:00:00",
    };
    const now = new Date("2026-07-15T18:00:00");
    expect(
      computeMomentumScore(
        actions,
        [...logs, toggled],
        15,
        withLogInIndex(index, toggled),
        now,
      ),
    ).toBe(
      computeMomentumScore(actions, [...logs, toggled], 15, undefined, now),
    );
    expect(index.has("a2|2026-07-15")).toBe(false);
  });

  it("keeps the first log for a key unless the toggled log replaces it by id", () => {
    const first: DailyLog = {
      id: "first",
      actionId: "a1",
      logDate: "2026-07-15",
      status: true,
      createdAt: "2026-07-15T08:00:00",
    };
    const index = buildLogIndex([first]);
    const duplicate = { ...first, id: "dup", status: false };
    expect(withLogInIndex(index, duplicate).get("a1|2026-07-15")).toBe(first);
    const replaced = { ...first, status: false };
    expect(withLogInIndex(index, replaced).get("a1|2026-07-15")).toBe(replaced);
  });
});
