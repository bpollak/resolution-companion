// An iOS native-stack "modal" is a page sheet that already starts below the
// status bar, yet useSafeAreaInsets() still reports the window's top inset.
// Adding it again left about 60pt of dead space above the sheet's header.
// Android presents the same route full screen, so it still needs the inset.
export function getModalSheetTopInset(
  platform: string,
  windowTopInset: number,
): number {
  if (platform === "ios") return 0;
  return Number.isFinite(windowTopInset) && windowTopInset > 0
    ? windowTopInset
    : 0;
}
