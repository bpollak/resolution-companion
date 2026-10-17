import type { DailyLog } from "@/lib/storage";

// Pure layout rules for the Today screen, kept out of the component so the
// "one optional card" and timing rules are unit-testable.

export type TodayOptionalCard =
  | "time-limited"
  | "primer"
  | "widget-hint"
  | "secondary";

/**
 * Today shows at most one optional card per day. Time-limited cards (month,
 * year and weekly recaps, the witness celebration) go stale within days, so
 * they outrank the teach-once tips, which keep until a quieter day. The
 * reminder primer beats the widget hint because it gates the reminder
 * itself; the remaining nudges and invites fill the slot otherwise.
 */
export function selectTodayOptionalCard(candidates: {
  timeLimited: boolean;
  primer: boolean;
  widgetHint: boolean;
  secondary: boolean;
}): TodayOptionalCard | null {
  if (candidates.timeLimited) return "time-limited";
  if (candidates.primer) return "primer";
  if (candidates.widgetHint) return "widget-hint";
  if (candidates.secondary) return "secondary";
  return null;
}

/**
 * The primer is a nudge, not a gate: after this many days on screen without
 * an answer it stops taking Today's slot. Profile > Daily Reminder remains.
 */
export const REMINDER_PRIMER_MAX_DAYS = 3;

/** Stored list of local date keys the primer was shown on; tolerant of junk. */
export function parseReminderPrimerDays(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed)
      ? parsed.filter((day): day is string => typeof day === "string")
      : [];
  } catch {
    return [];
  }
}

/** Today counts as one of the allowed days once it has shown there. */
export function canShowReminderPrimer(
  shownDays: readonly string[],
  todayKey: string,
): boolean {
  return (
    shownDays.includes(todayKey) || shownDays.length < REMINDER_PRIMER_MAX_DAYS
  );
}

/** Returns the same array when today is already recorded, so callers can skip a write. */
export function recordReminderPrimerDay(
  shownDays: string[],
  todayKey: string,
): string[] {
  return shownDays.includes(todayKey) ? shownDays : [...shownDays, todayKey];
}

/** Days into the week (Monday-based) that the weekly recap stays relevant. */
export const WEEKLY_RECAP_FRESH_DAYS = 3;

/** True Monday through Wednesday: after that "last week" is stale news. */
export function isWeeklyRecapFresh(today: Date): boolean {
  const daysIntoWeek = (today.getDay() + 6) % 7;
  return daysIntoWeek < WEEKLY_RECAP_FRESH_DAYS;
}

/** The widget hint waits until the habit has some history worth automating. */
export const WIDGET_HINT_MIN_COMPLETED_DAYS = 3;

/** Distinct local dates with at least one completed log. */
export function countCompletedDays(logs: DailyLog[]): number {
  const days = new Set<string>();
  for (const log of logs) {
    if (log.status) days.add(log.logDate.split("T")[0]);
  }
  return days.size;
}

function dateKeyToUtcDay(dateKey: string): number {
  const [year, month, day] = dateKey.split("-").map(Number);
  return Date.UTC(year, month - 1, day) / 86_400_000;
}

/**
 * 1-based day of the plan, counted in local calendar days so a DST change or
 * a late-night setup never skips or repeats a day. Never below 1.
 */
export function planDayNumber(startDateKey: string, todayKey: string): number {
  const diff = dateKeyToUtcDay(todayKey) - dateKeyToUtcDay(startDateKey);
  return Math.max(1, Math.round(diff) + 1);
}

export interface TodayProgressLine {
  parts: string[];
  accessibilityLabel: string;
}

export function buildTodayProgressLine(input: {
  completed: number;
  scheduled: number;
  streak: number;
  shieldUsed: boolean;
  planDay: number;
  consistency: number;
  /** Shared with Journey's ring: see getMonthProgressDisplay. */
  showConsistency: boolean;
}): TodayProgressLine {
  const {
    completed,
    scheduled,
    streak,
    shieldUsed,
    planDay,
    consistency,
    showConsistency,
  } = input;
  const parts = [`${completed}/${scheduled} done`];
  const spoken = [`${completed} of ${scheduled} done today`];

  if (streak > 0) {
    const label = `${streak}-day streak`;
    parts.push(shieldUsed ? `${label} (protected)` : label);
    spoken.push(shieldUsed ? `${label}, protected by a rest day` : label);
  } else if (shieldUsed) {
    parts.push("Protected");
    spoken.push("Streak protected by a rest day");
  } else {
    parts.push(`Day ${planDay}`);
    spoken.push(`Day ${planDay} of your plan`);
  }

  if (showConsistency) {
    parts.push(`${consistency}% this month`);
    spoken.push(`${consistency}% consistency this month`);
  }

  return { parts, accessibilityLabel: `${spoken.join(". ")}.` };
}

/**
 * The day-complete card's progress line. Until the month has enough planned
 * days for a percentage to mean something (the same rule as Journey's ring),
 * day one would read "100%", so it names the plan day instead, or nothing
 * when the streak line above already says the same number.
 */
export function dayCompleteProgressText(input: {
  showConsistency: boolean;
  monthName: string;
  consistency: number;
  planDay: number;
  streak: number;
}): string | null {
  if (input.showConsistency) {
    return `${input.monthName} consistency: ${input.consistency}%`;
  }
  return input.planDay === input.streak
    ? null
    : `Day ${input.planDay} of your plan`;
}

/**
 * Toasts stay up long enough to read: about 60ms per character, never under
 * two seconds, and capped so a long message never lingers over the screen.
 */
export function toastDurationFor(message: string): number {
  return Math.min(6000, Math.max(2000, message.length * 60));
}
