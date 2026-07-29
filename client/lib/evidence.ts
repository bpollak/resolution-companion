import type {
  Benchmark,
  DailyLog,
  ElementalAction,
  Persona,
  PlanAdjustment,
} from "@/lib/storage";
import type {
  DailyContextEntry,
  DailyContextFactor,
} from "@/lib/daily-context";
import {
  DAILY_CONTEXT_FACTORS,
  DAILY_CONTEXT_FACTOR_LABELS,
  formatDailyContextSummary,
} from "@/lib/daily-context";
import {
  buildLogIndex,
  getLocalDateString,
  MILESTONE_TARGET_DAYS,
} from "@/lib/progress";

export interface StoryArchiveMonth {
  monthKey: string;
  monthLabel: string;
  isCurrent: boolean;
}

export function buildStoryArchiveMonths(
  personaCreatedAt: string,
  today: Date = new Date(),
): StoryArchiveMonth[] {
  const created = new Date(personaCreatedAt);
  const start = Number.isNaN(created.getTime())
    ? new Date(today.getFullYear(), today.getMonth(), 1)
    : new Date(created.getFullYear(), created.getMonth(), 1);
  const end = new Date(today.getFullYear(), today.getMonth(), 1);
  if (start > end) return [];

  const months: StoryArchiveMonth[] = [];
  const cursor = new Date(end);
  while (cursor >= start) {
    const monthKey = getLocalDateString(cursor).slice(0, 7);
    months.push({
      monthKey,
      monthLabel: cursor.toLocaleDateString("en-US", {
        month: "long",
        year: "numeric",
      }),
      isCurrent:
        cursor.getFullYear() === end.getFullYear() &&
        cursor.getMonth() === end.getMonth(),
    });
    cursor.setMonth(cursor.getMonth() - 1);
  }
  return months;
}

