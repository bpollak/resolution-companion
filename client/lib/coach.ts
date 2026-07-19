import type { DailyLog, ElementalAction } from "@/lib/storage";
import { getLocalDateString } from "@/lib/progress";

export interface CoachOpeningContext {
  period: "weekly" | "monthly";
  personaName: string;
  monthlyConsistency: number;
  daysSincePlanStarted?: number;
  weekly?: {
    weekStart: string;
    weekEnd: string;
    completed: number;
    scheduled: number;
  };
}

function parseLocalDate(dateKey: string): Date {
  const [year, month, day] = dateKey.split("-").map(Number);
  return new Date(year, month - 1, day);
}

export function formatCoachDateRange(startKey: string, endKey: string): string {
  const start = parseLocalDate(startKey);
  const end = parseLocalDate(endKey);
  const startLabel = start.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
  });
  const endLabel = end.toLocaleDateString("en-US", {
    month: start.getMonth() === end.getMonth() ? undefined : "long",
    day: "numeric",
  });
  return `${startLabel}–${endLabel}`;
}

/**
 * The opening question is deterministic because it does not benefit from a
 * model round trip. This makes the Coach feel immediate and keeps date labels
 * grounded in the exact period whose progress is being reviewed.
 */
export function buildCoachOpening(context: CoachOpeningContext): string {
  if (context.period === "weekly" && context.weekly) {
    const range = formatCoachDateRange(
      context.weekly.weekStart,
      context.weekly.weekEnd,
    );
    if (context.weekly.completed === 0) {
      return `Looking back at ${range}, nothing was logged—and that is useful information, not a verdict. What is one win from the week that the tracker may not show?`;
    }
    return `Looking back at ${range}, you completed ${context.weekly.completed} of ${context.weekly.scheduled} scheduled actions. What felt like one win for the ${context.personaName} you're becoming?`;
  }

  if (
    context.daysSincePlanStarted !== undefined &&
    context.daysSincePlanStarted <= 7
  ) {
    const startLabel =
      context.daysSincePlanStarted <= 0
        ? "You're just getting started with this plan"
        : `You're only ${context.daysSincePlanStarted} day${context.daysSincePlanStarted === 1 ? "" : "s"} into this plan`;
    return `${startLabel}, so it's too early to judge the numbers. What would make the next few days feel realistic and doable?`;
  }

  const consistency = Math.round(context.monthlyConsistency);
  if (consistency >= 80) {
    return `You're at ${consistency}% consistency since starting this plan. What's been helping the ${context.personaName} you're becoming show up so reliably?`;
  }
  if (consistency < 50) {
    return `You're at ${consistency}% consistency since starting this plan—no judgment, just a signal we can use. Where is the plan creating the most friction right now?`;
  }
  return `You're building at ${consistency}% consistency since starting this plan. What's one part of the routine that is working better than it was before?`;
}

/** Compact, action-level evidence for practical coaching suggestions. */
export function buildCoachActionContext(
  actions: ElementalAction[],
  logs: DailyLog[],
  today: Date = new Date(),
): string | undefined {
  if (actions.length === 0) return undefined;

  const end = new Date(today);
  end.setHours(0, 0, 0, 0);
  const start = new Date(end);
  start.setDate(start.getDate() - 13);
  const logIndex = new Map(
    logs.map((log) => [`${log.actionId}|${log.logDate.split("T")[0]}`, log]),
  );

  return actions
    .slice(0, 5)
    .map((action) => {
      let scheduled = 0;
      let completed = 0;
      const createdKey = getLocalDateString(new Date(action.createdAt));
      const cursor = new Date(start);
      while (cursor <= end) {
        const dateKey = getLocalDateString(cursor);
        const weekday = cursor.toLocaleDateString("en-US", { weekday: "long" });
        if (
          dateKey >= createdKey &&
          action.frequency.includes(weekday) &&
          dateKey !== getLocalDateString(end)
        ) {
          scheduled++;
          if (logIndex.get(`${action.id}|${dateKey}`)?.status) completed++;
        }
        cursor.setDate(cursor.getDate() + 1);
      }
      return `- ${action.title}: ${completed}/${scheduled} scheduled days completed; 2-minute version: ${action.kickstartVersion}; routine anchor: ${action.anchorLink}`;
    })
    .join("\n");
}
