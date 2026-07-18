import { STARTER_BENCHMARKS } from "@/lib/starter-plan";
import { WEEKDAY_ORDER } from "@/lib/progress";

describe("STARTER_BENCHMARKS", () => {
  // The activation guarantee: a fresh install on ANY day (Sunday included)
  // must land on a Today with at least one loggable action.
  it("schedules at least one action on every weekday", () => {
    for (const day of WEEKDAY_ORDER) {
      const covered = STARTER_BENCHMARKS.some((b) =>
        b.elementalAction.frequency.includes(day),
      );
      // object form so a failure names the uncovered day
      expect({ day, covered }).toEqual({ day, covered: true });
    }
  });

  it("provides at least the minimum number of starter actions", () => {
    expect(STARTER_BENCHMARKS.length).toBeGreaterThanOrEqual(3);
  });

  it("every action has a kickstart floor, an anchor, and a schedule", () => {
    for (const b of STARTER_BENCHMARKS) {
      expect(b.elementalAction.kickstartVersion.length).toBeGreaterThan(0);
      expect(b.elementalAction.anchorLink.length).toBeGreaterThan(0);
      expect(b.elementalAction.frequency.length).toBeGreaterThan(0);
    }
  });
});
