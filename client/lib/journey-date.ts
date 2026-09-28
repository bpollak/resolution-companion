import type { ElementalAction } from "@/lib/storage";
import { getLocalDateString } from "@/lib/progress";

export function tomorrowDateKey(now = new Date()): string {
  const tomorrow = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate() + 1,
  );
  return getLocalDateString(tomorrow);
}

// Date-only navigation uses the local calendar, never UTC midnight parsing.
export function parseJourneyDate(value?: string): Date | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  return getLocalDateString(date) === value ? date : null;
}

// Calendar history starts on the action's local creation day, including
// a draft that was approved days after it was first written.
export function actionIsScheduledOnDate(
  action: Pick<ElementalAction, "frequency" | "createdAt">,
  date: Date,
): boolean {
  const weekday = date.toLocaleDateString("en-US", { weekday: "long" });
  if (!action.frequency?.includes(weekday)) return false;
  const created = new Date(action.createdAt);
  return (
    Number.isNaN(created.getTime()) ||
    getLocalDateString(date) >= getLocalDateString(created)
  );
}

export function nextScheduledDay<
  T extends { frequency: string[]; createdAt?: string },
>(
  actions: readonly T[],
  now = new Date(),
): { date: Date; dateKey: string; actions: T[] } | null {
  for (let offset = 0; offset < 7; offset += 1) {
    const date = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate() + offset,
    );
    const weekday = date.toLocaleDateString("en-US", { weekday: "long" });
    const scheduled = actions.filter((action) =>
      action.createdAt
        ? actionIsScheduledOnDate(
            { frequency: action.frequency, createdAt: action.createdAt },
            date,
          )
        : action.frequency.includes(weekday),
    );
    if (scheduled.length > 0)
      return { date, dateKey: getLocalDateString(date), actions: scheduled };
  }
  return null;
}
