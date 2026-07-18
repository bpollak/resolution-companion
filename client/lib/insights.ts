import { ElementalAction, DailyLog } from "@/lib/storage";
import {
  buildLogIndex,
  computeWeekStats,
  getLocalDateString,
  startOfWeek,
  WEEKDAY_ORDER,
} from "@/lib/progress";

/**
 * Insights math for the premium panel on Journey. The Oura/Whoop lesson:
 * score + narrative + ONE recommendation — never a wall of charts. All
 * computation is on-device over the persona's own logs.
 */

export interface WeekdayProfileEntry {
  /** Full weekday name, Monday first. */
  day: string;
  completions: number;
}

export interface WeekdayProfile {
  profile: WeekdayProfileEntry[];
  bestDay: string | null;
  maxCompletions: number;
}

/** Completions per weekday over the trailing `weeks` weeks (including the current partial week). */
export function computeWeekdayProfile(
  actions: ElementalAction[],
  logs: DailyLog[],
  weeks = 8,
  today: Date = new Date(),
): WeekdayProfile {
  const logIndex = buildLogIndex(logs);
  const counts = new Map<string, number>(WEEKDAY_ORDER.map((d) => [d, 0]));

  const todayLocal = new Date(today);
  todayLocal.setHours(0, 0, 0, 0);
  const cursor = new Date(todayLocal);
  cursor.setDate(cursor.getDate() - weeks * 7 + 1);

  while (cursor <= todayLocal) {
    const dateStr = getLocalDateString(cursor);
    const dayOfWeek = cursor.toLocaleDateString("en-US", { weekday: "long" });
    for (const action of actions) {
      const log = logIndex.get(`${action.id}|${dateStr}`);
      if (log?.status) {
        counts.set(dayOfWeek, (counts.get(dayOfWeek) ?? 0) + 1);
      }
    }
    cursor.setDate(cursor.getDate() + 1);
  }

  let bestDay: string | null = null;
  let best = 0;
  let max = 0;
  for (const day of WEEKDAY_ORDER) {
    const count = counts.get(day) ?? 0;
    max = Math.max(max, count);
    if (count > best) {
      best = count;
      bestDay = day;
    }
  }

  return {
    profile: WEEKDAY_ORDER.map((day) => ({
      day,
      completions: counts.get(day) ?? 0,
    })),
    bestDay,
    maxCompletions: max,
  };
}

export interface WeeklyTrendPoint {
  /** Monday (local YYYY-MM-DD) starting the week. */
  weekKey: string;
  /** 0-100 completion rate; weeks with nothing scheduled score 0. */
  score: number;
  scheduled: number;
}

/**
 * Weekly consistency scores, oldest → newest, over the trailing `weeks`
 * complete weeks plus the current week-to-date as the final point.
 */
export function computeWeeklyTrend(
  actions: ElementalAction[],
  logs: DailyLog[],
  weeks = 8,
  today: Date = new Date(),
): WeeklyTrendPoint[] {
  const logIndex = buildLogIndex(logs);
  const actionStartDates = new Map<string, string>(
    actions.map((a) => [a.id, getLocalDateString(new Date(a.createdAt))]),
  );

  const todayLocal = new Date(today);
  todayLocal.setHours(0, 0, 0, 0);
  const currentWeekStart = startOfWeek(todayLocal);

  const points: WeeklyTrendPoint[] = [];
  for (let i = weeks - 1; i >= 0; i--) {
    const weekStart = new Date(currentWeekStart);
    weekStart.setDate(weekStart.getDate() - i * 7);
    const endCap = i === 0 ? todayLocal : null;
    const stats = computeWeekStats(
      actions,
      weekStart,
      endCap,
      logIndex,
      actionStartDates,
    );
    points.push({
      weekKey: getLocalDateString(weekStart),
      score: stats.score,
      scheduled: stats.scheduled,
    });
  }
  return points;
}

export interface CoachObservation {
  /** Stable id (pattern + week) so a shown observation isn't repeated. */
  id: string;
  /** The observation, in the coach's voice. */
  text: string;
}

/**
 * The coach's one proactive weekly observation — computed locally (no AI
 * cost), pattern-based, and always an affirmation. Returns null when no
 * pattern has genuinely emerged; silence beats filler.
 */
