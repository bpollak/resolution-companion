import { actionIsScheduledOnDate } from "@/lib/journey-date";
import { buildLogIndex } from "@/lib/progress";
import type { DailyLog, ElementalAction } from "@/lib/storage";

export const REVIEW_ASK_AFTER_DAYS = 2;
export const WRITE_REVIEW_URL =
  "https://apps.apple.com/app/id6757996708?action=write-review";

function dayIsComplete(
  actions: ElementalAction[],
  index: Map<string, DailyLog>,
  day: string,
): boolean {
  const date = new Date(`${day}T12:00:00`);
  const scheduled = actions.filter((a) => actionIsScheduledOnDate(a, date));
  return (
    scheduled.length > 0 &&
    scheduled.every((a) => index.get(`${a.id}|${day}`)?.status === true)
  );
}

/** True when at least one habit was scheduled on `day` and every scheduled
 *  habit has a completed log. Source-agnostic: widget, notification, Health
 *  and manual completions all count. */
export function isDayFullyComplete(args: {
  actions: ElementalAction[];
  logs: DailyLog[];
  day: string;
}): boolean {
  return dayIsComplete(args.actions, buildLogIndex(args.logs), args.day);
}

/** Fully completed days up to and including `today` (YYYY-MM-DD, local). */
export function countFullyCompletedDays(args: {
  actions: ElementalAction[];
  logs: DailyLog[];
  today: string;
}): number {
  const index = buildLogIndex(args.logs);
  const days = new Set<string>();
  for (const log of args.logs) {
    const day = log.logDate.split("T")[0];
    if (log.status && day <= args.today) days.add(day);
  }
  let count = 0;
  for (const day of days) {
    if (dayIsComplete(args.actions, index, day)) count++;
  }
  return count;
}

export type SessionMark = "onboarding" | "paywall";
// Module-level on purpose: resets on process start, so onboarding or the
// paywall only suppresses the ask for the session that showed them.
const sessionMarks = new Set<SessionMark>();
export function markSession(mark: SessionMark): void {
  sessionMarks.add(mark);
}
export function sessionHas(mark: SessionMark): boolean {
  return sessionMarks.has(mark);
}

export function shouldAskForReview(args: {
  completedDays: number;
  todayComplete: boolean;
  alreadyRequested: boolean;
  blocked: boolean;
}): boolean {
  if (args.alreadyRequested || args.blocked || !args.todayComplete) {
    return false;
  }
  if (sessionHas("onboarding") || sessionHas("paywall")) return false;
  return args.completedDays >= REVIEW_ASK_AFTER_DAYS;
}
