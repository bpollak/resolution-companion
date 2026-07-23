export const IOS_TAB_BAR_HEIGHT = 88;
export const ANDROID_TAB_BAR_CONTENT_HEIGHT = 70;

export function getMainTabBarHeight(
  platform: string,
  bottomInset: number,
): number {
  if (platform === "ios") return IOS_TAB_BAR_HEIGHT;

  // React Navigation applies the safe-area inset as padding inside a custom
  // tab-bar height. Android therefore needs that inset added to the fixed
  // content height or three-button navigation can cover the tab controls.
  if (platform === "android") {
    return ANDROID_TAB_BAR_CONTENT_HEIGHT + Math.max(0, bottomInset);
  }

  return ANDROID_TAB_BAR_CONTENT_HEIGHT;
}
