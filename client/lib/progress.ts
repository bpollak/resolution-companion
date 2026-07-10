import type { Benchmark, ElementalAction, DailyLog } from "@/lib/storage";

/**
 * Pure progress/score math shared by AppContext, JourneyScreen, and
 * TodayScreen. All date keys use LOCAL calendar dates (YYYY-MM-DD) and
 * local weekdays, matching how TodayScreen/JourneyScreen write daily logs.
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

export const WEEKDAY_ORDER = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
];

/** Sort weekday names into calendar order (Monday first). */
export function sortWeekdays(days: string[]): string[] {
  return [...days].sort(
    (a, b) => WEEKDAY_ORDER.indexOf(a) - WEEKDAY_ORDER.indexOf(b),
  );
}

/** Human schedule summary: "Every day", "Weekdays", or "Mon · Wed · Fri". */
export function formatScheduleDays(days: string[]): string {
  const sorted = sortWeekdays(days);
  if (sorted.length === 7) return "Every day";
  const weekdaysOnly = WEEKDAY_ORDER.slice(0, 5);
  if (sorted.length === 5 && weekdaysOnly.every((d) => sorted.includes(d))) {
    return "Weekdays";
  }
  return sorted.map((d) => d.slice(0, 3)).join(" · ");
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

/** Default consistency target: a milestone completes after this many fully-completed scheduled days. */
export const MILESTONE_TARGET_DAYS = 21;

export interface MilestoneActionProgress {
  action: ElementalAction;
  /** Scheduled days (since the milestone was created) on which this action was completed. */
  daysDone: number;
}

export interface MilestoneProgressResult {
  benchmark: Benchmark;
  actions: MilestoneActionProgress[];
  /** Completed scheduled days counted toward the target, capped at `target`. */
  daysDone: number;
  target: number;
  /** 0-100, fill-only — misses never subtract. */
  progress: number;
  /** True once the target is reached (or the benchmark is already marked completed). */
  completed: boolean;
}

/**
 * Milestone consistency target: a benchmark (milestone) completes when its
 * scheduled action(s) have been fully completed on MILESTONE_TARGET_DAYS
 * scheduled days since the benchmark was created.
 *
 * Progress is monotonically increasing — it counts completed days only, so a
 * missed scheduled day never lowers it (endowed progress is never revoked).
 * A day counts when the benchmark had at least one action scheduled and every
 * scheduled action that day was completed. Benchmarks already stored as
 * "completed" stay pinned at the full target regardless of later log edits;
 * legacy benchmarks without a status field are treated as active.
 */
export function computeMilestoneProgress(
  benchmark: Benchmark,
  actions: ElementalAction[],
  logIndex: Map<string, DailyLog>,
  target: number = MILESTONE_TARGET_DAYS,
): MilestoneProgressResult {
  const benchmarkActions = actions.filter(
    (a) => a.benchmarkId === benchmark.id,
  );
  const alreadyCompleted = benchmark.status === "completed";

  if (benchmarkActions.length === 0) {
    return {
      benchmark,
      actions: [],
      daysDone: alreadyCompleted ? target : 0,
      target,
      progress: alreadyCompleted ? 100 : 0,
      completed: alreadyCompleted,
    };
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const startDate = new Date(benchmark.createdAt);
  startDate.setHours(0, 0, 0, 0);

  const perActionDays = new Map<string, number>(
    benchmarkActions.map((a) => [a.id, 0]),
  );
  let fullDays = 0;

  const cursor = new Date(startDate);
  while (cursor <= today) {
    const dateStr = getLocalDateString(cursor);
    const dayOfWeek = cursor.toLocaleDateString("en-US", { weekday: "long" });

    let scheduled = 0;
    let completed = 0;
    for (const action of benchmarkActions) {
      if (!action.frequency.includes(dayOfWeek)) continue;
      scheduled++;
      if (logIndex.get(`${action.id}|${dateStr}`)?.status) {
        completed++;
        perActionDays.set(action.id, (perActionDays.get(action.id) ?? 0) + 1);
      }
    }
    if (scheduled > 0 && completed === scheduled) fullDays++;

    cursor.setDate(cursor.getDate() + 1);
  }

  const daysDone = alreadyCompleted ? target : Math.min(fullDays, target);
  const completed = alreadyCompleted || fullDays >= target;

  return {
    benchmark,
    actions: benchmarkActions.map((action) => ({
      action,
      daysDone: perActionDays.get(action.id) ?? 0,
    })),
    daysDone,
    target,
    progress: Math.min(100, Math.round((daysDone / target) * 100)),
    completed,
  };
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
 * Mirrors storage.calculateMomentumScoreForPersona: day-of-week comes from
 * the local-time date object. Days before an action existed are excluded —
 * without that cutoff a mid-month signup starts the month in single digits
 * no matter how perfectly they follow the plan.
 */
export function computeMomentumScore(
  actions: ElementalAction[],
  logs: DailyLog[],
  days: number = 7,
  logIndex: Map<string, DailyLog> = buildLogIndex(logs),
): number {
  if (actions.length === 0) return 0;

  const today = new Date();
  const todayStr = getLocalDateString(today);
  const createdDates = new Map(
    actions.map((a) => [
      a.id,
      a.createdAt ? getLocalDateString(new Date(a.createdAt)) : "",
    ]),
  );
  let totalExpected = 0;
  let totalCompleted = 0;

  for (let i = 0; i < days; i++) {
    const date = new Date(today);
    date.setDate(date.getDate() - i);
    const dateStr = getLocalDateString(date);
    const dayOfWeek = date.toLocaleDateString("en-US", { weekday: "long" });

    for (const action of actions) {
      if (action.frequency.includes(dayOfWeek)) {
        if (dateStr < (createdDates.get(action.id) || "")) {
          continue;
        }
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

export interface WeekStats {
  /** Scheduled action-days in the week (per-action creation dates respected). */
  scheduled: number;
  /** Completed action-days in the week. */
  completed: number;
  /** Weekday name with the most completions; null when nothing was completed. */
  bestDay: string | null;
  /** 0-100 completion rate; 0 when nothing was scheduled. */
  score: number;
}

export interface WeeklyRecapResult {
  /** Local YYYY-MM-DD of the Monday starting the recapped (last complete) week. */
  weekKey: string;
  /** The most recent complete Monday–Sunday week. */
  lastWeek: WeekStats;
  /** The week before that, for consistency movement. */
  prevWeek: WeekStats;
  /** Completions so far in the current week (Monday through today). */
  currentWeekCompleted: number;
}

/** Local midnight of the Monday starting the week containing `date`. */
function startOfWeek(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return d;
}

/**
 * Weekly recap math for the WeeklyRecapCard, derived purely from actions +
 * logs. Weeks run Monday–Sunday in local time. Days before an action existed
 * are never counted as scheduled (each action counts from its creation date),
 * so a first-week user isn't shown a week of phantom misses.
 */
export function computeWeeklyRecap(
  actions: ElementalAction[],
  logs: DailyLog[],
  today: Date = new Date(),
  logIndex: Map<string, DailyLog> = buildLogIndex(logs),
): WeeklyRecapResult {
  const actionStartDates = new Map<string, string>(
    actions.map((a) => [a.id, getLocalDateString(new Date(a.createdAt))]),
  );

  const todayLocal = new Date(today);
  todayLocal.setHours(0, 0, 0, 0);

  const weekStats = (weekStart: Date, endCap: Date | null): WeekStats => {
    let scheduled = 0;
    let completed = 0;
    let bestDay: string | null = null;
    let bestDayCompleted = 0;

    const cursor = new Date(weekStart);
    for (let i = 0; i < 7; i++) {
      if (endCap && cursor > endCap) break;
      const dateStr = getLocalDateString(cursor);
      const dayOfWeek = cursor.toLocaleDateString("en-US", {
        weekday: "long",
      });

      let dayCompleted = 0;
      for (const action of actions) {
        if (!action.frequency.includes(dayOfWeek)) continue;
        const startDate = actionStartDates.get(action.id);
        if (startDate !== undefined && dateStr < startDate) continue;
        scheduled++;
        if (logIndex.get(`${action.id}|${dateStr}`)?.status) {
          completed++;
          dayCompleted++;
        }
      }
      if (dayCompleted > bestDayCompleted) {
        bestDayCompleted = dayCompleted;
        bestDay = dayOfWeek;
      }

      cursor.setDate(cursor.getDate() + 1);
    }

    return {
      scheduled,
      completed,
      bestDay,
      score: scheduled > 0 ? Math.round((completed / scheduled) * 100) : 0,
    };
  };

  const currentWeekStart = startOfWeek(todayLocal);
  const lastWeekStart = new Date(currentWeekStart);
  lastWeekStart.setDate(lastWeekStart.getDate() - 7);
  const prevWeekStart = new Date(currentWeekStart);
  prevWeekStart.setDate(prevWeekStart.getDate() - 14);

  return {
    weekKey: getLocalDateString(lastWeekStart),
    lastWeek: weekStats(lastWeekStart, null),
    prevWeek: weekStats(prevWeekStart, null),
    currentWeekCompleted: weekStats(currentWeekStart, todayLocal).completed,
  };
}

export interface LapseResult {
  /**
   * Consecutive fully-missed scheduled days in the most recent run, ending
   * yesterday at the latest (today is pending, never a lapse). Rest days
   * bridge the run; a day with any completion ends it.
   */
  missedDays: number;
  /** Local YYYY-MM-DD of the most recent fully-missed day; null when no lapse. */
  lastMissedDate: string | null;
}

const LAPSE_LOOKBACK_DAYS = 30;

/**
 * Lapse detection for the gentle re-engagement card and the lapsed reminder
 * copy: how many consecutive scheduled days (walking back from yesterday)
 * were fully missed. Days before an action existed are never missed.
 */
export function computeLapse(
  actions: ElementalAction[],
  logs: DailyLog[],
  logIndex: Map<string, DailyLog> = buildLogIndex(logs),
): LapseResult {
  if (actions.length === 0) {
    return { missedDays: 0, lastMissedDate: null };
  }

  const actionStartDates = new Map<string, string>(
    actions.map((a) => [a.id, getLocalDateString(new Date(a.createdAt))]),
  );

  let missedDays = 0;
  let lastMissedDate: string | null = null;

  const cursor = new Date();
  cursor.setHours(0, 0, 0, 0);
  cursor.setDate(cursor.getDate() - 1);

  for (let i = 0; i < LAPSE_LOOKBACK_DAYS; i++) {
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

    if (scheduled > 0) {
      if (completed > 0) break;
      missedDays++;
      if (lastMissedDate === null) lastMissedDate = dateStr;
    }
    // Rest days bridge the run — keep walking back

    cursor.setDate(cursor.getDate() - 1);
  }

  return { missedDays, lastMissedDate };
}

export interface StreakResult {
  /** Fully-completed scheduled days in the active run (today joins live once complete). */
  current: number;
  /** Best run ever under the same rules. */
  longest: number;
  /** True while the current run is being held together by the streak shield. */
  shieldUsed: boolean;
  /**
   * Local YYYY-MM-DD dates of missed scheduled days that the shield bridged
   * (within the lookback window). The Journey calendar renders these with a
   * shield-outline marker instead of the red "missed" ring.
   */
  shieldedDays: string[];
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
  logIndex: Map<string, DailyLog> = buildLogIndex(logs),
): StreakResult {
  if (actions.length === 0) {
    return { current: 0, longest: 0, shieldUsed: false, shieldedDays: [] };
  }

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
  // Misses forgiven by the shield at the time they happened (kept even if a
  // later second miss reset the run — the bridge was real when it was used)
  const shieldedDays: string[] = [];

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
        shieldedDays.push(dateStr);
      }
    }

    cursor.setDate(cursor.getDate() + 1);
  }

  const shieldUsed =
    run > 0 &&
    lastBridgedMiss !== null &&
    daysBetween(lastBridgedMiss, today) <= SHIELD_WINDOW_DAYS;

  return { current: run, longest, shieldUsed, shieldedDays };
}

/**
 * Shared progress derivation for the eagerly-mounted tabs. Building this once
 * prevents Today, Journey, and AppProvider from each rebuilding the same log
 * index and walking the same history after every completion tap.
 */
export interface ProgressSnapshot {
  logIndex: Map<string, DailyLog>;
  momentumScore: number;
  personaAlignment: number;
  streak: StreakResult;
  lapse: LapseResult;
  weeklyRecap: WeeklyRecapResult;
  milestoneProgress: MilestoneProgressResult[];
  milestoneProgressByBenchmarkId: Map<string, MilestoneProgressResult>;
}

export function buildProgressSnapshot(
  actions: ElementalAction[],
  logs: DailyLog[],
  benchmarks: Benchmark[],
): ProgressSnapshot {
  const logIndex = buildLogIndex(logs);
  const milestoneProgress = benchmarks.map((benchmark) =>
    computeMilestoneProgress(benchmark, actions, logIndex),
  );

  return {
    logIndex,
    momentumScore: computeMomentumScore(actions, logs, 7, logIndex),
    personaAlignment: computeMomentumScore(
      actions,
      logs,
      new Date().getDate(),
      logIndex,
    ),
    streak: computeStreak(actions, logs, logIndex),
    lapse: computeLapse(actions, logs, logIndex),
    weeklyRecap: computeWeeklyRecap(actions, logs, new Date(), logIndex),
    milestoneProgress,
    milestoneProgressByBenchmarkId: new Map(
      milestoneProgress.map((progress) => [progress.benchmark.id, progress]),
    ),
  };
}
