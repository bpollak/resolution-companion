/**
 * "Clear All Data" must leave nothing behind: every key the app wrote
 * (wherever in the codebase it was written) and every notification it
 * scheduled. Only the anonymous install identity survives, because the
 * server-side purchase record is keyed by it.
 */

import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Notifications from "expo-notifications";
import { storage } from "@/lib/storage";
import {
  areNotificationsEnabled,
  cancelAllScheduledNotifications,
  clearScheduledReminders,
} from "@/lib/notifications";

jest.mock("expo-notifications", () => ({
  setNotificationHandler: jest.fn(),
  scheduleNotificationAsync: jest.fn(),
  cancelScheduledNotificationAsync: jest.fn().mockResolvedValue(undefined),
  cancelAllScheduledNotificationsAsync: jest.fn().mockResolvedValue(undefined),
  dismissAllNotificationsAsync: jest.fn().mockResolvedValue(undefined),
  getAllScheduledNotificationsAsync: jest.fn().mockResolvedValue([]),
  getPermissionsAsync: jest.fn(),
  requestPermissionsAsync: jest.fn(),
  setNotificationChannelAsync: jest.fn(),
  AndroidImportance: { HIGH: 4 },
  SchedulableTriggerInputTypes: { DAILY: "daily", DATE: "date" },
}));

jest.mock("expo-device", () => ({ isDevice: false }));

jest.mock("@react-native-async-storage/async-storage", () =>
  jest.requireActual(
    "@react-native-async-storage/async-storage/jest/async-storage-mock",
  ),
);

describe("storage.clearAll", () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
  });

  it("removes keys written outside the storage module", async () => {
    await AsyncStorage.multiSet([
      ["personas", "[]"],
      ["dailyLogs", "[]"],
      // Written by witness.ts, rewards.ts, notifications.ts, screens, theme
      ["witness_accountability", JSON.stringify({ name: "Sam" })],
      ["unlocked_reward_ids", '["dawn"]'],
      ["reward_coach_tone", "direct"],
      ["evolve_notifications_enabled", "true"],
      ["evolve_daily_reminder_id", '["n1"]'],
      ["evolve_reminder_bucket_user", "evening"],
      ["reminder_primer_answer", "accepted"],
      ["milestone_celebration_seen_ids", '["b1"]'],
      ["coach_memory_taste_used", "true"],
      ["some_key_added_next_year", "1"],
    ]);

    await storage.clearAll();

    expect(await AsyncStorage.getAllKeys()).toEqual([]);
  });

  it("keeps the install identity so a purchase can still be restored", async () => {
    const deviceId = await storage.getDeviceId();
    await AsyncStorage.multiSet([
      ["yearly_price_cohort_v1", "control"],
      ["subscription", JSON.stringify({ isPremium: true })],
      ["witness_accountability", JSON.stringify({ name: "Sam" })],
    ]);

    await storage.clearAll();

    expect((await AsyncStorage.getAllKeys()).sort()).toEqual([
      "deviceId",
      "yearly_price_cohort_v1",
    ]);
    expect(await storage.getDeviceId()).toBe(deviceId);
  });
});

describe("cancelAllScheduledNotifications", () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
    jest.clearAllMocks();
  });

  it("cancels everything scheduled and clears delivered reminders", async () => {
    await AsyncStorage.setItem("evolve_notifications_enabled", "true");
    await AsyncStorage.setItem("evolve_daily_reminder_id", '["n1","n2"]');

    await cancelAllScheduledNotifications();

    expect(
      Notifications.cancelAllScheduledNotificationsAsync,
    ).toHaveBeenCalledTimes(1);
    expect(Notifications.dismissAllNotificationsAsync).toHaveBeenCalledTimes(1);
    expect(await AsyncStorage.getItem("evolve_daily_reminder_id")).toBeNull();
    // A refresh queued behind the clear must not bring reminders back
    expect(await areNotificationsEnabled()).toBe(false);
  });

  it("does not throw when the system call fails", async () => {
    (
      Notifications.cancelAllScheduledNotificationsAsync as jest.Mock
    ).mockRejectedValueOnce(new Error("denied"));
    await expect(cancelAllScheduledNotifications()).resolves.toBeUndefined();
  });
});

describe("clearScheduledReminders (the only plan was deleted)", () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
    jest.clearAllMocks();
  });

  it("cancels pending reminders but keeps the person's preference", async () => {
    await AsyncStorage.setItem("evolve_notifications_enabled", "true");
    await AsyncStorage.setItem("evolve_daily_reminder_id", '["n1","n2"]');

    await clearScheduledReminders();

    expect(Notifications.cancelScheduledNotificationAsync).toHaveBeenCalledWith(
      "n1",
    );
    expect(Notifications.cancelScheduledNotificationAsync).toHaveBeenCalledWith(
      "n2",
    );
    expect(await AsyncStorage.getItem("evolve_daily_reminder_id")).toBeNull();
    // The next plan gets reminders again without asking a second time
    expect(await areNotificationsEnabled()).toBe(true);
    expect(
      Notifications.cancelAllScheduledNotificationsAsync,
    ).not.toHaveBeenCalled();
  });
});
