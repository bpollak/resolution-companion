import type { DailyLog } from "@/lib/storage";

export type DailyLogCompletion = Pick<
  DailyLog,
  "completionSource" | "completionKind"
>;

/** Local calendar day of a log date; legacy records stored full ISO strings. */
export function logDateKey(date: string): string {
  return date.split("T")[0];
}

export function isSameDailyLog(
  log: Pick<DailyLog, "actionId" | "logDate">,
  actionId: string,
  date: string,
): boolean {
  return log.actionId === actionId && logDateKey(log.logDate) === date;
}

/**
 * Idempotent completion for one (action, day). Only ever sets status to
 * true, and returns the input array untouched when the day is already
 * complete so automatic votes (Health, widget, notification) can never
 * un-complete a day or add a second record for it.
 */
export function completeLogIn(
  logs: DailyLog[],
  actionId: string,
  date: string,
  completion: DailyLogCompletion,
  create: () => Pick<DailyLog, "id" | "createdAt">,
): { logs: DailyLog[]; log: DailyLog; changed: boolean } {
  const dateKey = logDateKey(date);
  // Legacy duplicates can hold an incomplete twin ahead of the completed
  // record; any completed one means the vote is already counted.
  const completed = logs.find(
    (log) => log.status && isSameDailyLog(log, actionId, dateKey),
  );
  if (completed) return { logs, log: completed, changed: false };
  const index = logs.findIndex((log) => isSameDailyLog(log, actionId, dateKey));
  if (index >= 0) {
    const log: DailyLog = { ...logs[index], status: true, ...completion };
    const next = [...logs];
    next[index] = log;
    return { logs: next, log, changed: true };
  }
  const log: DailyLog = {
    ...create(),
    actionId,
    logDate: dateKey,
    status: true,
    ...completion,
  };
  return { logs: [...logs, log], log, changed: true };
}

/**
 * Replace a log by id or by (action, day), dropping any other record for the
 * same day. Legacy duplicates heal on the next write instead of letting a
 * stale twin keep a day complete after it was un-checked.
 */
export function upsertLogIn(logs: DailyLog[], log: DailyLog): DailyLog[] {
  const dateKey = logDateKey(log.logDate);
  const matches = (candidate: DailyLog) =>
    candidate.id === log.id || isSameDailyLog(candidate, log.actionId, dateKey);
  const index = logs.findIndex(matches);
  const rest = logs.filter((candidate) => !matches(candidate));
  // A note is the only user-authored text on a log. Healing a duplicate must
  // not delete one that lived on the dropped twin. An explicit `note:
  // undefined` is a deliberate clear (setDailyLogNote), so only a record with
  // no note key at all inherits.
  let next = log;
  if (!("note" in log)) {
    const note = logs.find(
      (candidate) =>
        candidate.id !== log.id && matches(candidate) && candidate.note,
    )?.note;
    if (note) next = { ...log, note };
  }
  if (index < 0) return [...rest, next];
  // Everything before the first match survives, so `index` is still the
  // original position in `rest`.
  rest.splice(index, 0, next);
  return rest;
}
