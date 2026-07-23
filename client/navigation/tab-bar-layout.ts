export const IOS_TAB_BAR_HEIGHT = 88;
export const ANDROID_TAB_BAR_CONTENT_HEIGHT = 70;
export const ANDROID_MIN_SYSTEM_NAVIGATION_INSET = 48;
export const ANDROID_MAIN_TAB_HEADER_TOOLBAR_HEIGHT = 56;
export const ANDROID_MAX_MAIN_TAB_STATUS_BAR_HEIGHT = 48;
export const ANDROID_MAX_MAIN_TAB_STATUS_BAR_FALLBACK = 32;

function clampAndroidStatusBarHeight(height: number, maximum: number): number {
  return Number.isFinite(height) ? Math.min(maximum, Math.max(0, height)) : 0;
}

export function getAndroidMainTabStatusBarHeight(
  topInset: number,
  nativeStatusBarHeight?: number,
): number {
  // Samsung edge-to-edge layouts can report a safe-area inset much taller
  // than the visible status bar. Prefer Android's measured system-bar height;
  // the smaller inset cap is only a fallback when that native value is absent.
  if (
    nativeStatusBarHeight !== undefined &&
    Number.isFinite(nativeStatusBarHeight)
  ) {
    return clampAndroidStatusBarHeight(
      nativeStatusBarHeight,
      ANDROID_MAX_MAIN_TAB_STATUS_BAR_HEIGHT,
    );
  }

  return clampAndroidStatusBarHeight(
    topInset,
    ANDROID_MAX_MAIN_TAB_STATUS_BAR_FALLBACK,
  );
}

export function getAndroidMainTabHeaderHeight(
  topInset: number,
  nativeStatusBarHeight?: number,
): number {
  return (
    ANDROID_MAIN_TAB_HEADER_TOOLBAR_HEIGHT +
    getAndroidMainTabStatusBarHeight(topInset, nativeStatusBarHeight)
  );
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
