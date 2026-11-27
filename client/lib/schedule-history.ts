/**
 * Schedule history: which weekdays a habit was scheduled on, as of each day.
 *
 * Streaks, shields, milestones, the calendar, and recaps all walk past days
 * and ask "was this habit scheduled then?". Answering from the habit's
 * current days rewrites history on every edit: widening Mon/Wed/Fri to daily
 * turned every past Tuesday into a miss. History entries are local date keys
 * (YYYY-MM-DD), ascending, each in force from its `from` day until the next.
 *
 * This module must not import "@/lib/progress" (progress imports it).
 */

export interface FrequencyHistoryEntry {
  /** Local YYYY-MM-DD from which this schedule applies. */
  from: string;
  frequency: string[];
}

interface Scheduled {
  frequency: string[];
  frequencyHistory?: FrequencyHistoryEntry[];
}

const WEEKDAYS = new Set([
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
]);

const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;

function localDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/**
 * Whether the habit was (or is) scheduled on `dateKey`, whose weekday name is
 * `weekday`. Membership only: creation-date cutoffs stay with the caller.
 *
 * With no history this is exactly `frequency.includes(weekday)`, which is
 * what every plan saved before schedule history existed computes. From the
 * latest change onward the habit's current days are the authority, so today
 * and future days can never disagree with what the editor shows. Days before
 * the first entry (backfilled completions) use the first entry.
 */
export function isScheduledOn(
  action: Scheduled,
  dateKey: string,
  weekday: string,
): boolean {
  const history = action.frequencyHistory;
  if (!history || history.length === 0) {
    return action.frequency?.includes(weekday) ?? false;
  }
  const last = history.length - 1;
  if (dateKey >= history[last].from) {
    return action.frequency?.includes(weekday) ?? false;
  }
  for (let index = last - 1; index > 0; index -= 1) {
    if (dateKey >= history[index].from) {
      return history[index].frequency.includes(weekday);
    }
  }
  return history[0].frequency.includes(weekday);
}

function sameDays(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((day) => b.includes(day));
}

/**
 * The habit with `newFrequency` in force from `todayKey`. The first change
 * seeds an entry for the old days from the habit's start date; a second
 * change on the same day replaces that day's entry. Entries dated today or
 * later are dropped before appending, so a habit edited on (or before) the
 * day it starts carries no past schedule. Returns `action` itself when the
 * days did not change.
 */
export function withFrequencyChange<
  T extends Scheduled & { createdAt: string },
>(action: T, newFrequency: string[], todayKey: string): T {
  const current = action.frequency ?? [];
  if (sameDays(current, newFrequency)) return action;

  let history = action.frequencyHistory ?? [];
  if (history.length === 0) {
    const created = new Date(action.createdAt);
    const startKey = Number.isNaN(created.getTime())
      ? todayKey
      : localDateKey(created);
    history = [{ from: startKey, frequency: [...current] }];
  }
  return {
    ...action,
    frequency: [...newFrequency],
    frequencyHistory: [
      ...history.filter((entry) => entry.from < todayKey),
      { from: todayKey, frequency: [...newFrequency] },
    ],
  };
}

/**
 * Stored or restored history made safe to walk: well-formed entries only,
 * known weekdays only, ascending by date. Undefined when nothing usable is
 * left, which reads as "no history" everywhere.
 */
export function sanitizeFrequencyHistory(
  value: unknown,
): FrequencyHistoryEntry[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const entries: FrequencyHistoryEntry[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const { from, frequency } = item as Partial<FrequencyHistoryEntry>;
    if (typeof from !== "string" || !DATE_KEY.test(from)) continue;
    if (!Array.isArray(frequency)) continue;
    entries.push({
      from,
      frequency: frequency.filter(
        (day): day is string => typeof day === "string" && WEEKDAYS.has(day),
      ),
    });
  }
  if (entries.length === 0) return undefined;
  return entries.sort((a, b) =>
    a.from < b.from ? -1 : a.from > b.from ? 1 : 0,
  );
}
