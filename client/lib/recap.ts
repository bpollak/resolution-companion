import { ElementalAction, DailyLog, Persona } from "@/lib/storage";
import { isScheduledOn } from "@/lib/schedule-history";
import {
  buildLogIndex,
  computeStreak,
  getLocalDateString,
  weekdayName,
  type StreakResult,
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
  /** Votes cast with the under-2-minute floor. */
  kickstartVotes: number;
  /** Votes completed automatically from Apple Health. */
  healthVotes: number;
  /** Weekday with the most completions; null when nothing was completed. */
  bestWeekday: string | null;
  /** Broad local time window with the most completions. */
  bestTimeOfDay: string | null;
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
  /** Shields banked during the month through seven clean completions. */
  shieldsEarned: number;
  /** Templated identity-framed closing line. */
  closingLine: string;
}

/**
 * Under this many days since the plan's start, a "year" story would rank
 * months and count active months from a few weeks of history, so the
 * look-back is told as "Your first N weeks" instead.
 */
export const FIRST_WEEKS_MAX_DAYS = 60;

export type YearRecapEdition = "year" | "firstWeeks";

/** Year look-back narrative, free for everyone, generated on device. */
export interface YearRecap {
  year: number;
  yearLabel: string;
  /** "firstWeeks" while the plan is younger than FIRST_WEEKS_MAX_DAYS. */
  edition: YearRecapEdition;
  /** Whole weeks from the plan's start to the end of the story; at least 1. */
  weeksSinceStart: number;
  /** "The Year You Became" or "Your first N weeks". */
  title: string;
  personaName: string;
  votesCast: number;
  scheduled: number;
  consistency: number;
  activeDays: number;
  activeMonths: number;
  kickstartVotes: number;
  healthVotes: number;
  comebacks: number;
  shieldsEarned: number;
  shieldedDays: number;
  bestMonth: { monthKey: string; monthLabel: string; votesCast: number } | null;
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

// Spelled out rather than toLocaleDateString(options): the year recap labels
// every month on each rebuild, and Hermes on iOS can return "" for Intl
// formatting when its data is absent.
const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const;

function monthLabelFor(monthKey: string): string {
  const [year, month] = monthKey.split("-").map(Number);
  return `${MONTH_NAMES[month - 1]} ${year}`;
}

/**
 * Work a caller has already done over the same `logs`. A streak passed here
 * must have been computed with the same `maxShields`; it spans all history,
 * so one result serves every month of a year recap.
 */
export interface RecapPrecomputed {
  logIndex?: Map<string, DailyLog>;
  streak?: StreakResult;
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
  precomputed: RecapPrecomputed = {},
): MonthRecap {
  const logIndex = precomputed.logIndex ?? buildLogIndex(logs);
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
  let kickstartVotes = 0;
  let healthVotes = 0;
  const weekdayCompletions = new Map<string, number>();
  const timeCompletions = new Map<string, number>();

  let longestRun = 0;
  let currentRun = 0;

  // Gap/comeback detection over fully-missed scheduled days
  let comeback: { date: string; gapDays: number } | null = null;
  let currentGap = 0;

  const cursor = new Date(monthStart);
  while (cursor <= endCap) {
    const dateStr = getLocalDateString(cursor);
    const dayOfWeek = weekdayName(cursor);

    let dayScheduled = 0;
    let dayCompleted = 0;
    for (const action of actions) {
      if (!isScheduledOn(action, dateStr, dayOfWeek)) continue;
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
        if (log.completionKind === "kickstart") kickstartVotes++;
        if (log.completionSource === "health") healthVotes++;
        const completedAt = new Date(log.createdAt);
        if (!Number.isNaN(completedAt.getTime())) {
          const hour = completedAt.getHours();
          const timeOfDay =
            hour < 5
              ? "late night"
              : hour < 12
                ? "morning"
                : hour < 17
                  ? "afternoon"
                  : "evening";
          timeCompletions.set(
            timeOfDay,
            (timeCompletions.get(timeOfDay) ?? 0) + 1,
          );
        }
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

  let bestTimeOfDay: string | null = null;
  let bestTimeCount = 0;
  for (const [time, count] of timeCompletions) {
    if (count > bestTimeCount) {
      bestTimeCount = count;
      bestTimeOfDay = time;
    }
  }

  const streak =
    precomputed.streak ?? computeStreak(actions, logs, logIndex, maxShields);
  const shieldedDays = streak.shieldedDays.filter((d) =>
    d.startsWith(monthKey),
  ).length;
  const shieldsEarned = streak.shieldEarnedDays.filter((d) =>
    d.startsWith(monthKey),
  ).length;

  const consistency =
    scheduled > 0 ? Math.round((votesCast / scheduled) * 100) : 0;
  const personaName = persona?.name ?? "Future You";

  let closingLine: string;
  if (votesCast === 0) {
    closingLine = `A quiet month. The slate is clean. Any day can be day one.`;
  } else if (comeback) {
    closingLine = `You came back after ${comeback.gapDays} days away. That's the whole skill. Still becoming ${personaName}.`;
  } else if (consistency >= 80) {
    closingLine = `${votesCast} actions completed at ${consistency}%. ${personaName} isn't a goal anymore. It's a habit.`;
  } else {
    closingLine = `${votesCast} actions completed for ${personaName}. Every one of them counted.`;
  }

  return {
    monthKey,
    monthLabel: monthLabelFor(monthKey),
    personaName,
    votesCast,
    scheduled,
    consistency,
    activeDays,
    kickstartVotes,
    healthVotes,
    bestWeekday,
    bestTimeOfDay,
    longestRun,
    comeback,
    shieldedDays,
    shieldsEarned,
    closingLine,
  };
}

function earliestCreatedAt(actions: ElementalAction[]): string | null {
  let earliest: string | null = null;
  let earliestTime = Infinity;
  for (const action of actions) {
    const time = new Date(action.createdAt).getTime();
    if (Number.isFinite(time) && time < earliestTime) {
      earliestTime = time;
      earliest = action.createdAt;
    }
  }
  return earliest;
}

/**
 * Calendar days from the plan's start day to `end`, in local time. Zero for
 * a plan that starts after `end` (set up ahead for January 1) or has no
 * readable start.
 */
export function daysSincePlanStart(
  planStartedAt: string | null | undefined,
  end: Date,
): number {
  const start = planStartedAt ? new Date(planStartedAt) : null;
  if (!start || Number.isNaN(start.getTime())) return 0;
  const startDay = new Date(
    start.getFullYear(),
    start.getMonth(),
    start.getDate(),
  );
  const endDay = new Date(end.getFullYear(), end.getMonth(), end.getDate());
  // Rounded: a daylight-saving change makes a local day 23 or 25 hours.
  return Math.max(
    0,
    Math.round((endDay.getTime() - startDay.getTime()) / 86_400_000),
  );
}

/** Which story fits the history, and the whole weeks it covers. */
export function yearRecapEdition(daysSinceStart: number): {
  edition: YearRecapEdition;
  weeksSinceStart: number;
} {
  return {
    edition: daysSinceStart < FIRST_WEEKS_MAX_DAYS ? "firstWeeks" : "year",
    weeksSinceStart: Math.max(1, Math.floor(daysSinceStart / 7)),
  };
}

const countOf = (count: number, one: string, many: string) =>
  `${count} ${count === 1 ? one : many}`;

/**
 * The closing card: the plan's own name and one number. "Becoming {name}"
 * reads correctly for any name ("Consistent Runner", "More Active Walker"),
 * which "I became a {name}" does not.
 */
export function yearClosingLine(personaName: string, checkIns: number): string {
  if (checkIns === 0) {
    return `The story is still open. Your next action can begin ${personaName}.`;
  }
  return `Becoming ${personaName}. ${countOf(checkIns, "check-in", "check-ins")} so far.`;
}

/** "first week" for one week, "first N weeks" otherwise. */
const firstWeeksPhrase = (weeks: number) =>
  weeks === 1 ? "first week" : `first ${weeks} weeks`;

export interface YearStoryCopy {
  openingEyebrow: string;
  rhythmHeadline: string;
  rhythmDetail: string;
  closingNote: string;
}

/**
 * The words that differ between the two editions. The first-weeks edition
 * never ranks a month or counts active months: a few weeks cannot support
 * either line.
 */
export function yearStoryCopy(recap: YearRecap): YearStoryCopy {
  if (recap.edition === "firstWeeks") {
    return {
      openingEyebrow: recap.title.toUpperCase(),
      rhythmHeadline: countOf(recap.activeDays, "active day", "active days"),
      rhythmDetail:
        recap.votesCast > 0
          ? `Across your ${firstWeeksPhrase(recap.weeksSinceStart)}.`
          : "Your first action can still write the story.",
      closingNote:
        "No rankings. No perfect week required. Just proof that you showed up.",
    };
  }
  return {
    openingEyebrow: `THE YEAR YOU BECAME · ${recap.yearLabel}`,
    rhythmHeadline: countOf(
      recap.activeMonths,
      "active month",
      "active months",
    ),
    rhythmDetail: recap.bestMonth
      ? `${recap.bestMonth.monthLabel} led the year with ${recap.bestMonth.votesCast} completed actions.`
      : "Your first action can still write the story.",
    closingNote:
      "No rankings. No perfect year required. Just proof that you kept coming back.",
  };
}

/**
 * Build "The Year You Became" from the same monthly stories users already
 * understand. Current-year summaries stop at today, so this also works as an
 * accessible year-so-far view before December.
 */
export function buildYearRecap(
  actions: ElementalAction[],
  logs: DailyLog[],
  persona: Persona | null,
  year: number,
  today: Date = new Date(),
  maxShields = 2,
  precomputed: RecapPrecomputed = {},
): YearRecap {
  const lastMonth = year === today.getFullYear() ? today.getMonth() + 1 : 12;
  // One index and one full-history streak walk shared by all twelve months;
  // rebuilding them per month made this the most expensive Today builder.
  const logIndex = precomputed.logIndex ?? buildLogIndex(logs);
  const shared: RecapPrecomputed = {
    logIndex,
    streak:
      precomputed.streak ?? computeStreak(actions, logs, logIndex, maxShields),
  };
  const months: MonthRecap[] = [];
  for (let month = 1; month <= lastMonth; month++) {
    months.push(
      buildMonthRecap(
        actions,
        logs,
        persona,
        `${year}-${String(month).padStart(2, "0")}`,
        today,
        maxShields,
        shared,
      ),
    );
  }

  const votesCast = months.reduce((sum, month) => sum + month.votesCast, 0);
  const scheduled = months.reduce((sum, month) => sum + month.scheduled, 0);
  const activeDays = months.reduce((sum, month) => sum + month.activeDays, 0);
  const kickstartVotes = months.reduce(
    (sum, month) => sum + month.kickstartVotes,
    0,
  );
  const healthVotes = months.reduce((sum, month) => sum + month.healthVotes, 0);
  const comebacks = months.filter((month) => month.comeback !== null).length;
  const shieldsEarned = months.reduce(
    (sum, month) => sum + month.shieldsEarned,
    0,
  );
  const shieldedDays = months.reduce(
    (sum, month) => sum + month.shieldedDays,
    0,
  );
  const activeMonths = months.filter((month) => month.votesCast > 0).length;
  const best = months.reduce<MonthRecap | null>(
    (winner, month) =>
      !winner || month.votesCast > winner.votesCast ? month : winner,
    null,
  );
  const bestMonth =
    best && best.votesCast > 0
      ? {
          monthKey: best.monthKey,
          monthLabel: best.monthLabel,
          votesCast: best.votesCast,
        }
      : null;
  const consistency =
    scheduled > 0 ? Math.round((votesCast / scheduled) * 100) : 0;
  const personaName = persona?.name ?? "Future You";
  const closingLine = yearClosingLine(personaName, votesCast);
  // Measured over what the story covers. To its end, so a December plan
  // read in January is not credited with weeks the numbers leave out; and
  // from January 1 at the earliest, so a plan from last year read as this
  // year's story in January is not ranked on three weeks of this year.
  const yearStart = new Date(year, 0, 1);
  const yearEnd = new Date(year, 11, 31);
  const planStartedAt = persona?.createdAt ?? earliestCreatedAt(actions);
  const planStart = planStartedAt ? new Date(planStartedAt) : null;
  const { edition, weeksSinceStart } = yearRecapEdition(
    daysSincePlanStart(
      planStart && planStart.getTime() < yearStart.getTime()
        ? yearStart.toISOString()
        : planStartedAt,
      yearEnd < today ? yearEnd : today,
    ),
  );
  const title =
    edition === "firstWeeks"
      ? `Your ${firstWeeksPhrase(weeksSinceStart)}`
      : "The Year You Became";

  return {
    year,
    yearLabel: String(year),
    edition,
    weeksSinceStart,
    title,
    personaName,
    votesCast,
    scheduled,
    consistency,
    activeDays,
    activeMonths,
    kickstartVotes,
    healthVotes,
    comebacks,
    shieldsEarned,
    shieldedDays,
    bestMonth,
    closingLine,
  };
}
