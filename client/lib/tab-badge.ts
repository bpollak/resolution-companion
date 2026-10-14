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
