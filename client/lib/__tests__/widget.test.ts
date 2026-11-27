/**
 * Unit tests for the pure widget-snapshot builder in client/lib/widget.ts.
 * The native AppGroupStorage lookup touches native modules at load time, so
 * it is mocked out; only buildWidgetData (pure) is exercised here.
 */

import { buildWidgetData } from "@/lib/widget";
import type { ElementalAction, DailyLog, Persona } from "@/lib/storage";

jest.mock("expo-modules-core", () => ({
  requireOptionalNativeModule: () => null,
}));

jest.mock("react-native", () => ({ Platform: { OS: "ios" } }));

// Thursday in Pacific time (tests run under TZ=America/Los_Angeles)
const THURSDAY = new Date("2026-07-16T12:00:00");

const persona: Persona = {
  id: "p1",
  name: "Consistent Runner",
  description: "",
  createdAt: "2026-06-01T00:00:00.000Z",
};

function action(
  id: string,
  frequency: string[],
  overrides: Partial<ElementalAction> = {},
): ElementalAction {
  return {
    id,
    benchmarkId: "b1",
    title: `Action ${id}`,
    frequency,
    anchorLink: "",
    kickstartVersion: "2-minute version",
    createdAt: "2026-06-01T00:00:00.000Z",
    ...overrides,
  };
}

function log(actionId: string, logDate: string, status = true): DailyLog {
  return {
    id: `log-${actionId}-${logDate}`,
    actionId,
    logDate,
    status,
    createdAt: `${logDate}T10:00:00.000Z`,
  };
}

