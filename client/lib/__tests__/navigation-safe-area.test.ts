import {
  ANDROID_MAIN_TAB_HEADER_TOOLBAR_HEIGHT,
  ANDROID_MAX_MAIN_TAB_STATUS_BAR_HEIGHT,
  ANDROID_MIN_SYSTEM_NAVIGATION_INSET,
  ANDROID_TAB_BAR_CONTENT_HEIGHT,
  getAndroidMainTabHeaderHeight,
  getAndroidMainTabStatusBarHeight,
  getAndroidTabBarBottomClearance,
  getMainTabHeaderClearance,
  getMainTabHeaderTitleAlignment,
  getMainTabBarHeight,
  IOS_TAB_BAR_HEIGHT,
} from "../../navigation/tab-bar-layout";

describe("main tab safe-area layout", () => {
  test("reserves the floating header height on iOS", () => {
    expect(getMainTabHeaderClearance("ios", 88)).toBe(88);
  });

  test("does not double-count the opaque Android header", () => {
    expect(getMainTabHeaderClearance("android", 88)).toBe(0);
  });

  test("guards against an invalid iOS header height", () => {
    expect(getMainTabHeaderClearance("ios", -1)).toBe(0);
  });

  test("uses a normal measured Android status-bar height", () => {
    expect(getAndroidMainTabStatusBarHeight(96, 24)).toBe(24);
    expect(getAndroidMainTabHeaderHeight(96, 24)).toBe(
      ANDROID_MAIN_TAB_HEADER_TOOLBAR_HEIGHT + 24,
    );
  });

  test("caps oversized Android status-bar measurements at 24 dp", () => {
    expect(getAndroidMainTabStatusBarHeight(96, 48)).toBe(
      ANDROID_MAX_MAIN_TAB_STATUS_BAR_HEIGHT,
    );
    expect(getAndroidMainTabHeaderHeight(96, 48)).toBe(
      ANDROID_MAIN_TAB_HEADER_TOOLBAR_HEIGHT +
        ANDROID_MAX_MAIN_TAB_STATUS_BAR_HEIGHT,
    );
  });

  test("applies the same cap when only the safe-area inset is available", () => {
    expect(getAndroidMainTabStatusBarHeight(96)).toBe(
      ANDROID_MAX_MAIN_TAB_STATUS_BAR_HEIGHT,
    );
    expect(getAndroidMainTabHeaderHeight(96)).toBe(
      ANDROID_MAIN_TAB_HEADER_TOOLBAR_HEIGHT +
        ANDROID_MAX_MAIN_TAB_STATUS_BAR_HEIGHT,
    );
  });

  test("guards against invalid Android status-bar measurements", () => {
    expect(getAndroidMainTabStatusBarHeight(-1, -1)).toBe(0);
    expect(getAndroidMainTabStatusBarHeight(Number.NaN, Number.NaN)).toBe(0);
    expect(getAndroidMainTabHeaderHeight(-1, -1)).toBe(
      ANDROID_MAIN_TAB_HEADER_TOOLBAR_HEIGHT,
    );
  });

  test("left-aligns Android tab headers without changing iOS", () => {
    expect(getMainTabHeaderTitleAlignment("android")).toBe("left");
    expect(getMainTabHeaderTitleAlignment("ios")).toBe("center");
  });

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
