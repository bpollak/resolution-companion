import { getTodayTabBadge, isSelectedTab } from "../tab-badge";

describe("Today tab badge", () => {
  test("invites with the remaining count from another tab", () => {
    expect(
      getTodayTabBadge({
        isTodayFocused: false,
        hasLoggedToday: false,
        remainingTasksCount: 2,
      }),
    ).toBe(2);
  });

  test("hides while Today is focused", () => {
    expect(
      getTodayTabBadge({
        isTodayFocused: true,
        hasLoggedToday: false,
        remainingTasksCount: 2,
      }),
    ).toBeUndefined();
  });

  test("hides after the first log of the day", () => {
    expect(
      getTodayTabBadge({
        isTodayFocused: false,
        hasLoggedToday: true,
        remainingTasksCount: 1,
      }),
    ).toBeUndefined();
  });

  test("hides when nothing is due", () => {
    expect(
      getTodayTabBadge({
        isTodayFocused: false,
        hasLoggedToday: false,
        remainingTasksCount: 0,
      }),
    ).toBeUndefined();
  });
});

describe("selected tab", () => {
  const tabs = {
    index: 0,
    routes: [{ key: "today-1" }, { key: "journey-1" }, { key: "coach-1" }],
  };

  test("reads selection from the tab state alone", () => {
    expect(isSelectedTab(tabs, "today-1")).toBe(true);
    expect(isSelectedTab({ ...tabs, index: 2 }, "today-1")).toBe(false);
  });

  // Regression: a modal over the tabs (Profile) is not leaving Today, so a
  // re-render under it must keep the Today badge hidden.
  test("stays selected regardless of parent modals", () => {
    expect(
      getTodayTabBadge({
        isTodayFocused: isSelectedTab(tabs, "today-1"),
        hasLoggedToday: false,
        remainingTasksCount: 2,
      }),
    ).toBeUndefined();
  });

  test("tolerates an out-of-range index", () => {
    expect(isSelectedTab({ ...tabs, index: 5 }, "today-1")).toBe(false);
  });
});
