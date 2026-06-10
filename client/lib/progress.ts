import type { Benchmark, ElementalAction, DailyLog } from "@/lib/storage";

/**
 * Pure progress/score math shared by AppContext, CalendarScreen, and
 * ProgressScreen. These functions intentionally preserve the existing
 * date-handling quirks (UTC date strings from toISOString, first-match log
 * lookup) so derived values stay identical to the previous inline loops.
 */

function logDateKey(log: DailyLog): string {
  return `${log.actionId}|${log.logDate.split("T")[0]}`;
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
export function getTrackableDays(personaCreatedDate: Date | null, days: number = 30): string[] {
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

    trackableDays.push(date.toISOString().split("T")[0]);
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
  trackableDays: string[]
): BenchmarkProgressResult[] {
  // Day-of-week is derived by re-parsing the UTC date string, matching the
  // previous per-screen loops
  const dayInfos = trackableDays.map((dateStr) => ({
    dateStr,
    dayOfWeek: new Date(dateStr).toLocaleDateString("en-US", { weekday: "long" }),
  }));

  return benchmarks.map((benchmark) => {
    const benchmarkActions = actions.filter((a) => a.benchmarkId === benchmark.id);
    if (benchmarkActions.length === 0) return { benchmark, actions: [], progress: 0 };

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
        progress: actionExpected > 0 ? Math.round((actionCompleted / actionExpected) * 100) : 0,
      };
    });

    return {
      benchmark,
      actions: actionProgress,
      progress: totalExpected > 0 ? Math.round((totalCompleted / totalExpected) * 100) : 0,
    };
  });
}

/**
 * Completion rate (%) over the last `days` days for already persona-scoped
 * actions and logs. days=7 is the momentum score, days=30 persona alignment.
 *
 * Mirrors storage.calculateMomentumScoreForPersona exactly: unlike
 * computeBenchmarkProgress, day-of-week comes from the local-time date object
 * and there is no persona-creation-date cutoff.
 */
export function computeMomentumScore(
  actions: ElementalAction[],
  logs: DailyLog[],
  days: number = 7
): number {
  if (actions.length === 0) return 0;

  const logIndex = buildLogIndex(logs);
  const today = new Date();
  let totalExpected = 0;
  let totalCompleted = 0;

  for (let i = 0; i < days; i++) {
    const date = new Date(today);
    date.setDate(date.getDate() - i);
    const dateStr = date.toISOString().split("T")[0];
    const dayOfWeek = date.toLocaleDateString("en-US", { weekday: "long" });

    for (const action of actions) {
      if (action.frequency.includes(dayOfWeek)) {
        totalExpected++;
        const log = logIndex.get(`${action.id}|${dateStr}`);
        if (log?.status) {
          totalCompleted++;
        }
      }
    }
  }

  return totalExpected > 0 ? Math.round((totalCompleted / totalExpected) * 100) : 0;
}
