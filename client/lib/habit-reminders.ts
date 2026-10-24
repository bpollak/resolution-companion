import type { ElementalAction } from "@/lib/storage";

/** Timed habits closer than this to a slot's first time share its notification. */
export const COALESCE_WINDOW_MINUTES = 15;

/**
 * iOS keeps at most 64 pending local notifications per app and silently drops
 * the rest; four are held back as headroom.
 */
export const PENDING_NOTIFICATION_BUDGET = 60;

/**
 * Stored when the person switches a habit's reminder off, so a later
 * "turn reminders on" backfill can tell "chose off" from "never set".
 * Not a valid time, so scheduling treats it as untimed.
 */
export const REMINDER_OFF = "off";

// The Action editor saves this when the anchor field is left blank, so it
// says nothing about when the person actually does the habit.
const BLANK_ANCHOR_FALLBACK = "after i wake up";

// First match in table order wins, so "after my morning coffee" lands on
// coffee rather than tying. Word boundaries keep "afternoon" off "noon".
const ANCHOR_TIMES: [string[], string][] = [
  [["wake", "alarm", "sunrise"], "07:00"],
  [["coffee", "breakfast", "morning"], "07:30"],
  [["lunch", "noon", "midday"], "12:15"],
  [["afternoon"], "15:00"],
  [["after work", "commute home"], "17:30"],
  [["dinner"], "18:30"],
  [["evening", "night"], "20:00"],
  [["bed", "end of day"], "21:30"],
];

const TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;

export function parseReminderTime(
  value: string | undefined,
): { hour: number; minute: number } | null {
  const match = value ? TIME_PATTERN.exec(value) : null;
  return match ? { hour: Number(match[1]), minute: Number(match[2]) } : null;
}

export function formatReminderTime(hour: number, minute: number): string {
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

/** "21:30" → "9:30 PM". */
export function reminderTimeLabel(value: string): string {
  const parsed = parseReminderTime(value);
  if (!parsed) return value;
  const suffix = parsed.hour < 12 ? "AM" : "PM";
  const hour12 = parsed.hour % 12 === 0 ? 12 : parsed.hour % 12;
  return `${hour12}:${String(parsed.minute).padStart(2, "0")} ${suffix}`;
}

/** Anchor-derived reminder time, or null when the anchor doesn't say. */
export function suggestReminderTime(anchorLink: string): string | null {
  const text = anchorLink.trim().toLowerCase();
  if (!text || text === BLANK_ANCHOR_FALLBACK) return null;
  for (const [keywords, time] of ANCHOR_TIMES) {
    if (keywords.some((kw) => new RegExp(`\\b${kw}\\b`).test(text))) {
      return time;
    }
  }
  return null;
}

export function withSuggestedReminderTime<
  T extends { anchorLink: string; reminderTime?: string },
>(action: T): T {
  if (action.reminderTime) return action;
  const suggested = suggestReminderTime(action.anchorLink);
  return suggested ? { ...action, reminderTime: suggested } : action;
}

export interface TimedSlot {
  fireDate: Date;
  actions: ElementalAction[];
}

/**
 * One day's timed notifications. `remaining` must already be filtered to
 * habits scheduled, started, and still open that day.
 */
export function planTimedSlots(
  day: Date,
  remaining: ElementalAction[],
  now: Date,
): TimedSlot[] {
  const timed = remaining
    .map((action) => {
      const parsed = parseReminderTime(action.reminderTime);
      if (!parsed) return null;
      const fireDate = new Date(day);
      fireDate.setHours(parsed.hour, parsed.minute, 0, 0);
      return { action, fireDate };
    })
    // Past times go before grouping: an upcoming habit merged into a slot
    // that already fired would never fire itself.
    .filter(
      (entry): entry is { action: ElementalAction; fireDate: Date } =>
        entry !== null && entry.fireDate > now,
    )
    .sort((a, b) => a.fireDate.getTime() - b.fireDate.getTime());

  const slots: TimedSlot[] = [];
  for (const { action, fireDate } of timed) {
    const current = slots[slots.length - 1];
    if (
      current &&
      fireDate.getTime() - current.fireDate.getTime() <=
        COALESCE_WINDOW_MINUTES * 60_000
    ) {
      current.actions.push(action);
    } else {
      slots.push({ fireDate, actions: [action] });
    }
  }
  return slots;
}

/** Leading whole days whose notification count fits within `max`. */
export function fitToBudget<D>(
  days: D[],
  countOf: (day: D) => number,
  max: number,
): D[] {
  const kept: D[] = [];
  let total = 0;
  for (const day of days) {
    total += countOf(day);
    if (total > max) break;
    kept.push(day);
  }
  return kept;
}
