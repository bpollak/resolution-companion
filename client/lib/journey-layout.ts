import type { DailyLog, ElementalAction } from "@/lib/storage";
import type { ActionRhythm, ActionRhythmCategory } from "@/lib/ambient-coach";
import { getLocalDateString } from "@/lib/progress";
import { actionIsScheduledOnDate } from "@/lib/journey-date";

/** Rows the month grid needs: leading weekday padding plus the month's days. */
export function calendarWeekCount(year: number, month: number): number {
  const startPadding = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  return Math.ceil((startPadding + daysInMonth) / 7);
}

/** Splits the month grid's days into rows of seven, one per rendered week. */
export function chunkIntoWeeks<T>(days: readonly T[]): T[][] {
  const weeks: T[][] = [];
  for (let start = 0; start < days.length; start += 7) {
    weeks.push(days.slice(start, start + 7));
  }
  return weeks;
}

/** Below this many planned days a percentage swings too hard to mean much. */
export const EARLY_PROGRESS_MIN_DAYS = 7;

export type MonthProgressDisplay =
  | { kind: "ring" }
  | {
      kind: "early";
      /** Day of the plan, 1 on the day it was created. */
      dayNumber: number;
      /** Planned days in the window where every scheduled habit was done. */
      completedDays: number;
      /** Planned days in the window; today counts only once it is done. */
      plannedDays: number;
      /** The plan predates this month, so the counts cover this month only. */
      monthOnly: boolean;
    };

// Calendar-day difference via UTC so a DST change can't shave off a day.
function calendarDaysBetween(from: Date, to: Date): number {
  const a = Date.UTC(from.getFullYear(), from.getMonth(), from.getDate());
  const b = Date.UTC(to.getFullYear(), to.getMonth(), to.getDate());
  return Math.round((b - a) / 86_400_000);
}

/**
 * Decides between the month consistency ring and "Day N" text. A day-one
 * plan (or the 1st of any month) otherwise reads 100% or 0% off a single data
 * point. Today's progress line and day-complete card use the same result, so
 * a month percentage appears on both screens or on neither.
 */
export function getMonthProgressDisplay({
  actions,
  logIndex,
  planStartedAt,
  now = new Date(),
}: {
  actions: Pick<ElementalAction, "id" | "frequency" | "createdAt">[];
  logIndex: Map<string, DailyLog>;
  planStartedAt?: string | null;
  now?: Date;
}): MonthProgressDisplay {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
  const parsedStart = planStartedAt ? new Date(planStartedAt) : null;
  const planStart =
    parsedStart && !Number.isNaN(parsedStart.getTime())
      ? new Date(
          parsedStart.getFullYear(),
          parsedStart.getMonth(),
          parsedStart.getDate(),
        )
      : monthStart;
  const dayNumber = Math.max(1, calendarDaysBetween(planStart, today) + 1);
  const windowStart = planStart > monthStart ? planStart : monthStart;
  const todayKey = getLocalDateString(today);

  let plannedDays = 0;
  let completedDays = 0;
  const cursor = new Date(windowStart);
  while (cursor <= today) {
    const dateKey = getLocalDateString(cursor);
    let total = 0;
    let done = 0;
    for (const action of actions) {
      if (!actionIsScheduledOnDate(action, cursor)) continue;
      total += 1;
      if (logIndex.get(`${action.id}|${dateKey}`)?.status) done += 1;
    }
    // Today is pending until it's over, matching the ring's own rule.
    const pendingToday = dateKey === todayKey && done < total;
    if (total > 0 && !pendingToday) {
      plannedDays += 1;
      if (done === total) completedDays += 1;
    }
    cursor.setDate(cursor.getDate() + 1);
  }

  if (
    dayNumber >= EARLY_PROGRESS_MIN_DAYS &&
    plannedDays >= EARLY_PROGRESS_MIN_DAYS
  ) {
    return { kind: "ring" };
  }
  return {
    kind: "early",
    dayNumber,
    completedDays,
    plannedDays,
    monthOnly: planStart < monthStart,
  };
}

/** True when the month figure has enough planned days to be shown anywhere. */
export function showsMonthConsistency(display: MonthProgressDisplay): boolean {
  return display.kind === "ring";
}

export function formatEarlyProgress(
  display: Extract<MonthProgressDisplay, { kind: "early" }>,
): { title: string; detail: string } {
  const title = `Day ${display.dayNumber}`;
  if (display.plannedDays === 0) {
    // An established plan isn't starting; only the month is.
    return {
      title,
      detail: display.monthOnly ? "New month" : "Just getting started",
    };
  }
  const unit = display.plannedDays === 1 ? "day" : "days";
  return {
    title,
    detail: `${display.completedDays} of ${display.plannedDays} ${unit}${display.monthOnly ? " this month" : ""}`,
  };
}

export const RHYTHM_LABELS: Record<ActionRhythmCategory, string> = {
  "working-well": "Working well",
  "still-forming": "Still forming",
  "worth-simplifying": "Worth simplifying",
};

/** The rhythm card earns its space only when a habit needs a tune-up. */
export function hasRhythmToSimplify(rhythms: readonly ActionRhythm[]): boolean {
  return rhythms.some((rhythm) => rhythm.category === "worth-simplifying");
}

export function rhythmStatusText(rhythm: ActionRhythm): string {
  return rhythm.scheduled < 4
    ? "Still learning your rhythm"
    : `${RHYTHM_LABELS[rhythm.category]} · ${rhythm.completed}/${rhythm.scheduled} completed`;
}

/**
 * Calendar tap rules. Today never takes the selection: its habits already
 * live on the Today tab, so tapping it (or the selected day) clears the list.
 */
export function nextDaySelection(
  current: Date | null,
  tapped: Date,
  today: Date = new Date(),
): Date | null {
  const tappedKey = getLocalDateString(tapped);
  if (tappedKey === getLocalDateString(today)) return null;
  if (current && getLocalDateString(current) === tappedKey) return null;
  return tapped;
}
