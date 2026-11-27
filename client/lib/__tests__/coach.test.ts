import {
  buildCoachActionContext,
  buildPreviousSessionNotes,
  buildRecentNotes,
  canOfferPlanAdjustment,
  scheduledDaysOfHistory,
} from "@/lib/coach";
import type { DailyLog, ElementalAction, Reflection } from "@/lib/storage";

jest.mock("@react-native-async-storage/async-storage", () =>
  jest.requireActual(
    "@react-native-async-storage/async-storage/jest/async-storage-mock",
  ),
);

const action: ElementalAction = {
  id: "run",
  benchmarkId: "benchmark",
  title: "Run for 20 minutes",
  frequency: ["Monday", "Wednesday", "Friday"],
  anchorLink: "after morning coffee",
  kickstartVersion: "put on running shoes",
  createdAt: "2026-06-01T12:00:00",
};

describe("when Adjust my plan is offered", () => {
  // June 1, 2026 is a Monday; the habit runs Monday, Wednesday, Friday.
  const daily: ElementalAction = {
    ...action,
    id: "daily",
    frequency: [
      "Monday",
      "Tuesday",
      "Wednesday",
      "Thursday",
      "Friday",
      "Saturday",
      "Sunday",
    ],
  };

  it("counts scheduled days from the start through yesterday", () => {
    expect(scheduledDaysOfHistory(action, new Date(2026, 5, 1, 9))).toBe(0);
    expect(scheduledDaysOfHistory(action, new Date(2026, 5, 2, 9))).toBe(1);
    // Jun 1, 3, 5, 8, 10, 12; Monday the 15th is today, not history yet.
    expect(scheduledDaysOfHistory(action, new Date(2026, 5, 15, 9))).toBe(6);
  });

  it("stays hidden under seven scheduled days of history", () => {
    expect(canOfferPlanAdjustment([action], new Date(2026, 5, 15, 9))).toBe(
      false,
    );
    expect(canOfferPlanAdjustment([daily], new Date(2026, 5, 7, 9))).toBe(
      false,
    );
    expect(canOfferPlanAdjustment([], new Date(2026, 5, 30, 9))).toBe(false);
  });

  it("appears once a habit reaches seven scheduled days", () => {
    expect(canOfferPlanAdjustment([action], new Date(2026, 5, 16, 9))).toBe(
      true,
    );
    expect(canOfferPlanAdjustment([daily], new Date(2026, 5, 8, 9))).toBe(true);
  });

  it("needs only one habit with enough history", () => {
    const fresh = { ...action, id: "new", createdAt: "2026-06-14T09:00:00" };
    expect(canOfferPlanAdjustment([fresh], new Date(2026, 5, 16, 9))).toBe(
      false,
    );
    expect(
      canOfferPlanAdjustment([fresh, action], new Date(2026, 5, 16, 9)),
    ).toBe(true);
  });

  it("treats a future start or unreadable date as no history", () => {
    expect(
      canOfferPlanAdjustment(
        [{ ...daily, createdAt: "2027-01-01T00:00:00" }],
        new Date(2026, 11, 20, 9),
      ),
    ).toBe(false);
    expect(
      scheduledDaysOfHistory(
        { ...daily, createdAt: "not a date" },
        new Date(2026, 5, 30, 9),
      ),
    ).toBe(0);
  });
});

describe("Coach action context", () => {
  it("provides real action, fallback, and anchor evidence", () => {
    const logs: DailyLog[] = [
      {
        id: "log-1",
        actionId: action.id,
        logDate: "2026-07-13",
        status: true,
        createdAt: "2026-07-13T12:00:00",
      },
    ];
    const context = buildCoachActionContext(
      [action],
      logs,
      new Date(2026, 6, 19, 12),
    );
    expect(context).toContain("Run for 20 minutes");
    expect(context).toContain("put on running shoes");
    expect(context).toContain("after morning coffee");
  });
});

describe("Coach memory digest", () => {
  const reflection = (overrides: Partial<Reflection>): Reflection => ({
    id: "r1",
    periodType: "contextual",
    userInput: "I keep skipping evening runs",
    aiFeedback: "Try anchoring the run to lunch instead.",
    momentumScore: 62,
    createdAt: "2026-07-20T18:00:00",
    ...overrides,
  });

  it("digests the two most recent sessions, newest first", () => {
    const notes = buildPreviousSessionNotes([
      reflection({ id: "old", createdAt: "2026-07-01T18:00:00" }),
      reflection({
        id: "new",
        createdAt: "2026-07-20T18:00:00",
        conversation: JSON.stringify([
          { role: "user", content: "Mornings feel impossible" },
          { role: "assistant", content: "Start with the two-minute version." },
        ]),
      }),
      reflection({ id: "oldest", createdAt: "2026-06-01T18:00:00" }),
    ]);
    expect(notes).toBeDefined();
    expect(notes).toContain("Mornings feel impossible");
    expect(notes).toContain("two-minute version");
    // Oldest of the three is dropped by the 2-session cap
    expect(notes?.split("\n")).toHaveLength(2);
  });

  it("falls back to split fields for legacy sessions", () => {
    const notes = buildPreviousSessionNotes([reflection({})]);
    expect(notes).toContain("I keep skipping evening runs");
    expect(notes).toContain("anchoring the run to lunch");
  });

  it("returns undefined with no history", () => {
    expect(buildPreviousSessionNotes([])).toBeUndefined();
  });
});

describe("Recent completion notes", () => {
  it("quotes only noted completions from the last 7 days", () => {
    const logs: DailyLog[] = [
      {
        id: "recent",
        actionId: action.id,
        logDate: "2026-07-18",
        status: true,
        note: "Felt strong today",
        createdAt: "2026-07-18T12:00:00",
      },
      {
        id: "stale",
        actionId: action.id,
        logDate: "2026-07-01",
        status: true,
        note: "Too old to quote",
        createdAt: "2026-07-01T12:00:00",
      },
      {
        id: "unnoted",
        actionId: action.id,
        logDate: "2026-07-19",
        status: true,
        createdAt: "2026-07-19T12:00:00",
      },
    ];
    const notes = buildRecentNotes([action], logs, new Date(2026, 6, 19, 12));
    expect(notes).toContain("Felt strong today");
    expect(notes).toContain("Run for 20 minutes");
    expect(notes).not.toContain("Too old to quote");
  });

  it("returns undefined when nothing is quotable", () => {
    expect(
      buildRecentNotes([action], [], new Date(2026, 6, 19, 12)),
    ).toBeUndefined();
  });
});
