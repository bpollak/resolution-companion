/**
 * Milliseconds from `now` until just after the next local midnight. Built
 * from the local calendar (not a fixed 24 hours) so the 23- and 25-hour
 * daylight-saving days land on the right side of midnight. The one-second
 * pad keeps a timer that fires a little early from reading the old date.
 */
export function msUntilNextLocalDay(now: Date = new Date()): number {
  const nextMidnight = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate() + 1,
  );
  return Math.max(0, nextMidnight.getTime() - now.getTime()) + 1000;
}
