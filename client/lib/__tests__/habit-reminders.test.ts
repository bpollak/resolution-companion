import {
  fitToBudget,
  formatReminderTime,
  parseReminderTime,
  planTimedSlots,
  reminderTimeLabel,
  suggestReminderTime,
  withSuggestedReminderTime,
} from "@/lib/habit-reminders";
import type { ElementalAction } from "@/lib/storage";

const action = (
  id: string,
  reminderTime?: string,
  title = id,
): ElementalAction => ({
  id,
  benchmarkId: "b1",
  title,
  frequency: ["Monday"],
  anchorLink: "",
  kickstartVersion: "Two minutes",
  createdAt: "2026-10-01T12:00:00",
  reminderTime,
});

describe("suggestReminderTime", () => {
  it.each([
    ["After my morning coffee", "07:30"],
    ["When I wake up", "07:00"],
    ["After lunch", "12:15"],
    ["In the afternoon", "15:00"],
    ["After work", "17:30"],
    ["After dinner", "18:30"],
    ["Every evening", "20:00"],
    ["Before bed", "21:30"],
  ])("maps %s to %s", (anchor, expected) => {
    expect(suggestReminderTime(anchor)).toBe(expected);
  });

  it("does not guess for ambiguous anchors", () => {
    expect(suggestReminderTime("At my desk")).toBeNull();
    expect(suggestReminderTime("")).toBeNull();
  });

  it("ignores the editor's blank-anchor fallback", () => {
    expect(suggestReminderTime("After I wake up")).toBeNull();
    expect(suggestReminderTime("  after i wake up ")).toBeNull();
  });
});

describe("withSuggestedReminderTime", () => {
  it("fills only a missing time with a non-null suggestion", () => {
    expect(
      withSuggestedReminderTime({ anchorLink: "Before bed" }).reminderTime,
    ).toBe("21:30");
    expect(
      withSuggestedReminderTime({
        anchorLink: "Before bed",
        reminderTime: "22:00",
      }).reminderTime,
    ).toBe("22:00");
    expect(
      withSuggestedReminderTime({ anchorLink: "At my desk" }),
    ).not.toHaveProperty("reminderTime");
  });
});

describe("reminder time format", () => {
  it("parses valid HH:MM only", () => {
    expect(parseReminderTime("07:30")).toEqual({ hour: 7, minute: 30 });
    expect(parseReminderTime("23:59")).toEqual({ hour: 23, minute: 59 });
    for (const bad of ["25:00", "12:60", "7:5", "", "abc", undefined]) {
      expect(parseReminderTime(bad)).toBeNull();
    }
  });

  it("formats and labels", () => {
    expect(formatReminderTime(7, 5)).toBe("07:05");
    expect(reminderTimeLabel("21:30")).toBe("9:30 PM");
    expect(reminderTimeLabel("00:15")).toBe("12:15 AM");
    expect(reminderTimeLabel("12:00")).toBe("12:00 PM");
  });
});

describe("planTimedSlots", () => {
  const monday = new Date(2026, 9, 19);
  const early = new Date(2026, 9, 19, 0, 1);

  it("skips untimed and invalid habits", () => {
    const slots = planTimedSlots(
      monday,
      [action("a"), action("b", "bogus"), action("c", "09:00")],
      early,
    );
    expect(slots).toHaveLength(1);
    expect(slots[0].actions.map((a) => a.id)).toEqual(["c"]);
    expect(slots[0].fireDate).toEqual(new Date(2026, 9, 19, 9, 0));
  });

  it("merges habits within 15 minutes of a group's first time", () => {
    const slots = planTimedSlots(
      monday,
      [
        action("late", "07:16"),
        action("first", "07:00"),
        action("edge", "07:15"),
        action("near", "07:14"),
      ],
      early,
    );
    expect(slots.map((s) => s.actions.map((a) => a.id))).toEqual([
      ["first", "near", "edge"],
      ["late"],
    ]);
    expect(slots[0].fireDate).toEqual(new Date(2026, 9, 19, 7, 0));
  });

  it("drops slots already past", () => {
    const slots = planTimedSlots(
      monday,
      [action("a", "07:00"), action("b", "20:00")],
      new Date(2026, 9, 19, 9, 0),
    );
    expect(slots.map((s) => s.actions[0].id)).toEqual(["b"]);
  });

  it("fires at local wall-clock time across the DST change", () => {
    const sunday = new Date(2026, 10, 1);
    const [slot] = planTimedSlots(
      sunday,
      [action("a", "07:30")],
      new Date(2026, 9, 31),
    );
    expect(slot.fireDate.getHours()).toBe(7);
    expect(slot.fireDate.getMinutes()).toBe(30);
  });
});

describe("fitToBudget", () => {
  it("keeps whole days until the next would exceed the budget", () => {
    const days = [30, 20, 15, 1];
    expect(fitToBudget(days, (d) => d, 60)).toEqual([30, 20]);
    expect(fitToBudget(days, (d) => d, 66)).toEqual([30, 20, 15, 1]);
    expect(fitToBudget([70], (d) => d, 60)).toEqual([]);
  });
});
