import { Platform } from "react-native";
import { requireOptionalNativeModule } from "expo-modules-core";
import { ElementalAction, DailyLog, Persona } from "@/lib/storage";
import { computeStreak, getLocalDateString } from "@/lib/progress";
import { logger } from "@/lib/logger";

/**
 * Bridge to the "Cast Your Vote" home/lock-screen widget.
 *
 * The app writes a JSON snapshot of today's state into the shared app-group
 * defaults; the widget's CastVoteIntent queues taps back as pending votes,
 * which the app reconciles into its real store on the next foreground.
 * Keys and shapes must stay in sync with targets/widget/index.swift.
 */

export const WIDGET_APP_GROUP = "group.com.resolutioncompanion.app";
const WIDGET_DATA_KEY = "widgetData";
const PENDING_VOTES_KEY = "pendingVotes";

export interface WidgetData {
  personaName: string;
  date: string;
  scheduled: number;
  completed: number;
  streak: number;
  isRestDay: boolean;
  copyLine: string;
  nextActionId: string | null;
  nextActionTitle: string | null;
  nextActionKickstart: string | null;
}

export interface PendingVote {
  actionId: string;
  date: string;
  kind: "full" | "kickstart";
}

// Rotating identity-framed widget copy — warmth only, never guilt. The
// variant is keyed by date so the widget face changes day to day (the
// Duolingo widget lesson) while staying deterministic for a given day.
const COPY_VARIANTS: ((personaName: string, remaining: number) => string)[] = [
  (name, remaining) =>
    `${remaining} small ${remaining === 1 ? "vote" : "votes"} for ${name} today`,
  (name) => `${name} is one small action away`,
  () => "2 minutes still counts today",
];

/** Pure builder so the widget contract is unit-testable. */
export function buildWidgetData(
  actions: ElementalAction[],
  dailyLogs: DailyLog[],
  persona: Persona | null,
  date: Date = new Date(),
): WidgetData {
  const dateStr = getLocalDateString(date);
  const weekday = date.toLocaleDateString("en-US", { weekday: "long" });

  const scheduledActions = actions.filter((action) => {
    if (!action.frequency.includes(weekday)) return false;
    const created = getLocalDateString(new Date(action.createdAt));
    return created <= dateStr;
  });

  const isCompleted = (actionId: string) =>
    dailyLogs.some(
      (l) =>
        l.actionId === actionId &&
        l.logDate.split("T")[0] === dateStr &&
        l.status,
    );

  const completed = scheduledActions.filter((a) => isCompleted(a.id)).length;
  const next = scheduledActions.find((a) => !isCompleted(a.id)) ?? null;
  const streak = computeStreak(actions, dailyLogs).current;
  const personaName = persona?.name ?? "Future You";
  const remaining = scheduledActions.length - completed;

  let copyLine: string;
  if (scheduledActions.length === 0) {
    copyLine = "Rest is part of becoming.";
  } else if (remaining === 0) {
    copyLine = "Every vote cast today ✓";
  } else {
    let hash = 0;
    for (let i = 0; i < dateStr.length; i++) hash += dateStr.charCodeAt(i);
    copyLine = COPY_VARIANTS[hash % COPY_VARIANTS.length](
      personaName,
      remaining,
    );
  }

  return {
    personaName,
    date: dateStr,
    scheduled: scheduledActions.length,
    completed,
    streak,
    isRestDay: scheduledActions.length === 0,
    copyLine,
    nextActionId: next?.id ?? null,
    nextActionTitle: next?.title ?? null,
    nextActionKickstart: next?.kickstartVersion || null,
  };
}

// Local native module (modules/app-group-storage): App Group UserDefaults
// with a 15.1 deployment target. Null in Expo Go / web, where the bridge
// simply no-ops.
interface AppGroupStorageModule {
  getItem(appGroup: string, key: string): string | null;
  setItem(appGroup: string, key: string, value: string): void;
  removeItem(appGroup: string, key: string): void;
  reloadWidgets(): void;
}

function getStorage(): AppGroupStorageModule | null {
  if (Platform.OS !== "ios") return null;
  return requireOptionalNativeModule<AppGroupStorageModule>("AppGroupStorage");
}

/** Write today's snapshot for the widget and refresh its timeline. */
export function syncWidgetData(
  actions: ElementalAction[],
  dailyLogs: DailyLog[],
  persona: Persona | null,
): void {
  const storage = getStorage();
  if (!storage) return;
  try {
    storage.setItem(
      WIDGET_APP_GROUP,
      WIDGET_DATA_KEY,
      JSON.stringify(buildWidgetData(actions, dailyLogs, persona)),
    );
    storage.reloadWidgets();
  } catch (error) {
    logger.error("Widget sync failed:", error);
  }
}

/**
 * Read and clear votes cast from the widget while the app was closed.
 * Returns [] when there is nothing to reconcile.
 */
export function consumePendingVotes(): PendingVote[] {
  const storage = getStorage();
  if (!storage) return [];
  try {
    const raw = storage.getItem(WIDGET_APP_GROUP, PENDING_VOTES_KEY);
    if (!raw) return [];
    storage.removeItem(WIDGET_APP_GROUP, PENDING_VOTES_KEY);
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (v): v is PendingVote =>
        !!v &&
        typeof v.actionId === "string" &&
        typeof v.date === "string" &&
        (v.kind === "full" || v.kind === "kickstart"),
    );
  } catch (error) {
    logger.error("Failed to read pending widget votes:", error);
    return [];
  }
}
