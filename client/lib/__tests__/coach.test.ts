import {
  buildCoachActionContext,
  buildCoachOpening,
  formatCoachDateRange,
} from "@/lib/coach";
import type { DailyLog, ElementalAction } from "@/lib/storage";

const action: ElementalAction = {
  id: "run",
  benchmarkId: "benchmark",
  title: "Run for 20 minutes",
  frequency: ["Monday", "Wednesday", "Friday"],
  anchorLink: "after morning coffee",
  kickstartVersion: "put on running shoes",
  createdAt: "2026-06-01T12:00:00",
};

describe("Coach opening", () => {
  it("names the exact completed week instead of the current calendar week", () => {
    expect(formatCoachDateRange("2026-07-06", "2026-07-12")).toBe("July 6–12");
    const opening = buildCoachOpening({
      period: "weekly",
      personaName: "5K-Ready Weekend Runner",
      monthlyConsistency: 73,
      weekly: {
        weekStart: "2026-07-06",
        weekEnd: "2026-07-12",
        completed: 3,
        scheduled: 5,
      },
    });
    expect(opening).toContain("July 6–12");
    expect(opening).toContain("3 of 5");
    expect(opening).not.toMatch(/week 29/i);
  });

  it("still invites an untracked win when nothing was logged", () => {
    const opening = buildCoachOpening({
      period: "weekly",
      personaName: "Consistent Runner",
      monthlyConsistency: 20,
      weekly: {
        weekStart: "2026-07-06",
        weekEnd: "2026-07-12",
        completed: 0,
        scheduled: 3,
      },
    });
    expect(opening).toContain("useful information, not a verdict");
    expect(opening).toContain("win from the week");
  });

  it("opens a monthly check-in immediately from grounded consistency", () => {
    expect(
      buildCoachOpening({
        period: "monthly",
        personaName: "Consistent Runner",
        monthlyConsistency: 73,
      }),
    ).toContain("73% consistency");
  });

  it("does not overstate a perfect percentage for a brand-new plan", () => {
    const opening = buildCoachOpening({
      period: "monthly",
      personaName: "Conversational Spanish Speaker",
      monthlyConsistency: 100,
      daysSincePlanStarted: 0,
    });

    expect(opening).toContain("just getting started");
    expect(opening).toContain("too early to judge the numbers");
    expect(opening).not.toContain("100%");
    expect(opening).not.toContain("reliably");
  });

  it("uses an established plan's grounded consistency", () => {
    const opening = buildCoachOpening({
      period: "monthly",
      personaName: "Conversational Spanish Speaker",
      monthlyConsistency: 100,
      daysSincePlanStarted: 8,
    });

    expect(opening).toContain("100% consistency");
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