function parseLocalDate(dateKey: string): Date {
  const [year, month, day] = dateKey.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function localMiddayIso(dateKey: string): string {
  const date = parseLocalDate(dateKey);
  date.setHours(12, 0, 0, 0);
  return date.toISOString();
}

function actionStartDate(action: ElementalAction): string {
  return getLocalDateString(new Date(action.createdAt));
}

export function inferBenchmarkCompletedAt(
  benchmark: Benchmark,
  actions: ElementalAction[],
  logs: DailyLog[],
  target = MILESTONE_TARGET_DAYS,
  today: Date = new Date(),
): string | null {
  if (benchmark.completedAt) return benchmark.completedAt;
  const benchmarkActions = actions.filter(
    (action) => action.benchmarkId === benchmark.id,
  );
  if (benchmarkActions.length === 0) return null;

  const logIndex = buildLogIndex(logs);
  const actionIds = new Set(benchmarkActions.map((action) => action.id));
  let startKey = getLocalDateString(new Date(benchmark.createdAt));
  for (const log of logs) {
    const dateKey = log.logDate.split("T")[0];
    if (log.status && actionIds.has(log.actionId) && dateKey < startKey) {
      startKey = dateKey;
    }
  }

  let completedDays = 0;
  const cursor = parseLocalDate(startKey);
  const end = new Date(today);
  end.setHours(0, 0, 0, 0);
  while (cursor <= end) {
    const dateKey = getLocalDateString(cursor);
    const weekday = cursor.toLocaleDateString("en-US", { weekday: "long" });
    const scheduled = benchmarkActions.filter((action) =>
      action.frequency.includes(weekday),
    );
    if (
      scheduled.length > 0 &&
      scheduled.every(
        (action) => logIndex.get(`${action.id}|${dateKey}`)?.status === true,
      )
    ) {
      completedDays += 1;
      if (completedDays >= target) return localMiddayIso(dateKey);
    }
    cursor.setDate(cursor.getDate() + 1);
  }
  return null;
}

interface ContextDay {
  entry: DailyContextEntry;
  scheduled: number;
  completed: number;
}

export interface ContextPattern {
  id: string;
  factor: DailyContextFactor;
  side: "helped" | "hindered";
  factorDays: number;
  comparisonDays: number;
  factorRate: number;
  comparisonRate: number;
  headline: string;
  detail: string;
}

export interface ContextPatternResult {
  taggedScheduledDays: number;
  minimumDays: number;
  patterns: ContextPattern[];
}

export function computeContextPatterns(
  actions: ElementalAction[],
  logs: DailyLog[],
  contexts: DailyContextEntry[],
): ContextPatternResult {
  const logIndex = buildLogIndex(logs);
  const days: ContextDay[] = [];
  for (const entry of contexts) {
    const date = parseLocalDate(entry.logDate);
    if (Number.isNaN(date.getTime())) continue;
    const weekday = date.toLocaleDateString("en-US", { weekday: "long" });
    let scheduled = 0;
    let completed = 0;
    for (const action of actions) {
      if (!action.frequency.includes(weekday)) continue;
      const log = logIndex.get(`${action.id}|${entry.logDate}`);
      if (entry.logDate < actionStartDate(action) && !log?.status) continue;
      scheduled += 1;
      if (log?.status) completed += 1;
    }
    if (scheduled > 0) days.push({ entry, scheduled, completed });
  }

  const minimumDays = 14;
  if (days.length < minimumDays) {
    return { taggedScheduledDays: days.length, minimumDays, patterns: [] };
  }

  const patterns: ContextPattern[] = [];
  for (const factor of DAILY_CONTEXT_FACTORS) {
    for (const side of ["helped", "hindered"] as const) {
      const factorDays = days.filter((day) => day.entry[side].includes(factor));
      const comparisonDays = days.filter(
        (day) =>
          !day.entry.helped.includes(factor) &&
          !day.entry.hindered.includes(factor),
      );
      if (factorDays.length < 4 || comparisonDays.length < 4) continue;

      const rate = (group: ContextDay[]) => {
        const scheduled = group.reduce((sum, day) => sum + day.scheduled, 0);
        const completed = group.reduce((sum, day) => sum + day.completed, 0);
        return scheduled > 0 ? Math.round((completed / scheduled) * 100) : 0;
      };
      const factorRate = rate(factorDays);
      const comparisonRate = rate(comparisonDays);
      const difference = factorRate - comparisonRate;
      if (
        (side === "helped" && difference < 5) ||
        (side === "hindered" && difference > -5)
      ) {
        continue;
      }
      const label = DAILY_CONTEXT_FACTOR_LABELS[factor];
      patterns.push({
        id: `${side}-${factor}`,
        factor,
        side,
        factorDays: factorDays.length,
        comparisonDays: comparisonDays.length,
        factorRate,
        comparisonRate,
        headline:
          side === "helped"
            ? `${label} tends to travel with stronger days`
            : `${label} tends to travel with harder days`,
        detail: `You completed ${factorRate}% of scheduled actions when ${label.toLowerCase()} was marked ${side === "helped" ? "helpful" : "as getting in the way"}, compared with ${comparisonRate}% on other context-tagged days. This is an association, not a cause.`,
      });
    }
  }

  patterns.sort(
    (a, b) =>
      Math.abs(b.factorRate - b.comparisonRate) -
      Math.abs(a.factorRate - a.comparisonRate),
  );
  return {
    taggedScheduledDays: days.length,
    minimumDays,
    patterns: patterns.slice(0, 3),
  };
}

export interface ComebackEvidence {
  date: string;
  gapDays: number;
}

export function findComebacks(
  actions: ElementalAction[],
  logs: DailyLog[],
  today: Date = new Date(),
): ComebackEvidence[] {
  if (actions.length === 0) return [];
  const logIndex = buildLogIndex(logs);
  let earliest = actions.reduce(
    (value, action) =>
      actionStartDate(action) < value ? actionStartDate(action) : value,
    actionStartDate(actions[0]),
  );
  for (const log of logs) {
    const dateKey = log.logDate.split("T")[0];
    if (log.status && dateKey < earliest) earliest = dateKey;
  }

  const comebacks: ComebackEvidence[] = [];
  let gapDays = 0;
  const cursor = parseLocalDate(earliest);
  const end = new Date(today);
  end.setHours(0, 0, 0, 0);
  while (cursor <= end) {
    const dateKey = getLocalDateString(cursor);
    const weekday = cursor.toLocaleDateString("en-US", { weekday: "long" });
    let scheduled = 0;
    let completed = 0;
    for (const action of actions) {
      if (!action.frequency.includes(weekday)) continue;
      const log = logIndex.get(`${action.id}|${dateKey}`);
      if (dateKey < actionStartDate(action) && !log?.status) continue;
      scheduled += 1;
      if (log?.status) completed += 1;
    }
    if (scheduled > 0) {
      if (completed === 0) gapDays += 1;
      else {
        if (gapDays >= 2) comebacks.push({ date: dateKey, gapDays });
        gapDays = 0;
      }
    }
    cursor.setDate(cursor.getDate() + 1);
  }
  return comebacks;
}

export type EvidenceTimelineItemType =
  | "daily-context"
  | "action-note"
  | "milestone"
  | "comeback"
  | "plan-adjustment"
  | "monthly-story";

export interface EvidenceTimelineItem {
  id: string;
  date: string;
  type: EvidenceTimelineItemType;
  title: string;
  detail: string;
  monthKey?: string;
}

export function buildEvidenceTimeline({
  persona,
  benchmarks,
  actions,
  logs,
  contexts,
  planAdjustments,
  today = new Date(),
}: {
  persona: Persona;
  benchmarks: Benchmark[];
  actions: ElementalAction[];
  logs: DailyLog[];
  contexts: DailyContextEntry[];
  planAdjustments: PlanAdjustment[];
  today?: Date;
}): EvidenceTimelineItem[] {
  const items: EvidenceTimelineItem[] = [];
  const actionById = new Map(actions.map((action) => [action.id, action]));

  for (const entry of contexts) {
    items.push({
      id: `context-${entry.id}`,
      date: entry.logDate,
      type: "daily-context",
      title: "What shaped the day",
      detail: [formatDailyContextSummary(entry), entry.note]
        .filter(Boolean)
        .join(" — "),
    });
  }
  for (const log of logs) {
    if (!log.status || !log.note) continue;
    const action = actionById.get(log.actionId);
    if (!action) continue;
    items.push({
      id: `note-${log.id}`,
      date: log.logDate.split("T")[0],
      type: "action-note",
      title: action.title,
      detail: log.note,
    });
  }
  for (const benchmark of benchmarks) {
    if (benchmark.status !== "completed" || !benchmark.completedAt) continue;
    items.push({
      id: `milestone-${benchmark.id}`,
      date: getLocalDateString(new Date(benchmark.completedAt)),
      type: "milestone",
      title: "Milestone completed",
      detail: benchmark.title,
    });
  }
  for (const comeback of findComebacks(actions, logs, today)) {
    items.push({
      id: `comeback-${comeback.date}`,
      date: comeback.date,
      type: "comeback",
      title: "You came back",
      detail: `Returned after ${comeback.gapDays} scheduled days away.`,
    });
  }
  for (const adjustment of planAdjustments) {
    const action = actionById.get(adjustment.actionId);
    items.push({
      id: `adjustment-${adjustment.id}`,
      date: getLocalDateString(new Date(adjustment.appliedAt)),
      type: "plan-adjustment",
      title: `Plan tuned${action ? `: ${action.title}` : ""}`,
      detail: adjustment.summary,
    });
  }

  const todayKey = getLocalDateString(today);
  for (const month of buildStoryArchiveMonths(persona.createdAt, today)) {
    const [year, monthNumber] = month.monthKey.split("-").map(Number);
    const monthEnd = getLocalDateString(new Date(year, monthNumber, 0));
    items.push({
      id: `story-${month.monthKey}`,
      date: month.isCurrent ? todayKey : monthEnd,
      type: "monthly-story",
      title: month.isCurrent
        ? `${month.monthLabel} story in progress`
        : `${month.monthLabel} story`,
      detail: "Open Month in Votes",
      monthKey: month.monthKey,
    });
  }

  const priority: Record<EvidenceTimelineItemType, number> = {
    milestone: 0,
    comeback: 1,
    "plan-adjustment": 2,
    "daily-context": 3,
    "action-note": 4,
    "monthly-story": 5,
  };
  return items.sort(
    (a, b) =>
      b.date.localeCompare(a.date) ||
      priority[a.type] - priority[b.type] ||
      a.id.localeCompare(b.id),
  );
}
