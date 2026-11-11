import {
  countFullyCompletedDays,
  isDayFullyComplete,
  shouldAskForReview,
  REVIEW_ASK_AFTER_DAYS,
} from "@/lib/review-ask";
import type { DailyLog, ElementalAction } from "@/lib/storage";

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
function makeAction(
  frequency: string[] = DAILY,
  createdAt = "2026-01-01T12:00:00",
): ElementalAction {
  return {
    id: `action-${++seq}`,
    benchmarkId: "benchmark-x",
    title: "Test action",
    frequency,
    anchorLink: "after breakfast",
    kickstartVersion: "2-minute version",
    createdAt,
  };
}

function makeLog(actionId: string, date: string, status = true): DailyLog {
  return {
    id: `log-${++seq}`,
    actionId,
    logDate: date,
    status,
    createdAt: `${date}T12:00:00`,
  };
}

// 2026-11-09 is a Monday, 2026-11-10 a Tuesday.
const MON = "2026-11-09";
const TUE = "2026-11-10";

describe("isDayFullyComplete / countFullyCompletedDays", () => {
  it("counts a day only when every scheduled habit is complete", () => {
    const a = makeAction(["Monday"]);
    const b = makeAction(["Monday"]);
    const logs = [makeLog(a.id, MON)];
    expect(isDayFullyComplete({ actions: [a, b], logs, day: MON })).toBe(false);
    logs.push(makeLog(b.id, MON));
    expect(isDayFullyComplete({ actions: [a, b], logs, day: MON })).toBe(true);
  });

  it("a day with nothing scheduled is not complete", () => {
    const a = makeAction(["Monday", "Wednesday", "Friday"]);
    expect(
      isDayFullyComplete({
        actions: [a],
        logs: [makeLog(a.id, TUE)],
        day: TUE,
      }),
    ).toBe(false);
  });

  it("does not count a log with status false", () => {
    const a = makeAction();
    expect(
      isDayFullyComplete({
        actions: [a],
        logs: [makeLog(a.id, MON, false)],
        day: MON,
      }),
    ).toBe(false);
  });

  it("counts completions regardless of how they were logged", () => {
    const a = makeAction();
    const logs = [
      { ...makeLog(a.id, "2026-11-06"), completionSource: "widget" as const },
      {
        ...makeLog(a.id, "2026-11-07"),
        completionSource: "notification" as const,
      },
      { ...makeLog(a.id, "2026-11-08"), completionSource: "health" as const },
    ];
    expect(countFullyCompletedDays({ actions: [a], logs, today: TUE })).toBe(3);
  });

  it("ignores days after today", () => {
    const a = makeAction();
    const logs = [makeLog(a.id, "2026-11-11")];
    expect(countFullyCompletedDays({ actions: [a], logs, today: TUE })).toBe(0);
  });

  it("includes today and handles ISO logDate strings", () => {
    const a = makeAction();
    const logs = [makeLog(a.id, `${TUE}T09:00:00`), makeLog(a.id, MON)];
    expect(countFullyCompletedDays({ actions: [a], logs, today: TUE })).toBe(2);
  });
});

describe("shouldAskForReview", () => {
  const base = {
    completedDays: REVIEW_ASK_AFTER_DAYS,
    todayComplete: true,
    alreadyRequested: false,
    blocked: false,
  };

  it("asks at the second completed day", () => {
    expect(shouldAskForReview({ ...base, completedDays: 1 })).toBe(false);
    expect(shouldAskForReview({ ...base, completedDays: 2 })).toBe(true);
  });

  it("never asks twice", () => {
    for (const completedDays of [2, 5, 50]) {
      expect(
        shouldAskForReview({ ...base, completedDays, alreadyRequested: true }),
      ).toBe(false);
    }
  });

  it("does not ask when today is not complete", () => {
    expect(
      shouldAskForReview({ ...base, completedDays: 5, todayComplete: false }),
    ).toBe(false);
  });

  it("does not ask when blocked", () => {
    expect(shouldAskForReview({ ...base, blocked: true })).toBe(false);
  });

  it("does not ask in a session that saw onboarding or the paywall", () => {
    jest.isolateModules(() => {
      const m: typeof import("@/lib/review-ask") =
        jest.requireActual("@/lib/review-ask");
      expect(m.shouldAskForReview(base)).toBe(true);
      m.markSession("onboarding");
      expect(m.shouldAskForReview(base)).toBe(false);
    });
    jest.isolateModules(() => {
      const m: typeof import("@/lib/review-ask") =
        jest.requireActual("@/lib/review-ask");
      m.markSession("paywall");
      expect(m.shouldAskForReview(base)).toBe(false);
    });
    // the top-level import is untouched by the isolated modules
    expect(shouldAskForReview(base)).toBe(true);
  });
});
