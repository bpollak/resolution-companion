/**
 * Schedule history: past days are judged by the schedule that was in force
 * on that day, so editing a habit's days never rewrites what already
 * happened. Runs under TZ=America/Los_Angeles like the rest of the suite.
 */

import {
  isScheduledOn,
  sanitizeFrequencyHistory,
  withFrequencyChange,
} from "@/lib/schedule-history";
import type { ElementalAction } from "@/lib/storage";

const MWF = ["Monday", "Wednesday", "Friday"];
const DAILY = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
];

function makeAction(overrides: Partial<ElementalAction> = {}): ElementalAction {
  return {
    id: "a1",
    benchmarkId: "b1",
    title: "Walk",
    frequency: MWF,
    anchorLink: "after lunch",
    kickstartVersion: "shoes on",
    createdAt: "2026-06-24T09:00:00", // Wednesday
    ...overrides,
  };
}

describe("isScheduledOn", () => {
  it("uses the current frequency when the action has no history", () => {
    const action = makeAction();
    expect(isScheduledOn(action, "2026-07-01", "Wednesday")).toBe(true);
    expect(isScheduledOn(action, "2026-07-02", "Thursday")).toBe(false);
    // 1.6.1 behaviour: membership only, no creation-date cutoff here
    expect(isScheduledOn(action, "2026-01-07", "Wednesday")).toBe(true);
  });

  it("treats a missing or malformed frequency as never scheduled", () => {
    const action = makeAction({
      frequency: undefined as unknown as string[],
    });
    expect(isScheduledOn(action, "2026-07-01", "Wednesday")).toBe(false);
  });

  it("reads the entry in force on the date", () => {
    const action = makeAction({
      frequency: DAILY,
      frequencyHistory: [
        { from: "2026-06-24", frequency: MWF },
        { from: "2026-07-06", frequency: DAILY },
      ],
    });
    expect(isScheduledOn(action, "2026-07-02", "Thursday")).toBe(false);
    expect(isScheduledOn(action, "2026-07-03", "Friday")).toBe(true);
    expect(isScheduledOn(action, "2026-07-05", "Sunday")).toBe(false);
    expect(isScheduledOn(action, "2026-07-06", "Monday")).toBe(true);
    expect(isScheduledOn(action, "2026-07-07", "Tuesday")).toBe(true);
  });

  it("uses the first entry for days before the history begins", () => {
    const action = makeAction({
      frequency: DAILY,
      frequencyHistory: [
        { from: "2026-06-24", frequency: MWF },
        { from: "2026-07-06", frequency: DAILY },
      ],
    });
    expect(isScheduledOn(action, "2026-06-22", "Monday")).toBe(true);
    expect(isScheduledOn(action, "2026-06-23", "Tuesday")).toBe(false);
  });

  it("trusts the current frequency from the latest change onward", () => {
    // A write path that bypassed the history must not strand today's list
    const action = makeAction({
      frequency: ["Tuesday"],
      frequencyHistory: [
        { from: "2026-06-24", frequency: MWF },
        { from: "2026-07-06", frequency: DAILY },
      ],
    });
    expect(isScheduledOn(action, "2026-07-07", "Tuesday")).toBe(true);
    expect(isScheduledOn(action, "2026-07-08", "Wednesday")).toBe(false);
    expect(isScheduledOn(action, "2026-07-01", "Wednesday")).toBe(true);
  });
});

describe("withFrequencyChange", () => {
  it("seeds the old schedule from the start date, then appends today", () => {
    const action = makeAction();
    const next = withFrequencyChange(action, DAILY, "2026-07-06");
    expect(next.frequency).toEqual(DAILY);
    expect(next.frequencyHistory).toEqual([
      { from: "2026-06-24", frequency: MWF },
      { from: "2026-07-06", frequency: DAILY },
    ]);
    // The input is never mutated
    expect(action.frequency).toEqual(MWF);
    expect(action.frequencyHistory).toBeUndefined();
  });

  it("replaces the same day's entry on a second change", () => {
    const once = withFrequencyChange(makeAction(), DAILY, "2026-07-06");
    const twice = withFrequencyChange(once, ["Tuesday"], "2026-07-06");
    expect(twice.frequency).toEqual(["Tuesday"]);
    expect(twice.frequencyHistory).toEqual([
      { from: "2026-06-24", frequency: MWF },
      { from: "2026-07-06", frequency: ["Tuesday"] },
    ]);
  });

  it("appends in ascending order across days", () => {
    const first = withFrequencyChange(makeAction(), DAILY, "2026-07-06");
    const second = withFrequencyChange(first, ["Tuesday"], "2026-07-09");
    expect(second.frequencyHistory?.map((entry) => entry.from)).toEqual([
      "2026-06-24",
      "2026-07-06",
      "2026-07-09",
    ]);
  });

  it("keeps no past entry for a habit changed on the day it starts", () => {
    const action = makeAction({ createdAt: "2026-07-06T08:00:00" });
    const next = withFrequencyChange(action, DAILY, "2026-07-06");
    expect(next.frequencyHistory).toEqual([
      { from: "2026-07-06", frequency: DAILY },
    ]);
  });

  it("keeps no past entry for a plan that has not started yet", () => {
    const action = makeAction({ createdAt: "2027-01-01T08:00:00" });
    const next = withFrequencyChange(action, DAILY, "2026-12-20");
    expect(next.frequencyHistory).toEqual([
      { from: "2026-12-20", frequency: DAILY },
    ]);
  });

  it("returns the same action when the days did not change", () => {
    const action = makeAction();
    expect(
      withFrequencyChange(
        action,
        ["Friday", "Monday", "Wednesday"],
        "2026-07-06",
      ),
    ).toBe(action);
  });

  it("copies the day lists so later edits cannot reach into history", () => {
    const days = [...DAILY];
    const next = withFrequencyChange(makeAction(), days, "2026-07-06");
    days.pop();
    expect(next.frequency).toHaveLength(7);
    expect(next.frequencyHistory?.[1].frequency).toHaveLength(7);
  });
});

describe("sanitizeFrequencyHistory", () => {
  it("returns undefined for anything that is not a usable history", () => {
    expect(sanitizeFrequencyHistory(undefined)).toBeUndefined();
    expect(sanitizeFrequencyHistory("nope")).toBeUndefined();
    expect(sanitizeFrequencyHistory([])).toBeUndefined();
    expect(
      sanitizeFrequencyHistory([{ from: "July", frequency: MWF }]),
    ).toBeUndefined();
  });

  it("drops malformed entries, unknown weekdays, and sorts by date", () => {
    expect(
      sanitizeFrequencyHistory([
        { from: "2026-07-06", frequency: ["Monday", "Funday"] },
        null,
        { from: "2026-06-24", frequency: MWF },
        { from: "2026-07-01", frequency: "Monday" },
      ]),
    ).toEqual([
      { from: "2026-06-24", frequency: MWF },
      { from: "2026-07-06", frequency: ["Monday"] },
    ]);
  });
});
