import * as Notifications from "expo-notifications";
import * as Device from "expo-device";
import { Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { getLocalDateString } from "@/lib/progress";
import { logger } from "@/lib/logger";
import type { DailyLog, ElementalAction } from "@/lib/storage";

const NOTIFICATION_ID_KEY = "evolve_daily_reminder_id";
const NOTIFICATIONS_ENABLED_KEY = "evolve_notifications_enabled";
const DEFAULT_REMINDERS_INITIALIZED_KEY =
  "evolve_default_reminders_initialized";
// "daily" for the legacy generic fallback or "rolling" for the personalized
// 14-day on-device schedule
const REMINDER_MODE_KEY = "evolve_reminder_mode";
// The user's explicit Morning/Midday/Evening pick from Profile — the master
// override for reminder timing
const REMINDER_BUCKET_USER_KEY = "evolve_reminder_bucket_user";
// Bucket derived from the persona's anchor habits; used only when the user
// hasn't picked a time themselves
const REMINDER_BUCKET_SUGGESTED_KEY = "evolve_reminder_bucket_suggested";
const REMINDER_PLAN_SIGNATURE_KEY = "evolve_reminder_plan_signature";
const REMINDER_HORIZON_DAYS = 14;

export type ReminderBucket = "morning" | "midday" | "evening";

// ---------------------------------------------------------------------------
// Portfolio of hooks: the single daily reminder is written in one of three
// voices, and the app learns which voice this user actually responds to.
// "momentum" = identity-progress framing, "coach" = check-in invite,
// "calm" = the gentle generic nudge. A lapsed user always gets the no-guilt
// re-engagement copy regardless of hook — never guilt, never volume; the
// ≤1/day covenant is a brand promise, so the portfolio only changes the words.
// ---------------------------------------------------------------------------

export type ReminderHook = "momentum" | "coach" | "calm";

const HOOK_STATS_KEY = "evolve_reminder_hook_stats";
const ORGANIC_OPENS_KEY = "evolve_reminder_organic_opens";
const HOOK_OPPORTUNITIES_KEY = "evolve_reminder_hook_opportunities";
const HOOK_ROTATION: ReminderHook[] = ["momentum", "coach", "calm"];
// Taps needed before a voice is trusted enough to exploit most days
const HOOK_LEADER_MIN_TAPS = 3;

export type ReminderHookStats = Record<
  ReminderHook,
  { taps: number; opportunities: number }
>;

const EMPTY_HOOK_STATS: ReminderHookStats = {
  momentum: { taps: 0, opportunities: 0 },
  coach: { taps: 0, opportunities: 0 },
  calm: { taps: 0, opportunities: 0 },
};

export async function getReminderHookStats(): Promise<ReminderHookStats> {
  try {
    const raw = await AsyncStorage.getItem(HOOK_STATS_KEY);
    if (!raw) return { ...EMPTY_HOOK_STATS };
    const parsed = JSON.parse(raw) as Partial<ReminderHookStats>;
    return {
      momentum: {
        taps: parsed.momentum?.taps ?? 0,
        opportunities: parsed.momentum?.opportunities ?? 0,
      },
      coach: {
        taps: parsed.coach?.taps ?? 0,
        opportunities: parsed.coach?.opportunities ?? 0,
      },
      calm: {
        taps: parsed.calm?.taps ?? 0,
        opportunities: parsed.calm?.opportunities ?? 0,
      },
    };
  } catch {
    return { ...EMPTY_HOOK_STATS };
  }
}

/**
 * Credit a reminder tap to the voice that earned it. Called when the user
 * opens the app from the daily reminder (AppContext response handler).
 */
export async function recordReminderHookTap(hook: unknown): Promise<void> {
  if (hook !== "momentum" && hook !== "coach" && hook !== "calm") return;
  try {
    const stats = await getReminderHookStats();
    stats[hook] = { ...stats[hook], taps: stats[hook].taps + 1 };
    await AsyncStorage.setItem(HOOK_STATS_KEY, JSON.stringify(stats));
  } catch (error) {
    logger.error("Failed to record reminder tap:", error);
  }
}

/** Track an app open that did not come from a reminder response. */
export async function recordOrganicAppOpen(): Promise<void> {
  try {
    const current = Number(await AsyncStorage.getItem(ORGANIC_OPENS_KEY)) || 0;
    await AsyncStorage.setItem(ORGANIC_OPENS_KEY, String(current + 1));
  } catch (error) {
    logger.error("Failed to record organic app open:", error);
  }
}

/**
 * Record that a hook was actually scheduled. Date markers dedupe the many
 * idempotent reschedules that can happen during one foreground session, so
 * taps/opportunities is a real response rate rather than a render count.
 */
export async function recordReminderHookOpportunity(
  hook: ReminderHook,
  dateStr: string,
): Promise<void> {
  try {
    const raw = await AsyncStorage.getItem(HOOK_OPPORTUNITIES_KEY);
    const seen = raw ? (JSON.parse(raw) as Record<string, ReminderHook>) : {};
    if (seen[dateStr] === hook) return;
    const stats = await getReminderHookStats();
    stats[hook] = {
      ...stats[hook],
      opportunities: stats[hook].opportunities + 1,
    };
    seen[dateStr] = hook;
    const recent = Object.fromEntries(
      Object.entries(seen)
        .sort(([a], [b]) => (a < b ? 1 : -1))
        .slice(0, 45),
    );
    await Promise.all([
      AsyncStorage.setItem(HOOK_STATS_KEY, JSON.stringify(stats)),
      AsyncStorage.setItem(HOOK_OPPORTUNITIES_KEY, JSON.stringify(recent)),
    ]);
  } catch (error) {
    logger.error("Failed to record reminder opportunity:", error);
  }
}

/**
 * Pick tomorrow's voice. Deterministic (keyed by date) so re-scheduling the
 * same day is stable: rotate evenly until one voice has earned enough taps to
 * lead, then use the leader ~2 days in 3 and keep exploring on the third.
 * Exported for tests.
 */
export function selectReminderHook(
  stats: ReminderHookStats,
  dateStr: string,
): ReminderHook {
  let hash = 0;
  for (let i = 0; i < dateStr.length; i++) hash += dateStr.charCodeAt(i);
  const rotated = HOOK_ROTATION[hash % HOOK_ROTATION.length];

  let leader: ReminderHook | null = null;
  for (const hook of HOOK_ROTATION) {
    const responseRate =
      stats[hook].opportunities > 0
        ? stats[hook].taps / stats[hook].opportunities
        : 0;
    const leaderRate =
      leader && stats[leader].opportunities > 0
        ? stats[leader].taps / stats[leader].opportunities
        : 0;
    if (
      stats[hook].taps >= HOOK_LEADER_MIN_TAPS &&
      (leader === null || responseRate > leaderRate)
    ) {
      leader = hook;
    }
  }
  if (leader && hash % 3 !== 0) return leader;
  return rotated;
}

// Category + action ids for the reminder's long-press quick action. The
// action completes the day without opening the app (AppContext handles the
// response), so a busy evening still counts with one press.
export const DAILY_REMINDER_CATEGORY = "daily-reminder";
export const MARK_ALL_DONE_ACTION = "mark-all-done";

/**
 * Registers the "Mark all done" quick action on the daily reminder.
 * Idempotent; call once on app start (no-op on web).
 */
export async function registerReminderActions(): Promise<void> {
  if (Platform.OS === "web") {
    return;
  }
  try {
    await Notifications.setNotificationCategoryAsync(DAILY_REMINDER_CATEGORY, [
      {
        identifier: MARK_ALL_DONE_ACTION,
        buttonTitle: "Mark all done ✓",
        options: { opensAppToForeground: false },
      },
    ]);
  } catch (error) {
    logger.error("Failed to register reminder actions:", error);
  }
}

export const REMINDER_BUCKETS: Record<
  ReminderBucket,
  { hour: number; minute: number; label: string; name: string }
> = {
  morning: { hour: 8, minute: 0, label: "8:00 AM", name: "Morning" },
  midday: { hour: 12, minute: 0, label: "12:00 PM", name: "Midday" },
  evening: { hour: 20, minute: 0, label: "8:00 PM", name: "Evening" },
};

const DEFAULT_BUCKET: ReminderBucket = "evening";

// Keyword → time-of-day mapping for anchor habits ("after my morning
// coffee", "before bed"). Deliberately conservative: ambiguous anchors
// ("at my desk") cast no vote.
const BUCKET_KEYWORDS: Record<ReminderBucket, string[]> = {
  morning: ["morning", "wake", "coffee", "breakfast", "sunrise", "alarm"],
  midday: ["lunch", "noon", "midday", "afternoon"],
  evening: ["dinner", "evening", "bed", "night", "after work", "end of day"],
};

function isReminderBucket(value: string | null): value is ReminderBucket {
  return value === "morning" || value === "midday" || value === "evening";
}

/**
 * Derive a suggested reminder time bucket from the persona's action anchor
 * habits. Each anchor casts one vote for the first bucket it matches;
 * majority wins, ties and no-matches fall back to evening.
 */
export function suggestReminderBucket(anchorLinks: string[]): ReminderBucket {
  const votes: Record<ReminderBucket, number> = {
    morning: 0,
    midday: 0,
    evening: 0,
  };
  for (const anchor of anchorLinks) {
    const text = anchor.toLowerCase();
    const match = (Object.keys(BUCKET_KEYWORDS) as ReminderBucket[]).find(
      (bucket) => BUCKET_KEYWORDS[bucket].some((kw) => text.includes(kw)),
    );
    if (match) votes[match]++;
  }

  let bestBucket: ReminderBucket = DEFAULT_BUCKET;
  let bestVotes = votes[DEFAULT_BUCKET]; // ties go to the evening default
  for (const bucket of ["morning", "midday"] as ReminderBucket[]) {
    if (votes[bucket] > bestVotes) {
      bestBucket = bucket;
      bestVotes = votes[bucket];
    }
  }
  return bestBucket;
}

export async function getUserReminderBucket(): Promise<ReminderBucket | null> {
  try {
    const value = await AsyncStorage.getItem(REMINDER_BUCKET_USER_KEY);
    return isReminderBucket(value) ? value : null;
  } catch {
    return null;
  }
}

export interface ResolvedReminderTime {
  hour: number;
  minute: number;
  label: string;
  bucket: ReminderBucket;
  /** "user" = Profile pick · "routine" = derived from anchors · "default" = 8 PM fallback. */
  source: "user" | "routine" | "default";
}

/** The reminder time currently in effect: user pick > anchor-derived > 8 PM. */
export async function getResolvedReminderTime(): Promise<ResolvedReminderTime> {
  const userBucket = await getUserReminderBucket();
  if (userBucket) {
    return {
      ...REMINDER_BUCKETS[userBucket],
      bucket: userBucket,
      source: "user",
    };
  }
  try {
    const suggested = await AsyncStorage.getItem(REMINDER_BUCKET_SUGGESTED_KEY);
    if (isReminderBucket(suggested)) {
      return {
        ...REMINDER_BUCKETS[suggested],
        bucket: suggested,
        source: "routine",
      };
    }
  } catch {
    // fall through to the default
  }
  return {
    ...REMINDER_BUCKETS[DEFAULT_BUCKET],
    bucket: DEFAULT_BUCKET,
    source: "default",
  };
}

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

export interface ReminderOptions {
  /** Explicit fire time; omitted = the resolved bucket time (user pick > routine > 8 PM). */
  hour?: number;
  minute?: number;
  /** Current streak, for loss-aversion copy once there is one worth keeping. */
  streakCount?: number;
  /** Consecutive fully-missed scheduled days, for gentle lapsed-state copy. */
  missedRun?: number;
  /** Active persona name, for identity-framed momentum copy. */
  personaName?: string;
  /** This month's consistency percent (0–100), for momentum copy. */
  monthlyConsistency?: number;
  /** Local action data used to schedule only relevant days and name unfinished work. */
  actions?: ElementalAction[];
  dailyLogs?: DailyLog[];
  /** First local day eligible for a reminder; used to keep a completed day quiet. */
  startDate?: Date;
  /** Populated internally for the copy assigned to one scheduled day. */
  remainingActions?: Pick<
    ElementalAction,
    "id" | "benchmarkId" | "title" | "kickstartVersion"
  >[];
  /** Active milestone titles keyed by benchmark id for goal-specific copy. */
  milestoneTitles?: Record<string, string>;
}

function truncateReminderText(value: string, maxLength = 72): string {
  const clean = value.replace(/\s+/g, " ").trim();
  return clean.length <= maxLength
    ? clean
    : `${clean.slice(0, maxLength - 1).trimEnd()}…`;
}

/** Scheduled, unfinished actions for one local calendar day. */
export function getRemainingReminderActions(
  actions: ElementalAction[],
  dailyLogs: DailyLog[],
  date: Date,
): ElementalAction[] {
  const dateKey = getLocalDateString(date);
  const weekday = date.toLocaleDateString("en-US", { weekday: "long" });
  const completed = new Set(
    dailyLogs
      .filter((log) => log.status && log.logDate.split("T")[0] === dateKey)
      .map((log) => log.actionId),
  );
  return actions.filter(
    (action) =>
      getLocalDateString(new Date(action.createdAt)) <= dateKey &&
      action.frequency.includes(weekday) &&
      !completed.has(action.id),
  );
}

export function reminderTitle(options: ReminderOptions): string {
  const count = options.remainingActions?.length ?? 0;
  const goalTitles = [
    ...new Set(
      (options.remainingActions ?? [])
        .map((action) => options.milestoneTitles?.[action.benchmarkId])
        .filter((title): title is string => Boolean(title)),
    ),
  ];
  if (options.missedRun !== undefined && options.missedRun >= 2) {
    return "A gentle reset";
  }
  if (count === 1 && goalTitles.length === 1) {
    return `One step toward ${truncateReminderText(goalTitles[0], 38)}`;
  }
  if (count > 1 && goalTitles.length === 1) {
    return `${count} steps toward ${truncateReminderText(goalTitles[0], 38)}`;
  }
  if (count > 1 && goalTitles.length > 1) {
    return `${count} steps toward your goals`;
  }
  if (count === 1) return "One action left today";
  if (count > 1) return `${count} actions left today`;
  return "Resolution Companion";
}

// Copy priority: a lapsed user always gets the plan-can-bend re-engagement
// voice; otherwise the selected hook decides which framing carries today's
// single reminder. Exported for tests.
export function reminderBody(hook: ReminderHook, options: ReminderOptions) {
  const {
    streakCount,
    missedRun,
    personaName,
    monthlyConsistency,
    remainingActions = [],
  } = options;
  const firstAction = remainingActions[0];
  const goalTitle = firstAction
    ? options.milestoneTitles?.[firstAction.benchmarkId]
    : undefined;
  const goalLabel = goalTitle
    ? `“${truncateReminderText(goalTitle, 44)}”`
    : null;
  const actionLabel = firstAction
    ? `“${truncateReminderText(firstAction.title, 48)}”`
    : null;
  if (missedRun !== undefined && missedRun >= 2) {
    if (firstAction?.kickstartVersion) {
      return `Your ${goalLabel ? `${goalLabel} ` : ""}plan can bend: ${truncateReminderText(firstAction.kickstartVersion)} still counts today.`;
    }
    return "Rough couple of days? Your plan can bend — the 2-minute version still counts.";
  }
  if (hook === "momentum") {
    if (actionLabel && goalLabel && personaName) {
      return `${actionLabel} moves ${goalLabel} forward for ${truncateReminderText(personaName, 44)}.`;
    }
    if (actionLabel && goalLabel) {
      return `${actionLabel} moves ${goalLabel} forward today.`;
    }
    if (actionLabel && personaName) {
      return `${actionLabel} is today's vote for ${personaName}.`;
    }
    if (actionLabel) return `${actionLabel} is today's next vote.`;
    if (personaName && monthlyConsistency !== undefined) {
      return `${personaName}: ${Math.round(monthlyConsistency)}% consistent this month. Today's vote is waiting.`;
    }
    if (personaName) {
      return `A 2-minute vote for ${personaName} still counts today.`;
    }
    // fall through to the streak framing below
  }
  if (hook === "coach") {
    if (actionLabel) {
      const extra = remainingActions.length - 1;
      return `Coach's nudge${goalLabel ? ` for ${goalLabel}` : ""}: ${actionLabel}${extra > 0 ? ` and ${extra} more are` : " is"} still open.`;
    }
    return "Two minutes with your coach keeps the plan honest — drop in whenever.";
  }
  if (actionLabel) {
    const extra = remainingActions.length - 1;
    return `${goalLabel ? `For ${goalLabel}: ` : ""}${actionLabel}${extra > 0 ? ` + ${extra} more` : ""} ${extra > 0 ? "are" : "is"} still open today.`;
  }
  if (streakCount !== undefined && streakCount >= 2) {
    return `5 minutes to keep a ${streakCount}-day streak alive.`;
  }
  return "Have you logged your actions today? Keep your momentum going!";
}

export async function requestNotificationPermissions(): Promise<boolean> {
  if (Platform.OS === "web") {
    return false;
  }

  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync("daily-reminder", {
      name: "Daily Reminder",
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: "#00D9FF",
    });
  }

  if (!Device.isDevice) {
    return false;
  }

  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;

  if (existingStatus !== "granted") {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  return finalStatus === "granted";
}

// Cancels the scheduled reminder without touching the enabled flag —
// cancelDailyReminder below is the user-facing "turn it off" path
async function cancelScheduled(): Promise<void> {
  const stored = await AsyncStorage.getItem(NOTIFICATION_ID_KEY);
  if (!stored) return;
  let ids: string[] = [stored];
  try {
    const parsed = JSON.parse(stored) as unknown;
    if (Array.isArray(parsed))
      ids = parsed.filter((id): id is string => typeof id === "string");
  } catch {
    // Legacy releases stored one raw notification id.
  }
  await Promise.all(
    ids.map((id) => Notifications.cancelScheduledNotificationAsync(id)),
  );
  await AsyncStorage.removeItem(NOTIFICATION_ID_KEY);
  await AsyncStorage.removeItem(REMINDER_PLAN_SIGNATURE_KEY);
}

function reminderPlanSignature(
  options: ReminderOptions,
  hour: number,
  minute: number,
): string {
  const startDate = options.startDate ?? new Date();
  return JSON.stringify({
    generatedOn: getLocalDateString(new Date()),
    startsOn: getLocalDateString(startDate),
    hour,
    minute,
    streakCount: options.streakCount ?? null,
    missedRun: options.missedRun ?? null,
    personaName: options.personaName ?? null,
    monthlyConsistency:
      options.monthlyConsistency === undefined
        ? null
        : Math.round(options.monthlyConsistency),
    actions: options.actions?.map((action) => ({
      id: action.id,
      title: action.title,
      frequency: action.frequency,
      kickstartVersion: action.kickstartVersion,
      createdAt: action.createdAt,
    })),
    milestoneTitles: options.milestoneTitles ?? null,
    completed: options.dailyLogs
      ?.filter((log) => log.status)
      .map((log) => `${log.actionId}|${log.logDate.split("T")[0]}`)
      .sort(),
  });
}

export async function scheduleDailyReminder(
  options: ReminderOptions = {},
): Promise<string | null> {
  if (Platform.OS === "web") {
    return null;
  }

  try {
    await cancelScheduled();

    const resolved = await getResolvedReminderTime();
    const hour = options.hour ?? resolved.hour;
    const minute = options.minute ?? resolved.minute;
    const stats = await getReminderHookStats();
    const ids: string[] = [];

    if (options.actions && options.dailyLogs) {
      const now = new Date();
      const firstDay = new Date(options.startDate ?? now);
      firstDay.setHours(0, 0, 0, 0);
      for (let offset = 0; offset < REMINDER_HORIZON_DAYS; offset++) {
        const day = new Date(firstDay);
        day.setDate(day.getDate() + offset);
        const fireDate = new Date(day);
        fireDate.setHours(hour, minute, 0, 0);
        if (fireDate <= now) continue;

        const remainingActions = getRemainingReminderActions(
          options.actions,
          options.dailyLogs,
          day,
        );
        if (remainingActions.length === 0) continue;

        const dateKey = getLocalDateString(day);
        const hook = selectReminderHook(stats, dateKey);
        const dayOptions = { ...options, remainingActions };
        const id = await Notifications.scheduleNotificationAsync({
          content: {
            title: reminderTitle(dayOptions),
            body: reminderBody(hook, dayOptions),
            sound: true,
            data: {
              type: "daily-reminder",
              hook,
              dateKey,
              actionIds: remainingActions.map((action) => action.id),
            },
            categoryIdentifier: DAILY_REMINDER_CATEGORY,
          },
          trigger: {
            type: Notifications.SchedulableTriggerInputTypes.DATE,
            date: fireDate,
            channelId: Platform.OS === "android" ? "daily-reminder" : undefined,
          },
        });
        ids.push(id);
        await recordReminderHookOpportunity(hook, dateKey);
      }
    } else {
      // Safe migration fallback until a screen with local action context runs.
      const dateKey = getLocalDateString(new Date());
      const hook = selectReminderHook(stats, dateKey);
      const id = await Notifications.scheduleNotificationAsync({
        content: {
          title: reminderTitle(options),
          body: reminderBody(hook, options),
          sound: true,
          data: { type: "daily-reminder", hook },
          categoryIdentifier: DAILY_REMINDER_CATEGORY,
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.DAILY,
          hour,
          minute,
          channelId: Platform.OS === "android" ? "daily-reminder" : undefined,
        },
      });
      ids.push(id);
      await recordReminderHookOpportunity(hook, dateKey);
    }

    await AsyncStorage.setItem(NOTIFICATION_ID_KEY, JSON.stringify(ids));
    await AsyncStorage.setItem(
      REMINDER_PLAN_SIGNATURE_KEY,
      reminderPlanSignature(options, hour, minute),
    );
    await AsyncStorage.setItem(NOTIFICATIONS_ENABLED_KEY, "true");
    await AsyncStorage.setItem(
      REMINDER_MODE_KEY,
      options.actions && options.dailyLogs ? "rolling" : "daily",
    );

    return ids[0] ?? null;
  } catch (error) {
    logger.error("Failed to schedule notification:", error);
    return null;
  }
}

export async function cancelDailyReminder(): Promise<void> {
  if (Platform.OS === "web") {
    return;
  }

  try {
    await cancelScheduled();
    await AsyncStorage.removeItem(REMINDER_MODE_KEY);
    await AsyncStorage.setItem(NOTIFICATIONS_ENABLED_KEY, "false");
  } catch (error) {
    logger.error("Failed to cancel notification:", error);
  }
}

/**
 * Enables one personalized daily reminder by default the first time a user
 * has a plan. The operating-system permission prompt remains authoritative;
 * an existing explicit preference is never overwritten.
 */
export async function enableDefaultPersonalizedReminders(
  options: ReminderOptions = {},
): Promise<boolean> {
  if (Platform.OS === "web") return false;

  try {
    const [initialized, storedPreference] = await Promise.all([
      AsyncStorage.getItem(DEFAULT_REMINDERS_INITIALIZED_KEY),
      AsyncStorage.getItem(NOTIFICATIONS_ENABLED_KEY),
    ]);
    if (initialized === "true" || storedPreference !== null) {
      if (initialized !== "true") {
        await AsyncStorage.setItem(DEFAULT_REMINDERS_INITIALIZED_KEY, "true");
      }
      return storedPreference === "true";
    }

    // Persist before asking so a denial never turns into repeated prompting.
    await AsyncStorage.setItem(DEFAULT_REMINDERS_INITIALIZED_KEY, "true");
    const granted = await requestNotificationPermissions();
    if (!granted) {
      await AsyncStorage.setItem(NOTIFICATIONS_ENABLED_KEY, "false");
      return false;
    }

    await scheduleDailyReminder(options);
    return areNotificationsEnabled();
  } catch (error) {
    logger.error("Failed to enable default personalized reminders:", error);
    return false;
  }
}

/**
 * The day is already complete: rebuild the rolling plan beginning tomorrow,
 * so tonight stays quiet without breaking future scheduled-action reminders.
 */
export async function suppressReminderForToday(
  options: ReminderOptions = {},
): Promise<void> {
  if (Platform.OS === "web") {
    return;
  }

  try {
    const enabled = await AsyncStorage.getItem(NOTIFICATIONS_ENABLED_KEY);
    if (enabled !== "true") return;

    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(0, 0, 0, 0);
    await scheduleDailyReminder({ ...options, startDate: tomorrow });
  } catch (error) {
    logger.error("Failed to suppress reminder:", error);
  }
}

/**
 * Refreshes the rolling plan when its date, actions, completions, copy, or
 * chosen time changed. Cheap and idempotent — safe on every app foreground.
 */
export async function ensureReminderScheduled(
  options: ReminderOptions = {},
): Promise<void> {
  if (Platform.OS === "web") {
    return;
  }

  try {
    const enabled = await AsyncStorage.getItem(NOTIFICATIONS_ENABLED_KEY);
    if (enabled !== "true") return;

    const [id, storedSignature, resolved] = await Promise.all([
      AsyncStorage.getItem(NOTIFICATION_ID_KEY),
      AsyncStorage.getItem(REMINDER_PLAN_SIGNATURE_KEY),
      getResolvedReminderTime(),
    ]);
    const signature = reminderPlanSignature(
      options,
      options.hour ?? resolved.hour,
      options.minute ?? resolved.minute,
    );
    if (!id || storedSignature !== signature) {
      await scheduleDailyReminder(options);
    }
  } catch (error) {
    logger.error("Failed to ensure reminder schedule:", error);
  }
}

/**
 * Persist the user's explicit Morning/Midday/Evening choice from Profile and
 * move the personalized rolling plan to the new time.
 */
export async function setUserReminderBucket(
  bucket: ReminderBucket,
  options: ReminderOptions = {},
): Promise<void> {
  if (Platform.OS === "web") {
    return;
  }

  try {
    await AsyncStorage.setItem(REMINDER_BUCKET_USER_KEY, bucket);

    const enabled = await AsyncStorage.getItem(NOTIFICATIONS_ENABLED_KEY);
    if (enabled !== "true") return;

    await scheduleDailyReminder(options);
  } catch (error) {
    logger.error("Failed to set reminder time:", error);
  }
}

/**
 * Records the anchor-derived reminder bucket. When the suggestion changed,
 * the user hasn't picked a time themselves, and the repeating reminder is
 * active, the reminder moves to the newly suggested time.
 */
export async function applySuggestedReminderBucket(
  bucket: ReminderBucket,
  options: ReminderOptions = {},
): Promise<void> {
  if (Platform.OS === "web") {
    return;
  }

  try {
    const previous = await AsyncStorage.getItem(REMINDER_BUCKET_SUGGESTED_KEY);
    if (previous === bucket) return;
    await AsyncStorage.setItem(REMINDER_BUCKET_SUGGESTED_KEY, bucket);

    const [enabled, userBucket] = await Promise.all([
      AsyncStorage.getItem(NOTIFICATIONS_ENABLED_KEY),
      getUserReminderBucket(),
    ]);
    if (enabled === "true" && !userBucket) {
      await scheduleDailyReminder(options);
    }
  } catch (error) {
    logger.error("Failed to apply suggested reminder time:", error);
  }
}

export async function areNotificationsEnabled(): Promise<boolean> {
  if (Platform.OS === "web") {
    return false;
  }

  try {
    const enabled = await AsyncStorage.getItem(NOTIFICATIONS_ENABLED_KEY);
    return enabled === "true";
  } catch {
    return false;
  }
}

export async function getNotificationPermissionStatus(): Promise<boolean> {
  if (Platform.OS === "web") {
    return false;
  }

  try {
    const { status } = await Notifications.getPermissionsAsync();
    return status === "granted";
  } catch {
    return false;
  }
}
