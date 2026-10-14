import type { DailyLog } from "@/lib/storage";

// Pure layout rules for the Today screen, kept out of the component so the
// "one optional card" and timing rules are unit-testable.

export type TodayOptionalCard = "primer" | "widget-hint" | "secondary";

/**
 * Today shows at most one optional card per day. The reminder primer wins
 * because it is answered once and gates the reminder itself; the widget hint
 * is a one-time tip; the recap/invite chain fills the slot otherwise.
 */
export function selectTodayOptionalCard(candidates: {
  primer: boolean;
  widgetHint: boolean;
  secondary: boolean;
}): TodayOptionalCard | null {
  if (candidates.primer) return "primer";
  if (candidates.widgetHint) return "widget-hint";
  if (candidates.secondary) return "secondary";
  return null;
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

/**
 * Before a week of history a month percentage swings wildly (0% or 100% on
 * day one), so the progress line shows "Day N" alone until then.
 */
export const PROGRESS_CONSISTENCY_MIN_PLAN_DAYS = 7;

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
}): TodayProgressLine {
  const { completed, scheduled, streak, shieldUsed, planDay, consistency } =
    input;
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

  if (planDay >= PROGRESS_CONSISTENCY_MIN_PLAN_DAYS) {
    parts.push(`${consistency}% this month`);
    spoken.push(`${consistency}% consistency this month`);
  }

  return { parts, accessibilityLabel: `${spoken.join(". ")}.` };
}

/**
 * Toasts stay up long enough to read: about 60ms per character, never under
 * two seconds, and capped so a long message never lingers over the screen.
 */
export function toastDurationFor(message: string): number {
  return Math.min(6000, Math.max(2000, message.length * 60));
}
