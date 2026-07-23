import {
  ANDROID_MIN_SYSTEM_NAVIGATION_INSET,
  ANDROID_TAB_BAR_CONTENT_HEIGHT,
  getAndroidTabBarBottomClearance,
  getMainTabBarHeight,
  IOS_TAB_BAR_HEIGHT,
} from "../../navigation/tab-bar-layout";

describe("main tab bar safe-area layout", () => {
  test("reserves three-button navigation space when Android reports no inset", () => {
    expect(getMainTabBarHeight("android", 0)).toBe(
      ANDROID_TAB_BAR_CONTENT_HEIGHT + ANDROID_MIN_SYSTEM_NAVIGATION_INSET,
    );
  });

  test("keeps the Android minimum when the reported inset is too small", () => {
    expect(getAndroidTabBarBottomClearance(24)).toBe(
      ANDROID_MIN_SYSTEM_NAVIGATION_INSET,
    );
  });

  test("uses a larger reported Android system navigation inset", () => {
    expect(getMainTabBarHeight("android", 60)).toBe(
      ANDROID_TAB_BAR_CONTENT_HEIGHT + 60,
    );
  });

  test("does not change the established iOS tab bar layout", () => {
    expect(getMainTabBarHeight("ios", 34)).toBe(IOS_TAB_BAR_HEIGHT);
  });

  test("uses the Android fallback for an invalid inset", () => {
    expect(getMainTabBarHeight("android", -1)).toBe(
      ANDROID_TAB_BAR_CONTENT_HEIGHT + ANDROID_MIN_SYSTEM_NAVIGATION_INSET,
    );
  });
});
