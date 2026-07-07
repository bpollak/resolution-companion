import type { Benchmark, ElementalAction, DailyLog } from "@/lib/storage";

/**
 * Pure progress/score math shared by AppContext, CalendarScreen, and
 * ProgressScreen. All date keys use LOCAL calendar dates (YYYY-MM-DD) and
 * local weekdays, matching how TodayScreen/CalendarScreen write daily logs.
 * Deriving either from UTC (toISOString / new Date("YYYY-MM-DD")) shifts the
 * day for western timezones and silently drops scheduled-day completions.
 */

function logDateKey(log: DailyLog): string {
  return `${log.actionId}|${log.logDate.split("T")[0]}`;
}

/** Local calendar date as YYYY-MM-DD (no UTC conversion). */
export function getLocalDateString(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/** Parse a YYYY-MM-DD string as a LOCAL date (new Date(str) would be UTC). */
function parseLocalDate(dateStr: string): Date {
  const [year, month, day] = dateStr.split("-").map(Number);
  return new Date(year, month - 1, day);
}

/**
 * Index logs by `${actionId}|${YYYY-MM-DD}`. First occurrence wins, mirroring
 * Array.prototype.find semantics if duplicate logs exist for the same day.
 */
export function buildLogIndex(logs: DailyLog[]): Map<string, DailyLog> {
  const index = new Map<string, DailyLog>();
  for (const log of logs) {
    const key = logDateKey(log);
    if (!index.has(key)) {
      index.set(key, log);
    }
  }
  return index;
}

/**
 * The last `days` calendar days as YYYY-MM-DD strings (UTC, via toISOString),
 * excluding days before the persona was created and days after today.
 */
export function getTrackableDays(
  personaCreatedDate: Date | null,
  days: number = 30,
): string[] {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const trackableDays: string[] = [];
  for (let i = 0; i < days; i++) {
    const date = new Date();
    date.setDate(date.getDate() - i);
    date.setHours(0, 0, 0, 0);

    if (personaCreatedDate && date < personaCreatedDate) {
      continue;
    }

    if (date > today) {
      continue;
    }

    trackableDays.push(getLocalDateString(date));
  }

  return trackableDays;
}

export interface ActionProgress {
  action: ElementalAction;
  progress: number;
}

export interface BenchmarkProgressResult {
  benchmark: Benchmark;
  actions: ActionProgress[];
  progress: number;
}

export function computeBenchmarkProgress(
  benchmarks: Benchmark[],
  actions: ElementalAction[],
  logIndex: Map<string, DailyLog>,
  trackableDays: string[],
): BenchmarkProgressResult[] {
  const dayInfos = trackableDays.map((dateStr) => ({
    dateStr,
    dayOfWeek: parseLocalDate(dateStr).toLocaleDateString("en-US", {
      weekday: "long",
    }),
  }));

  return benchmarks.map((benchmark) => {
    const benchmarkActions = actions.filter(
      (a) => a.benchmarkId === benchmark.id,
    );
    if (benchmarkActions.length === 0)
      return { benchmark, actions: [], progress: 0 };

    let totalExpected = 0;
    let totalCompleted = 0;

    const actionProgress = benchmarkActions.map((action) => {
      let actionExpected = 0;
      let actionCompleted = 0;

      for (const { dateStr, dayOfWeek } of dayInfos) {
        if (action.frequency.includes(dayOfWeek)) {
          actionExpected++;
          totalExpected++;
          const log = logIndex.get(`${action.id}|${dateStr}`);
          if (log?.status) {
            actionCompleted++;
            totalCompleted++;
          }
        }
      }

      return {
        action,
        progress:
          actionExpected > 0
            ? Math.round((actionCompleted / actionExpected) * 100)
            : 0,
      };
    });

    return {
      benchmark,
      actions: actionProgress,
      progress:
        totalExpected > 0
          ? Math.round((totalCompleted / totalExpected) * 100)
          : 0,
    };
  });
}

/**
 * Completion rate (%) over the last `days` days for already persona-scoped
 * actions and logs. days=7 is the momentum score, days=30 persona alignment.
 *
 * Today's still-unlogged scheduled actions are pending, not missed: they are
 * excluded from the expected count (today counts only for completions).
 * Counting them from midnight showed every user a lower score each morning
 * than the night before, purely because the day had started.
 *
 * Mirrors storage.calculateMomentumScoreForPersona exactly: unlike
 * computeBenchmarkProgress, day-of-week comes from the local-time date object
 * and there is no persona-creation-date cutoff.
 */
export function computeMomentumScore(
  actions: ElementalAction[],
  logs: DailyLog[],
  days: number = 7,
): number {
  if (actions.length === 0) return 0;

  const logIndex = buildLogIndex(logs);
  const today = new Date();
  const todayStr = getLocalDateString(today);
  let totalExpected = 0;
  let totalCompleted = 0;

  for (let i = 0; i < days; i++) {
    const date = new Date(today);
    date.setDate(date.getDate() - i);
    const dateStr = getLocalDateString(date);
    const dayOfWeek = date.toLocaleDateString("en-US", { weekday: "long" });

    for (const action of actions) {
      if (action.frequency.includes(dayOfWeek)) {
        const log = logIndex.get(`${action.id}|${dateStr}`);
        if (dateStr === todayStr && !log?.status) {
          continue;
        }
        totalExpected++;
        if (log?.status) {
          totalCompleted++;
        }
      }
    }
  }

  return totalExpected > 0
    ? Math.round((totalCompleted / totalExpected) * 100)
    : 0;
}

export interface StreakResult {
  /** Fully-completed scheduled days in the active run (today joins live once complete). */
  current: number;
  /** Best run ever under the same rules. */
  longest: number;
  /** True while the current run is being held together by the streak shield. */
  shieldUsed: boolean;
}

const STREAK_LOOKBACK_DAYS = 365;
const SHIELD_WINDOW_DAYS = 7;

/**
 * Streak with grace, derived purely from actions + logs (no stored state).
 *
 * Rules:
 * - A day counts when every action scheduled that day was completed.
 * - Days with nothing scheduled are free: they bridge a streak, never break it.
 * - Streak shield: one missed scheduled day per rolling 7 is bridged; a second
 *   miss within SHIELD_WINDOW_DAYS of the bridged one resets the run.
 * - Today is pending until complete: it never breaks a run, and increments it
 *   live once every scheduled action is logged.
 *
 * Days before an action existed are never "missed" — each action only counts
 * from its local creation date.
 */
export function computeStreak(
  actions: ElementalAction[],
  logs: DailyLog[],
): StreakResult {
  if (actions.length === 0) {
    return { current: 0, longest: 0, shieldUsed: false };
  }

  const logIndex = buildLogIndex(logs);

  const actionStartDates = new Map<string, string>();
  let earliest: string | null = null;
  for (const action of actions) {
    const created = getLocalDateString(new Date(action.createdAt));
    actionStartDates.set(action.id, created);
    if (earliest === null || created < earliest) earliest = created;
  }
  for (const log of logs) {
    const logDate = log.logDate.split("T")[0];
    if (earliest === null || logDate < earliest) earliest = logDate;
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayStr = getLocalDateString(today);

  const lookbackStart = new Date(today);
  lookbackStart.setDate(lookbackStart.getDate() - (STREAK_LOOKBACK_DAYS - 1));
  const earliestDate = earliest ? parseLocalDate(earliest) : today;
  const cursor = earliestDate > lookbackStart ? earliestDate : lookbackStart;

  let run = 0;
  let longest = 0;
  let lastBridgedMiss: Date | null = null;

  // Day-count deltas use Math.round to absorb DST's ±1h on local midnights
  const daysBetween = (from: Date, to: Date) =>
    Math.round((to.getTime() - from.getTime()) / 86400000);

  while (cursor <= today) {
    const dateStr = getLocalDateString(cursor);
    const dayOfWeek = cursor.toLocaleDateString("en-US", { weekday: "long" });

    let scheduled = 0;
    let completed = 0;
    for (const action of actions) {
      if (!action.frequency.includes(dayOfWeek)) continue;
      const startDate = actionStartDates.get(action.id);
      if (startDate !== undefined && dateStr < startDate) continue;
      scheduled++;
      if (logIndex.get(`${action.id}|${dateStr}`)?.status) completed++;
    }

    if (scheduled === 0) {
      // Rest day: part of the plan, bridges the run
    } else if (completed === scheduled) {
      run++;
      if (run > longest) longest = run;
    } else if (dateStr === todayStr) {
      // Today is pending, never broken
    } else if (run > 0) {
      if (
        lastBridgedMiss !== null &&
        daysBetween(lastBridgedMiss, cursor) <= SHIELD_WINDOW_DAYS
      ) {
        // Second miss inside the shield window: fresh start
        run = 0;
        lastBridgedMiss = null;
      } else {
        lastBridgedMiss = new Date(cursor);
      }
    }

    cursor.setDate(cursor.getDate() + 1);
  }

  const shieldUsed =
    run > 0 &&
    lastBridgedMiss !== null &&
    daysBetween(lastBridgedMiss, today) <= SHIELD_WINDOW_DAYS;

  return { current: run, longest, shieldUsed };
}