export function computeCoachObservation(
  actions: ElementalAction[],
  logs: DailyLog[],
  personaName: string,
  today: Date = new Date(),
): CoachObservation | null {
  const logIndex = buildLogIndex(logs);
  const weekKey = getLocalDateString(startOfWeek(today));

  // Pattern 1: a weekday held for 3+ consecutive weeks, walking back from
  // that weekday's most recent past occurrence (yesterday or earlier — today
  // is still pending and must never break a pattern)
  const todayLocal = new Date(today);
  todayLocal.setHours(0, 0, 0, 0);
  const dayName = (d: Date) =>
    d.toLocaleDateString("en-US", { weekday: "long" });
  for (const weekday of WEEKDAY_ORDER) {
    const scheduledActions = actions.filter((a) =>
      a.frequency.includes(weekday),
    );
    if (scheduledActions.length === 0) continue;

    const occurrence = new Date(todayLocal);
    occurrence.setDate(occurrence.getDate() - 1);
    while (dayName(occurrence) !== weekday) {
      occurrence.setDate(occurrence.getDate() - 1);
    }

    let weeksHeld = 0;
    for (let weekBack = 0; weekBack < 6; weekBack++) {
      const dateStr = getLocalDateString(occurrence);
      const allDone = scheduledActions.every((action) => {
        const created = getLocalDateString(new Date(action.createdAt));
        if (dateStr < created) return true; // action didn't exist yet
        return logIndex.get(`${action.id}|${dateStr}`)?.status === true;
      });
      // Only count weeks where at least one action already existed
      const anyExisted = scheduledActions.some(
        (action) => getLocalDateString(new Date(action.createdAt)) <= dateStr,
      );
      if (allDone && anyExisted) weeksHeld++;
      else break;
      occurrence.setDate(occurrence.getDate() - 7);
    }
    if (weeksHeld >= 3) {
      return {
        id: `weekday-${weekday}-${weekKey}`,
        text: `You've completed every ${weekday} for ${weeksHeld} weeks straight — ${weekday} ${personaName} is real. Want to look at what makes it work?`,
      };
    }
  }

  // Pattern 2: three consecutive rising weekly consistency scores across
  // COMPLETE weeks (the current partial week would mask any climb)
  const completeWeeks = computeWeeklyTrend(actions, logs, 5, today)
    .slice(0, -1)
    .filter((p) => p.scheduled > 0);
  if (completeWeeks.length >= 3) {
    const last3 = completeWeeks.slice(-3);
    if (last3[0].score < last3[1].score && last3[1].score < last3[2].score) {
      return {
        id: `rising-${weekKey}`,
        text: `Three weeks climbing: ${last3[0].score}% → ${last3[1].score}% → ${last3[2].score}%. Something's compounding. Worth two minutes to name what changed?`,
      };
    }
  }

  return null;
}

export interface InsightsNarrative {
  headline: string;
  recommendation: string;
}

/**
 * One story and one recommendation from the numbers — identity-framed,
 * comeback-friendly, never a scold.
 */
export function buildInsightsNarrative(
  weekdayProfile: WeekdayProfile,
  trend: WeeklyTrendPoint[],
  personaName: string,
): InsightsNarrative {
  const activeWeeks = trend.filter((p) => p.scheduled > 0);
  if (activeWeeks.length === 0 || weekdayProfile.maxCompletions === 0) {
    return {
      headline: `The portrait starts with the first vote.`,
      recommendation: `Log one small action — even the 2-minute version — and the pattern begins.`,
    };
  }

  const recent = activeWeeks.slice(-2);
  const delta = recent.length === 2 ? recent[1].score - recent[0].score : 0;
  const trendWord =
    delta > 5 ? "climbing" : delta < -5 ? "bending, not breaking" : "steady";

  const bestDay = weekdayProfile.bestDay;
  const headline = bestDay
    ? `${bestDay}s are when ${personaName} shows up most. Consistency is ${trendWord}.`
    : `Consistency is ${trendWord}.`;

  const recommendation = bestDay
    ? `Protect your ${bestDay} anchor — it carries the week. On harder days, the 2-minute floor keeps the vote alive.`
    : `Anchor one action to a moment you already own — after coffee, before bed — and let the floor version cover the rest.`;

  return { headline, recommendation };
}
