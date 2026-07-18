/**
 * Unit tests for the pure widget-snapshot builder in client/lib/widget.ts.
 * The ExtensionStorage import touches native modules at load time, so it is
 * mocked out; only buildWidgetData (pure) is exercised here.
 */

import { buildWidgetData } from "@/lib/widget";
import type { ElementalAction, DailyLog, Persona } from "@/lib/storage";

jest.mock("@bacons/apple-targets", () => ({
  ExtensionStorage: class {
    static reloadWidget() {}
    set() {}
    get() {
      return null;
    }
    remove() {}
  },
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

  it("celebrates a fully-complete day", () => {
    const data = buildWidgetData(
      [action("a", ["Thursday"])],
      [log("a", "2026-07-16")],
      persona,
      THURSDAY,
    );
    expect(data.copyLine).toBe("Every vote cast today ✓");
    expect(data.nextActionId).toBeNull();
  });

  it("treats an unscheduled day as rest, not failure", () => {
    const data = buildWidgetData(
      [action("a", ["Monday"])],
      [],
      persona,
      THURSDAY,
    );
    expect(data.isRestDay).toBe(true);
    expect(data.copyLine).toBe("Rest is part of becoming.");
  });

  it("falls back to an identity default without a persona", () => {
    const data = buildWidgetData(
      [action("a", ["Thursday"])],
      [],
      null,
      THURSDAY,
    );
    expect(data.personaName).toBe("Future You");
  });
});
