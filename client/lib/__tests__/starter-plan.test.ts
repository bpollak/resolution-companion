import { STARTER_BENCHMARKS, ensureDayScheduled } from "@/lib/starter-plan";
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

describe("ensureDayScheduled (install-day activation guarantee)", () => {
  it("adds the day to the first action when nothing covers it", () => {
    const actions = [
      { frequency: ["Monday", "Wednesday", "Friday"] },
      { frequency: ["Tuesday", "Thursday"] },
    ];
    const out = ensureDayScheduled(actions, "Sunday");
    expect(out[0].frequency).toContain("Sunday");
    expect(out[1].frequency).not.toContain("Sunday"); // only the first is touched
  });

  it("is a no-op when the day is already covered", () => {
    const actions = [{ frequency: ["Sunday"] }, { frequency: ["Monday"] }];
    expect(ensureDayScheduled(actions, "Sunday")).toEqual(actions);
  });

  it("keeps the first action's frequency weekday-sorted", () => {
    const out = ensureDayScheduled([{ frequency: ["Wednesday"] }], "Monday");
    expect(out[0].frequency).toEqual(["Monday", "Wednesday"]);
  });

  it("handles an empty plan without throwing", () => {
    expect(ensureDayScheduled([], "Sunday")).toEqual([]);
  });
});
