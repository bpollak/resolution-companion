import * as Notifications from "expo-notifications";
import * as Device from "expo-device";
import { Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { getLocalDateString } from "@/lib/progress";
import { logger } from "@/lib/logger";

const NOTIFICATION_ID_KEY = "evolve_daily_reminder_id";
const NOTIFICATIONS_ENABLED_KEY = "evolve_notifications_enabled";
// "daily" for the repeating reminder, or "oneshot:YYYY-MM-DD" while
// tonight's reminder is suppressed and a single reminder is queued for the
// stored local fire date instead
const REMINDER_MODE_KEY = "evolve_reminder_mode";
// The user's explicit Morning/Midday/Evening pick from Profile — the master
// override for reminder timing
const REMINDER_BUCKET_USER_KEY = "evolve_reminder_bucket_user";
// Bucket derived from the persona's anchor habits; used only when the user
// hasn't picked a time themselves
const REMINDER_BUCKET_SUGGESTED_KEY = "evolve_reminder_bucket_suggested";

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
const HOOK_ROTATION: ReminderHook[] = ["momentum", "coach", "calm"];
// Taps needed before a voice is trusted enough to exploit most days
const HOOK_LEADER_MIN_TAPS = 3;

export type ReminderHookStats = Record<ReminderHook, { taps: number }>;

const EMPTY_HOOK_STATS: ReminderHookStats = {
  momentum: { taps: 0 },
  coach: { taps: 0 },
  calm: { taps: 0 },
};

export async function getReminderHookStats(): Promise<ReminderHookStats> {
  try {
    const raw = await AsyncStorage.getItem(HOOK_STATS_KEY);
    if (!raw) return { ...EMPTY_HOOK_STATS };
    const parsed = JSON.parse(raw) as Partial<ReminderHookStats>;
    return {
      momentum: { taps: parsed.momentum?.taps ?? 0 },
      coach: { taps: parsed.coach?.taps ?? 0 },
      calm: { taps: parsed.calm?.taps ?? 0 },
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
    stats[hook] = { taps: stats[hook].taps + 1 };
    await AsyncStorage.setItem(HOOK_STATS_KEY, JSON.stringify(stats));
  } catch (error) {
    logger.error("Failed to record reminder tap:", error);
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
    if (
      stats[hook].taps >= HOOK_LEADER_MIN_TAPS &&
      (leader === null || stats[hook].taps > stats[leader].taps)
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
}

// Copy priority: a lapsed user always gets the plan-can-bend re-engagement
// voice; otherwise the selected hook decides which framing carries today's
// single reminder. Exported for tests.
export function reminderBody(hook: ReminderHook, options: ReminderOptions) {
  const { streakCount, missedRun, personaName, monthlyConsistency } = options;
  if (missedRun !== undefined && missedRun >= 2) {
    return "Rough couple of days? Your plan can bend — the 2-minute version still counts.";
  }
  if (hook === "momentum") {
    if (personaName && monthlyConsistency !== undefined) {
      return `${personaName}: ${Math.round(monthlyConsistency)}% consistent this month. Today's vote is waiting.`;
    }
    if (personaName) {
      return `A 2-minute vote for ${personaName} still counts today.`;
    }
    // fall through to the streak framing below
  }
  if (hook === "coach") {
    return "Two minutes with your coach keeps the plan honest — drop in whenever.";
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
  const existingId = await AsyncStorage.getItem(NOTIFICATION_ID_KEY);
  if (existingId) {
    await Notifications.cancelScheduledNotificationAsync(existingId);
    await AsyncStorage.removeItem(NOTIFICATION_ID_KEY);
  }
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
    const hook = selectReminderHook(
      await getReminderHookStats(),
      getLocalDateString(new Date()),
    );

    const id = await Notifications.scheduleNotificationAsync({
      content: {
        title: "Resolution Companion",
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

    await AsyncStorage.setItem(NOTIFICATION_ID_KEY, id);
    await AsyncStorage.setItem(NOTIFICATIONS_ENABLED_KEY, "true");
    await AsyncStorage.setItem(REMINDER_MODE_KEY, "daily");

    return id;
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
 * The day is already complete: silence tonight's reminder and queue a single
 * streak-aware reminder for tomorrow (at the resolved bucket time) instead.
 * The repeating daily reminder is restored by ensureReminderScheduled on a
 * later app open.
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

    await cancelScheduled();

    const resolved = await getResolvedReminderTime();
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(
      options.hour ?? resolved.hour,
      options.minute ?? resolved.minute,
      0,
      0,
    );
    // The one-shot fires tomorrow, so pick tomorrow's voice
    const hook = selectReminderHook(
      await getReminderHookStats(),
      getLocalDateString(tomorrow),
    );

    const id = await Notifications.scheduleNotificationAsync({
      content: {
        title: "Resolution Companion",
        body: reminderBody(hook, options),
        sound: true,
        data: { type: "daily-reminder", hook },
        categoryIdentifier: DAILY_REMINDER_CATEGORY,
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: tomorrow,
        channelId: Platform.OS === "android" ? "daily-reminder" : undefined,
      },
    });

    await AsyncStorage.setItem(NOTIFICATION_ID_KEY, id);
    await AsyncStorage.setItem(
      REMINDER_MODE_KEY,
      `oneshot:${getLocalDateString(tomorrow)}`,
    );
  } catch (error) {
    logger.error("Failed to suppress reminder:", error);
  }
}

/**
 * Restores the repeating daily reminder after a one-shot (queued when a day
 * completed) has fired or gone stale. No-op when reminders are disabled,
 * on web, while daily mode is intact, or while a future one-shot is pending.
 * Cheap and idempotent — safe to call on every app foreground.
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

    const mode = await AsyncStorage.getItem(REMINDER_MODE_KEY);
    const id = await AsyncStorage.getItem(NOTIFICATION_ID_KEY);

    if (mode?.startsWith("oneshot:")) {
      const fireDate = mode.slice("oneshot:".length);
      const todayStr = getLocalDateString(new Date());
      // A one-shot due today is equivalent to the daily reminder (both fire
      // today at the resolved time), so anything due today or earlier can be
      // replaced with the repeating schedule
      if (fireDate <= todayStr) {
        await scheduleDailyReminder(options);
      }
    } else if (!id) {
      await scheduleDailyReminder(options);
    }
  } catch (error) {
    logger.error("Failed to ensure reminder schedule:", error);
  }
}

/**
 * Persist the user's explicit Morning/Midday/Evening choice from Profile and
 * move the pending reminder to the new time. When tonight is suppressed
 * (day already complete, one-shot queued for tomorrow), the one-shot is
 * re-queued at the new time instead of resurrecting tonight's reminder.
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

    const mode = await AsyncStorage.getItem(REMINDER_MODE_KEY);
    const todayStr = getLocalDateString(new Date());
    if (
      mode?.startsWith("oneshot:") &&
      mode.slice("oneshot:".length) > todayStr
    ) {
      await suppressReminderForToday(options);
    } else {
      await scheduleDailyReminder(options);
    }
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

    const [enabled, userBucket, mode] = await Promise.all([
      AsyncStorage.getItem(NOTIFICATIONS_ENABLED_KEY),
      getUserReminderBucket(),
      AsyncStorage.getItem(REMINDER_MODE_KEY),
    ]);
    if (enabled === "true" && !userBucket && mode === "daily") {
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
