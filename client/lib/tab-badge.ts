// The Today badge is an invite to open Today: it shows only before the first
// log of the day, and never while Today is already on screen, where the
// habit card itself carries the count.
export function getTodayTabBadge({
  isTodayFocused,
  hasLoggedToday,
  remainingTasksCount,
}: {
  isTodayFocused: boolean;
  hasLoggedToday: boolean;
  remainingTasksCount: number;
}): number | undefined {
  if (isTodayFocused || hasLoggedToday) return undefined;
  return remainingTasksCount > 0 ? remainingTasksCount : undefined;
}

/**
 * Whether `routeKey` is the selected tab, from the tab navigator's own state.
 * `navigation.isFocused()` also requires every parent to be focused, so it
 * reads false while a root modal (Profile, Coach) covers the tabs. Tab
 * options are only recomputed when the tab navigator re-renders, so a
 * re-render under a modal (a theme switch in Profile) left the badge on the
 * Today tab after the modal closed.
 */
export function isSelectedTab(
  tabState: { index: number; routes: readonly { key: string }[] },
  routeKey: string,
): boolean {
  return tabState.routes[tabState.index]?.key === routeKey;
}
