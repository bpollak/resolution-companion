import {
  ANDROID_TAB_BAR_CONTENT_HEIGHT,
  getMainTabBarHeight,
  IOS_TAB_BAR_HEIGHT,
} from "../../navigation/tab-bar-layout";

describe("main tab bar safe-area layout", () => {
  test("keeps the existing Android height when there is no system inset", () => {
    expect(getMainTabBarHeight("android", 0)).toBe(
      ANDROID_TAB_BAR_CONTENT_HEIGHT,
    );
  });

  test("adds Android system navigation space below the tab controls", () => {
    expect(getMainTabBarHeight("android", 48)).toBe(
      ANDROID_TAB_BAR_CONTENT_HEIGHT + 48,
    );
  });

  test("does not change the established iOS tab bar layout", () => {
    expect(getMainTabBarHeight("ios", 34)).toBe(IOS_TAB_BAR_HEIGHT);
  });

  test("does not reduce the Android content height for an invalid inset", () => {
    expect(getMainTabBarHeight("android", -1)).toBe(
      ANDROID_TAB_BAR_CONTENT_HEIGHT,
    );
  });
});
