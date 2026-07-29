import {
  buildEvidenceTimeline,
  buildStoryArchiveMonths,
  computeContextPatterns,
  inferBenchmarkCompletedAt,
} from "@/lib/evidence";
import type {
  Benchmark,
  DailyLog,
  ElementalAction,
  Persona,
} from "@/lib/storage";
import type { DailyContextEntry } from "@/lib/daily-context";

const persona: Persona = {
  id: "p1",
  name: "Writer",
  description: "",
  createdAt: "2026-05-15T12:00:00.000Z",
};
const benchmark: Benchmark = {
  id: "b1",
  personaId: "p1",
  title: "Write consistently",
  targetDate: null,
  status: "active",
  createdAt: "2026-07-01T12:00:00.000Z",
};
const action: ElementalAction = {
  id: "a1",
  benchmarkId: "b1",
  title: "Write one paragraph",
  frequency: [
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
    "Saturday",
    "Sunday",
  ],
  anchorLink: "After coffee",
  kickstartVersion: "Open the document",
  createdAt: "2026-07-01T12:00:00.000Z",
};

function log(day: number, status = true, note?: string): DailyLog {
  const date = `2026-07-${String(day).padStart(2, "0")}`;
  return {
    id: `l${day}`,
    actionId: action.id,
    logDate: date,
    status,
    note,
    createdAt: `${date}T18:00:00.000Z`,
  };
}

function context(
  day: number,
  helped: DailyContextEntry["helped"] = [],
  hindered: DailyContextEntry["hindered"] = [],
): DailyContextEntry {
  const date = `2026-07-${String(day).padStart(2, "0")}`;
  return {
    id: `c${day}`,
    personaId: persona.id,
    logDate: date,
    helped,
    hindered,
    createdAt: `${date}T19:00:00.000Z`,
    updatedAt: `${date}T19:00:00.000Z`,
  };
}

describe("story archive", () => {
  it("generates newest-first months from persona creation", () => {
    expect(
      buildStoryArchiveMonths(
        persona.createdAt,
        new Date("2026-07-28T12:00:00"),
      ),
    ).toEqual([
      {
        monthKey: "2026-07",
        monthLabel: "July 2026",
        isCurrent: true,
      },
      {
        monthKey: "2026-06",
        monthLabel: "June 2026",
        isCurrent: false,
      },
      {
        monthKey: "2026-05",
        monthLabel: "May 2026",
        isCurrent: false,
      },
    ]);
  });
});

describe("milestone completion inference", () => {
  it("uses the 21st fully completed scheduled day", () => {
    const completedAt = inferBenchmarkCompletedAt(
      { ...benchmark, status: "completed" },
      [action],
      Array.from({ length: 21 }, (_, index) => log(index + 1)),
      21,
      new Date("2026-07-28T12:00:00"),
    );
    expect(completedAt).not.toBeNull();
    expect(new Date(completedAt!).toLocaleDateString("en-CA")).toBe(
      "2026-07-21",
    );
  });
});

describe("context-backed patterns", () => {
  it("requires 14 tagged scheduled days and compares at least four per group", () => {
    const contexts = Array.from({ length: 14 }, (_, index) =>
      context(index + 1, index < 7 ? ["energy"] : []),
    );
    const logs = Array.from({ length: 7 }, (_, index) => log(index + 1));
    const result = computeContextPatterns([action], logs, contexts);
    expect(result.taggedScheduledDays).toBe(14);
    expect(result.patterns[0]).toMatchObject({
      factor: "energy",
      side: "helped",
      factorDays: 7,
      comparisonDays: 7,
      factorRate: 100,
      comparisonRate: 0,
    });
    expect(result.patterns[0].detail).toContain("association, not a cause");
    expect(
      computeContextPatterns([action], logs, contexts.slice(0, 13)).patterns,
    ).toEqual([]);
  });
});

describe("evidence timeline", () => {
  it("includes meaningful evidence but not routine completions", () => {
    const items = buildEvidenceTimeline({
      persona,
      benchmarks: [
        {
          ...benchmark,
          status: "completed",
          completedAt: "2026-07-21T19:00:00.000Z",
        },
      ],
      actions: [action],
      logs: [log(1), log(2, true, "Found a better opening.")],
      contexts: [{ ...context(2, ["support"]), note: "A quiet room helped." }],
      planAdjustments: [],
      today: new Date("2026-07-28T12:00:00"),
    });
    expect(items.some((item) => item.type === "milestone")).toBe(true);
    expect(items.some((item) => item.type === "daily-context")).toBe(true);
    expect(items.some((item) => item.type === "action-note")).toBe(true);
    expect(items.filter((item) => item.type === "action-note")).toHaveLength(1);
    expect(items.some((item) => item.type === "monthly-story")).toBe(true);
  });
});
