import { Platform } from "react-native";
import { requireOptionalNativeModule } from "expo-modules-core";
import { ElementalAction, DailyLog, Persona } from "@/lib/storage";
import { computeStreak, getLocalDateString } from "@/lib/progress";
import { actionIsScheduledOnDate } from "@/lib/journey-date";
import { buildTodayProgressLine, planDayNumber } from "@/lib/today-layout";
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
  nextActionId: string | null;
  nextActionTitle: string | null;
  nextActionKickstart: string | null;
  /** Remaining actions today, so an optimistic widget tap can advance. */
  remainingActions: WidgetActionData[];
  /** Seven-day schedule lets the widget roll over at midnight without an app open. */
  dayPlans: WidgetDayPlan[];
  // The fields below were added after the first widget release. Swift
  // decodes them as optionals, so a snapshot saved by an older build (and
  // its legacy `copyLine` key) still renders until the app syncs again.
  /** False until a persona exists: the widget shows its set-up state. */
  hasPlan: boolean;
  /** 1-based day of the plan, Today's "Day N" when there is no streak yet. */
  planDay: number;
  /** The streak is being held by a shield, worded "(protected)" like Today. */
  shieldUsed: boolean;
  /** Today's progress line ("0/1 done · 12-day streak"); streak part only on a rest day. */
  progressLine: string;
  /**
   * Local YYYY-MM-DD the plan starts (the persona's createdAt day). A plan
   * set up ahead of time is dated in the future, and the widget needs the
   * real start to show "Starts Jan 1" and to count days after a rollover.
   */
  planStart?: string;
}

export interface WidgetActionData {
  id: string;
  title: string;
  kickstart: string;
}

export interface WidgetDayPlan {
  date: string;
  actions: WidgetActionData[];
}

export interface PendingVote {
  actionId: string;
  date: string;
  kind: "full" | "kickstart";
  source?: "widget" | "siri";
}

/**
 * Progress facts owned by the app's progress snapshot. Passing them in keeps
 * the widget's streak identical to Today's, which counts shields by plan
 * tier; recomputing here would use the free allowance and could disagree.
 */
export interface WidgetProgressInput {
  streak: number;
  shieldUsed: boolean;
  /** Defaults to the persona's plan day, the same rule Today uses. */
  planDay?: number;
}

/** Pure builder so the widget contract is unit-testable. */
export function buildWidgetData(
  actions: ElementalAction[],
  dailyLogs: DailyLog[],
  persona: Persona | null,
  date: Date = new Date(),
  progress?: WidgetProgressInput,
): WidgetData {
  const dateStr = getLocalDateString(date);

  if (!persona) {
    return {
      personaName: "",
      date: dateStr,
      scheduled: 0,
      completed: 0,
      streak: 0,
      isRestDay: false,
      nextActionId: null,
      nextActionTitle: null,
      nextActionKickstart: null,
      remainingActions: [],
      dayPlans: [],
      hasPlan: false,
      planDay: 1,
      shieldUsed: false,
      progressLine: "",
    };
  }

  // Same scheduling rule as Today, so the widget never counts a habit that
  // Today does not show.
  const scheduledFor = (target: Date) =>
    actions.filter((action) => actionIsScheduledOnDate(action, target));

  const scheduledActions = scheduledFor(date);

  const isCompleted = (actionId: string) =>
    dailyLogs.some(
      (l) =>
        l.actionId === actionId &&
        l.logDate.split("T")[0] === dateStr &&
        l.status,
    );

  const completed = scheduledActions.filter((a) => isCompleted(a.id)).length;
  const next = scheduledActions.find((a) => !isCompleted(a.id)) ?? null;
  const fallbackStreak = progress ? null : computeStreak(actions, dailyLogs);
  const streak = progress?.streak ?? fallbackStreak?.current ?? 0;
  const shieldUsed =
    progress?.shieldUsed ?? fallbackStreak?.shieldUsed ?? false;
  // Same start Today counts "Day N" from. An unparseable createdAt would
  // read "NaN-NaN-NaN", which Swift cannot compare, so it is left out.
  const createdAt = new Date(persona.createdAt);
  const planStart = Number.isNaN(createdAt.getTime())
    ? undefined
    : getLocalDateString(createdAt);
  const planDay =
    progress?.planDay ?? planDayNumber(planStart ?? dateStr, dateStr);
  const isRestDay = scheduledActions.length === 0;

  const toWidgetAction = (action: ElementalAction): WidgetActionData => ({
    id: action.id,
    title: action.title,
    kickstart: action.kickstartVersion,
  });
  const remainingActions = scheduledActions
    .filter((action) => !isCompleted(action.id))
    .map(toWidgetAction);
  const dayPlans = Array.from({ length: 7 }, (_, offset) => {
    const target = new Date(date);
    target.setDate(target.getDate() + offset);
    return {
      date: getLocalDateString(target),
      actions: scheduledFor(target).map(toWidgetAction),
    };
  });

  // Today's wording without the month percentage, which a widget has no
  // room for. A rest day has no count, so only the streak part remains.
  const lineParts = buildTodayProgressLine({
    completed,
    scheduled: scheduledActions.length,
    streak,
    shieldUsed,
    planDay,
    consistency: 0,
    showConsistency: false,
  }).parts;
  const progressLine = (isRestDay ? lineParts.slice(1) : lineParts).join(" · ");

  return {
    personaName: persona.name,
    date: dateStr,
    scheduled: scheduledActions.length,
    completed,
    streak,
    isRestDay,
    nextActionId: next?.id ?? null,
    nextActionTitle: next?.title ?? null,
    nextActionKickstart: next?.kickstartVersion || null,
    remainingActions,
    dayPlans,
    hasPlan: true,
    planDay,
    shieldUsed,
    progressLine,
    ...(planStart ? { planStart } : {}),
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
  progress?: WidgetProgressInput,
): void {
  const storage = getStorage();
  if (!storage) return;
  try {
    storage.setItem(
      WIDGET_APP_GROUP,
      WIDGET_DATA_KEY,
      JSON.stringify(
        buildWidgetData(actions, dailyLogs, persona, new Date(), progress),
      ),
    );
    storage.reloadWidgets();
  } catch (error) {
    logger.error("Widget sync failed:", error);
  }
}

/**
 * One vote per (action, day), keeping the first cast. The widget and Siri
 * append to one queue, so a double tap or a widget tap plus a Siri vote can
 * queue the same completion twice.
 */
export function dedupePendingVotes(votes: PendingVote[]): PendingVote[] {
  const seen = new Set<string>();
  return votes.filter((vote) => {
    const key = `${vote.actionId}|${vote.date.split("T")[0]}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
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
    return dedupePendingVotes(
      parsed.filter(
        (v): v is PendingVote =>
          !!v &&
          typeof v.actionId === "string" &&
          typeof v.date === "string" &&
          (v.kind === "full" || v.kind === "kickstart") &&
          (v.source === undefined ||
            v.source === "widget" ||
            v.source === "siri"),
      ),
    );
  } catch (error) {
    logger.error("Failed to read pending widget votes:", error);
    return [];
  }
}
