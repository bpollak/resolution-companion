import { getTodayTabBadge } from "../tab-badge";

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