describe("buildWidgetData", () => {
  it("counts only actions scheduled for the given weekday", () => {
    const data = buildWidgetData(
      [action("a", ["Thursday"]), action("b", ["Friday"])],
      [],
      persona,
      THURSDAY,
    );
    expect(data.scheduled).toBe(1);
    expect(data.completed).toBe(0);
    expect(data.nextActionId).toBe("a");
    expect(data.isRestDay).toBe(false);
  });

  it("excludes actions created after the target day", () => {
    const data = buildWidgetData(
      [
        action("a", ["Thursday"], { createdAt: "2026-07-17T00:00:00" }),
        action("b", ["Thursday"]),
      ],
      [],
      persona,
      THURSDAY,
    );
    expect(data.scheduled).toBe(1);
    expect(data.nextActionId).toBe("b");
  });

  it("marks completion and surfaces the next incomplete action", () => {
    const data = buildWidgetData(
      [action("a", ["Thursday"]), action("b", ["Thursday"])],
      [log("a", "2026-07-16")],
      persona,
      THURSDAY,
    );
    expect(data.completed).toBe(1);
    expect(data.nextActionId).toBe("b");
    expect(data.nextActionKickstart).toBe("2-minute version");
  });

  it("reports a fully-complete day with no next action", () => {
    const data = buildWidgetData(
      [action("a", ["Thursday"])],
      [log("a", "2026-07-16")],
      persona,
      THURSDAY,
      { streak: 3, shieldUsed: false },
    );
    expect(data.completed).toBe(1);
    expect(data.nextActionId).toBeNull();
    expect(data.progressLine).toBe("1/1 done · 3-day streak");
  });

  it("treats an unscheduled day as rest, with only the streak in the line", () => {
    const data = buildWidgetData(
      [action("a", ["Monday"])],
      [],
      persona,
      THURSDAY,
      { streak: 12, shieldUsed: false },
    );
    expect(data.isRestDay).toBe(true);
    expect(data.hasPlan).toBe(true);
    expect(data.progressLine).toBe("12-day streak");
  });

  it("writes an explicit no-plan state instead of a fake rest day", () => {
    const data = buildWidgetData(
      [action("a", ["Thursday"])],
      [],
      null,
      THURSDAY,
    );
    expect(data.hasPlan).toBe(false);
    expect(data.isRestDay).toBe(false);
    expect(data.scheduled).toBe(0);
    expect(data.nextActionId).toBeNull();
    expect(data.remainingActions).toEqual([]);
    expect(data.dayPlans).toEqual([]);
    expect(data.progressLine).toBe("");
  });

  it("uses the app's streak and shield state instead of recounting", () => {
    // No logs at all: a recount would say 0, so 12 can only come from input.
    const data = buildWidgetData(
      [action("a", ["Thursday"])],
      [],
      persona,
      THURSDAY,
      { streak: 12, shieldUsed: true },
    );
    expect(data.streak).toBe(12);
    expect(data.shieldUsed).toBe(true);
    expect(data.progressLine).toBe("0/1 done · 12-day streak (protected)");
  });

  it("names the plan day while there is no streak, like Today", () => {
    const data = buildWidgetData(
      [action("a", ["Thursday"])],
      [],
      { ...persona, createdAt: "2026-07-14T09:00:00" },
      THURSDAY,
      { streak: 0, shieldUsed: false },
    );
    expect(data.planDay).toBe(3);
    expect(data.progressLine).toBe("0/1 done · Day 3");
  });

  it("accepts an explicit plan day", () => {
    const data = buildWidgetData(
      [action("a", ["Thursday"])],
      [],
      persona,
      THURSDAY,
      { streak: 0, shieldUsed: false, planDay: 1 },
    );
    expect(data.progressLine).toBe("0/1 done · Day 1");
  });

  it("falls back to a computed streak when no progress is passed", () => {
    const data = buildWidgetData(
      [action("a", ["Thursday"])],
      [],
      persona,
      THURSDAY,
    );
    expect(data.streak).toBe(0);
    expect(data.shieldUsed).toBe(false);
    expect(data.hasPlan).toBe(true);
    expect(data.personaName).toBe("Consistent Runner");
  });

  it("never writes the retired rotating copy line", () => {
    const data = buildWidgetData(
      [action("a", ["Thursday"])],
      [],
      persona,
      THURSDAY,
    );
    expect(data).not.toHaveProperty("copyLine");
  });

  it("includes the coming week so midnight rollover does not reuse yesterday's schedule", () => {
    const data = buildWidgetData(
      [action("thu", ["Thursday"]), action("fri", ["Friday"])],
      [],
      persona,
      THURSDAY,
    );
    expect(data.dayPlans).toHaveLength(7);
    expect(data.dayPlans[0]).toMatchObject({
      date: "2026-07-16",
      actions: [{ id: "thu" }],
    });
    expect(data.dayPlans[1]).toMatchObject({
      date: "2026-07-17",
      actions: [{ id: "fri" }],
    });
  });

  it("keeps every remaining action so the widget can advance after a tap", () => {
    const data = buildWidgetData(
      [action("a", ["Thursday"]), action("b", ["Thursday"])],
      [log("a", "2026-07-16")],
      persona,
      THURSDAY,
    );
    expect(data.remainingActions.map((item) => item.id)).toEqual(["b"]);
  });

  it("writes the plan start so the widget can count days from it", () => {
    const data = buildWidgetData(
      [action("a", ["Thursday"])],
      [],
      { ...persona, createdAt: "2026-07-14T09:00:00" },
      THURSDAY,
    );
    expect(data.planStart).toBe("2026-07-14");
  });

  it("dates a plan set up ahead of time to its future start", () => {
    // Saved Dec 28 for a Jan 1 start: approvePlan dates persona and actions
    // to local midnight of the start day.
    const start = new Date(2027, 0, 1).toISOString();
    const data = buildWidgetData(
      [action("a", ["Friday", "Monday", "Tuesday"], { createdAt: start })],
      [],
      { ...persona, createdAt: start },
      new Date("2026-12-28T20:00:00"),
      { streak: 0, shieldUsed: false },
    );
    expect(data.planStart).toBe("2027-01-01");
    expect(data.date).toBe("2026-12-28");
    expect(data.planDay).toBe(1);
    expect(data.scheduled).toBe(0);
    expect(data.isRestDay).toBe(true);
    // Jan 1 (a Friday) is inside the seven-day plan, so the widget can flip
    // to the first habit at midnight without the app.
    expect(
      data.dayPlans.find((day) => day.date === "2027-01-01")?.actions,
    ).toMatchObject([{ id: "a" }]);
    expect(
      data.dayPlans.find((day) => day.date === "2026-12-29")?.actions,
    ).toEqual([]);
  });

  it("covers the first seven days of a plan that starts more than a week out", () => {
    // Saved Dec 10 for a Jan 1 start. Seven days from today ends Dec 16, so
    // the widget had no plan for January 1 and asked to be opened.
    const start = new Date(2027, 0, 1).toISOString();
    const data = buildWidgetData(
      [
        action("fri", ["Friday"], { createdAt: start }),
        action("thu", ["Thursday"], { createdAt: start }),
      ],
      [],
      { ...persona, createdAt: start },
      new Date("2026-12-10T20:00:00"),
      { streak: 0, shieldUsed: false },
    );
    const dates = data.dayPlans.map((day) => day.date);
    expect(dates[0]).toBe("2026-12-10");
    expect(dates[dates.length - 1]).toBe("2027-01-07");
    // Contiguous, so the widget can tell a rest day from an unknown day
    expect(dates).toHaveLength(29);
    expect(new Set(dates).size).toBe(29);
    expect(
      data.dayPlans.find((day) => day.date === "2027-01-01")?.actions,
    ).toMatchObject([{ id: "fri" }]);
    expect(
      data.dayPlans.find((day) => day.date === "2027-01-07")?.actions,
    ).toMatchObject([{ id: "thu" }]);
    // Nothing is scheduled before the plan starts
    expect(
      data.dayPlans
        .filter((day) => day.date < "2027-01-01")
        .every((day) => day.actions.length === 0),
    ).toBe(true);
  });

  it("keeps seven days for a plan that has already started", () => {
    const data = buildWidgetData(
      [action("thu", ["Thursday"])],
      [],
      { ...persona, createdAt: "2026-07-14T09:00:00" },
      THURSDAY,
    );
    expect(data.dayPlans).toHaveLength(7);
  });

  it("does not write an unbounded plan for a far-off or bad start date", () => {
    const start = new Date(2030, 0, 1).toISOString();
    const data = buildWidgetData(
      [action("a", ["Friday"], { createdAt: start })],
      [],
      { ...persona, createdAt: start },
      THURSDAY,
    );
    expect(data.dayPlans).toHaveLength(7);
  });

  it("omits the plan start when the persona date cannot be parsed", () => {
    const data = buildWidgetData(
      [action("a", ["Thursday"])],
      [],
      { ...persona, createdAt: "not a date" },
      THURSDAY,
    );
    expect(data).not.toHaveProperty("planStart");
    expect(data.planDay).toBe(1);
  });

  it("leaves the plan start out of the no-plan state", () => {
    const data = buildWidgetData([], [], null, THURSDAY);
    expect(data).not.toHaveProperty("planStart");
  });
});
