export const IOS_TAB_BAR_HEIGHT = 88;
export const ANDROID_TAB_BAR_CONTENT_HEIGHT = 70;
export const ANDROID_MIN_SYSTEM_NAVIGATION_INSET = 48;
export const ANDROID_MAIN_TAB_HEADER_TOOLBAR_HEIGHT = 56;

export function getAndroidMainTabHeaderHeight(): number {
  // The Android root view already owns the live system-bar inset. The tab
  // navigator only needs to size its toolbar.
  return ANDROID_MAIN_TAB_HEADER_TOOLBAR_HEIGHT;
}

export function getMainTabRootTopOffset(
  platform: string,
  topInset: number,
): number {
  if (platform !== "android" || !Number.isFinite(topInset) || topInset <= 0) {
    return 0;
  }
  return -topInset;
}

export function getMainTabHeaderClearance(
  platform: string,
  headerHeight: number,
): number {
  // The tab header floats over content only on iOS. Android's opaque header
  // already occupies layout space, so adding its height again creates a
  // device-dependent blank band above every tab's content.
  return platform === "ios" ? Math.max(0, headerHeight) : 0;
}

export function getMainTabHeaderTitleAlignment(
  platform: string,
): "center" | "left" {
  return platform === "android" ? "left" : "center";
}

export function getAndroidTabBarBottomClearance(bottomInset: number): number {
  // Some Samsung three-button configurations report a zero safe-area inset
  // while edge-to-edge mode still lets the system controls cover app content.
  return Math.max(
    ANDROID_MIN_SYSTEM_NAVIGATION_INSET,
    Math.max(0, bottomInset),
  );
}

export function getMainTabBarHeight(
  platform: string,
  bottomInset: number,
): number {
  if (platform === "ios") return IOS_TAB_BAR_HEIGHT;

  if (platform === "android") {
    return (
      ANDROID_TAB_BAR_CONTENT_HEIGHT +
      getAndroidTabBarBottomClearance(bottomInset)
    );
  }

  return ANDROID_TAB_BAR_CONTENT_HEIGHT;
}
