import * as Notifications from "expo-notifications";
import * as Device from "expo-device";
import { Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";

const NOTIFICATION_ID_KEY = "evolve_daily_reminder_id";
const NOTIFICATIONS_ENABLED_KEY = "evolve_notifications_enabled";

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

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

export async function scheduleDailyReminder(hour: number = 20, minute: number = 0): Promise<string | null> {
  if (Platform.OS === "web") {
    return null;
  }

  try {
    await cancelDailyReminder();

    const id = await Notifications.scheduleNotificationAsync({
      content: {
        title: "Resolution Companion",
        body: "Have you logged your actions today? Keep your momentum going!",
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

    return id;
  } catch (error) {
    console.error("Failed to schedule notification:", error);
    return null;
  }
}

export async function cancelDailyReminder(): Promise<void> {
  if (Platform.OS === "web") {
    return;
  }

  try {
    const existingId = await AsyncStorage.getItem(NOTIFICATION_ID_KEY);
    if (existingId) {
      await Notifications.cancelScheduledNotificationAsync(existingId);
      await AsyncStorage.removeItem(NOTIFICATION_ID_KEY);
    }
    await AsyncStorage.setItem(NOTIFICATIONS_ENABLED_KEY, "false");
  } catch (error) {
    console.error("Failed to cancel notification:", error);
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
