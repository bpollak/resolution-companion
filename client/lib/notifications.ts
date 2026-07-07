import * as Notifications from "expo-notifications";
import * as Device from "expo-device";
import { Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { getLocalDateString } from "@/lib/progress";
import { logger } from "@/lib/logger";

const NOTIFICATION_ID_KEY = "evolve_daily_reminder_id";
const NOTIFICATIONS_ENABLED_KEY = "evolve_notifications_enabled";
// "daily" for the repeating 8 PM reminder, or "oneshot:YYYY-MM-DD" while
// tonight's reminder is suppressed and a single reminder is queued for the
// stored local fire date instead
const REMINDER_MODE_KEY = "evolve_reminder_mode";

const REMINDER_HOUR = 20;
const REMINDER_MINUTE = 0;

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

// Streak-aware evening copy: loss aversion beats a generic nag, but only
// once there is actually a streak at stake
function reminderBody(streakCount?: number): string {
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
  hour: number = REMINDER_HOUR,
  minute: number = REMINDER_MINUTE,
  streakCount?: number,
): Promise<string | null> {
  if (Platform.OS === "web") {
    return null;
  }

  try {
    await cancelScheduled();

    const id = await Notifications.scheduleNotificationAsync({
      content: {
        title: "Resolution Companion",
        body: reminderBody(streakCount),
        sound: true,
        data: { type: "daily-reminder" },
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
 * streak-aware reminder for tomorrow evening instead. The repeating daily
 * reminder is restored by ensureReminderScheduled on a later app open.
 */
export async function suppressReminderForToday(
  streakCount?: number,
): Promise<void> {
  if (Platform.OS === "web") {
    return;
  }

  try {
    const enabled = await AsyncStorage.getItem(NOTIFICATIONS_ENABLED_KEY);
    if (enabled !== "true") return;

    await cancelScheduled();

    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(REMINDER_HOUR, REMINDER_MINUTE, 0, 0);

    const id = await Notifications.scheduleNotificationAsync({
      content: {
        title: "Resolution Companion",
        body: reminderBody(streakCount),
        sound: true,
        data: { type: "daily-reminder" },
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
 */
export async function ensureReminderScheduled(
  streakCount?: number,
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
      // tonight at 8 PM), so anything due today or earlier can be replaced
      // with the repeating schedule
      if (fireDate <= todayStr) {
        await scheduleDailyReminder(
          REMINDER_HOUR,
          REMINDER_MINUTE,
          streakCount,
        );
      }
    } else if (!id) {
      await scheduleDailyReminder(REMINDER_HOUR, REMINDER_MINUTE, streakCount);
    }
  } catch (error) {
    logger.error("Failed to ensure reminder schedule:", error);
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
