import {
  categorizeActionRhythms,
  computeTodaySignal,
} from "@/lib/ambient-coach";
import type { DailyLog, ElementalAction } from "@/lib/storage";
import { getLocalDateString } from "@/lib/progress";

const DAILY = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

function action(
  id: string,
  createdAt = "2026-01-01T12:00:00",
): ElementalAction {
  return {
    id,
    benchmarkId: "benchmark-1",
    title: `Action ${id}`,
    frequency: DAILY,
    anchorLink: "After breakfast",
    kickstartVersion: "Do one minute",
    createdAt,
  };
}

function dateAgo(today: Date, days: number): string {
  const date = new Date(today);
  date.setDate(date.getDate() - days);
  return getLocalDateString(date);
}

describe("ambient coach signals", () => {
  const today = new Date(2026, 7, 4, 12);

  it("uses exact action rhythm thresholds without changing progress", () => {
    const actions = [
      action("strong", "2026-07-25T12:00:00"),
      action("forming", "2026-07-25T12:00:00"),
      action("simplify", "2026-07-25T12:00:00"),
    ];
    const logs: DailyLog[] = [];
    for (let day = 1; day <= 10; day += 1) {
      const date = dateAgo(today, day);
      if (day <= 7)
        logs.push({
          id: `s-${day}`,
          actionId: "strong",
          logDate: date,
          status: true,
          createdAt: date,
        });
      if (day <= 5)
        logs.push({
          id: `f-${day}`,
          actionId: "forming",
          logDate: date,
          status: true,
          createdAt: date,
        });
      if (day <= 3)
        logs.push({
          id: `w-${day}`,
          actionId: "simplify",
          logDate: date,
          status: true,
          createdAt: date,
        });
    }
    const rhythms = categorizeActionRhythms(actions, logs, today);
    expect(rhythms.map(({ category }) => category)).toEqual([
      "working-well",
      "still-forming",
      "worth-simplifying",
    ]);
  });

  it("prioritizes completion, lapse recovery, and the next pending action", () => {
    const first = action("one");
    const complete = computeTodaySignal({
      personaName: "A steady person",
      todayKey: "2026-08-04",
      todayActions: [first],
      completedActionIds: new Set([first.id]),
      missedDays: 3,
    });
    expect(complete.kind).toBe("complete");
    // The completed day is an endpoint, not another decision: no primary CTA
    expect(complete.primaryLabel).toBeUndefined();
    expect(
      computeTodaySignal({
        personaName: "A steady person",
        todayKey: "2026-08-04",
        todayActions: [first],
        completedActionIds: new Set(),
        missedDays: 2,
      }).primaryKind,
    ).toBe("kickstart");
    expect(
      computeTodaySignal({
        personaName: "A steady person",
        todayKey: "2026-08-04",
        todayActions: [first],
        completedActionIds: new Set(),
        missedDays: 0,
      }).kind,
    ).toBe("next-action");
  });
});
