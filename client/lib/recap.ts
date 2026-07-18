import { ElementalAction, DailyLog, Persona } from "@/lib/storage";
import {
  buildLogIndex,
  computeStreak,
  getLocalDateString,
} from "@/lib/progress";

/**
 * "Month in Votes" — the no-guilt monthly recap. Pure math over the persona's
 * actions and logs for one calendar month, built to be told as a story:
 * votes cast, when the user shows up, the comeback moment, and shields
 * earned along the way. Comebacks and rest are celebrated, never shamed —
 * a rough month still produces a warm story.
 */

export interface MonthRecap {
  /** "YYYY-MM" of the recapped month. */
  monthKey: string;
  /** e.g. "July 2026". */
  monthLabel: string;
  personaName: string;
  /** Completed action-days in the month. */
  votesCast: number;
  /** Scheduled action-days in the month. */
  scheduled: number;
  /** 0-100 completion rate. */
  consistency: number;
  /** Days with at least one completion. */
  activeDays: number;
  /** Weekday with the most completions; null when nothing was completed. */
  bestWeekday: string | null;
  /** Longest run of consecutive fully-complete scheduled days. */
  longestRun: number;
  /**
   * The comeback moment: the first completed day after the month's longest
   * gap of fully-missed scheduled days (gap >= 2). Null when the month had
   * no such gap — which is its own kind of win.
   */
  comeback: { date: string; gapDays: number } | null;
  /** Days inside the month bridged by the streak shield. */
  shieldedDays: number;
  /** Templated identity-framed closing line. */
  closingLine: string;
}

/** "YYYY-MM" for the month containing `date`. */
export function getMonthKey(date: Date): string {
  return getLocalDateString(date).slice(0, 7);
}

/** The month key for the month before the one containing `date`. */
export function getPreviousMonthKey(date: Date = new Date()): string {
  const d = new Date(date.getFullYear(), date.getMonth(), 1);
  d.setDate(0); // last day of previous month
  return getMonthKey(d);
}

function monthLabelFor(monthKey: string): string {
  const [year, month] = monthKey.split("-").map(Number);
  return new Date(year, month - 1, 1).toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  });
}

/**
 * Build the recap for the calendar month identified by `monthKey`
 * ("YYYY-MM"). Days after `today` are never counted (a recap of the current
 * month mid-month only covers elapsed days). Scheduling rules mirror
 * computeWeeklyRecap: an action counts from its creation date, and a
 * backfilled completion proves a day was trackable.
 */
export function buildMonthRecap(
  actions: ElementalAction[],
  logs: DailyLog[],
  persona: Persona | null,
  monthKey: string,
  today: Date = new Date(),
  maxShields = 1, // premium unlocks 2-shield capacity; must match the other surfaces
): MonthRecap {
  const logIndex = buildLogIndex(logs);
  const [year, month] = monthKey.split("-").map(Number);
  const monthStart = new Date(year, month - 1, 1);
  const monthEnd = new Date(year, month, 0);
  const todayLocal = new Date(today);
  todayLocal.setHours(0, 0, 0, 0);
  const endCap = monthEnd < todayLocal ? monthEnd : todayLocal;

  const actionStartDates = new Map<string, string>(
    actions.map((a) => [a.id, getLocalDateString(new Date(a.createdAt))]),
  );

  let votesCast = 0;
  let scheduled = 0;
  let activeDays = 0;
  const weekdayCompletions = new Map<string, number>();

  let longestRun = 0;
  let currentRun = 0;

  // Gap/comeback detection over fully-missed scheduled days
  let comeback: { date: string; gapDays: number } | null = null;
  let currentGap = 0;

  const cursor = new Date(monthStart);
  while (cursor <= endCap) {
    const dateStr = getLocalDateString(cursor);
    const dayOfWeek = cursor.toLocaleDateString("en-US", { weekday: "long" });

    let dayScheduled = 0;
    let dayCompleted = 0;
    for (const action of actions) {
      if (!action.frequency.includes(dayOfWeek)) continue;
      const log = logIndex.get(`${action.id}|${dateStr}`);
      const startDate = actionStartDates.get(action.id);
      if (startDate !== undefined && dateStr < startDate && !log?.status) {
        continue;
      }
      dayScheduled++;
      scheduled++;
      if (log?.status) {
        dayCompleted++;
        votesCast++;
      }
    }

    if (dayCompleted > 0) {
      activeDays++;
      weekdayCompletions.set(
        dayOfWeek,
        (weekdayCompletions.get(dayOfWeek) ?? 0) + dayCompleted,
      );
    }

    // Rest days neither break nor extend runs and gaps
    if (dayScheduled > 0) {
      if (dayCompleted === dayScheduled) {
        currentRun++;
        longestRun = Math.max(longestRun, currentRun);
      } else {
        currentRun = 0;
      }

      if (dayCompleted === 0) {
        currentGap++;
      } else {
        if (currentGap >= 2 && currentGap >= (comeback?.gapDays ?? 0)) {
          comeback = { date: dateStr, gapDays: currentGap };
        }
        currentGap = 0;
      }
    }

    cursor.setDate(cursor.getDate() + 1);
  }

  let bestWeekday: string | null = null;
  let bestCount = 0;
  for (const [day, count] of weekdayCompletions) {
    if (count > bestCount) {
      bestCount = count;
      bestWeekday = day;
    }
  }

  const shieldedDays = computeStreak(
    actions,
    logs,
    logIndex,
    maxShields,
  ).shieldedDays.filter((d) => d.startsWith(monthKey)).length;

  const consistency =
    scheduled > 0 ? Math.round((votesCast / scheduled) * 100) : 0;
  const personaName = persona?.name ?? "Future You";

  let closingLine: string;
  if (votesCast === 0) {
    closingLine = `A quiet month. The slate is clean — any day can be day one.`;
  } else if (comeback) {
    closingLine = `You came back after ${comeback.gapDays} days away. That's the whole skill. Still becoming ${personaName}.`;
  } else if (consistency >= 80) {
    closingLine = `${votesCast} votes at ${consistency}%. ${personaName} isn't a goal anymore — it's a habit.`;
  } else {
    closingLine = `${votesCast} votes cast for ${personaName}. Every one of them counted.`;
  }

  return {
    monthKey,
    monthLabel: monthLabelFor(monthKey),
    personaName,
    votesCast,
    scheduled,
    consistency,
    activeDays,
    bestWeekday,
    longestRun,
    comeback,
    shieldedDays,
    closingLine,
  };
}
