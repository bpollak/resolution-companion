/**
 * Unit tests for the pure reminder-bucket logic in client/lib/notifications.ts.
 *
 * The module calls Notifications.setNotificationHandler at import time, so
 * expo-notifications (plus expo-device and AsyncStorage) are mocked before
 * the module under test is loaded (jest.mock calls are hoisted above the
 * imports by babel-plugin-jest-hoist).
 */

import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  suggestReminderBucket,
  getResolvedReminderTime,
  getUserReminderBucket,
  REMINDER_BUCKETS,
} from "@/lib/notifications";

jest.mock("expo-notifications", () => ({
  setNotificationHandler: jest.fn(),
  scheduleNotificationAsync: jest.fn(),
  cancelScheduledNotificationAsync: jest.fn(),
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

describe("suggestReminderBucket", () => {
  it('maps "after my morning coffee" to morning', () => {
    expect(suggestReminderBucket(["after my morning coffee"])).toBe("morning");
  });

  it('maps "during lunch" to midday', () => {
    expect(suggestReminderBucket(["during lunch"])).toBe("midday");
  });

  it('maps "before bed" to evening', () => {
    expect(suggestReminderBucket(["before bed"])).toBe("evening");
  });

  it("lets the majority win across multiple anchors", () => {
    expect(
      suggestReminderBucket([
        "after my morning coffee",
        "when my alarm goes off",
        "during lunch",
      ]),
    ).toBe("morning");
  });

  it("falls back to evening for an empty anchor list", () => {
    expect(suggestReminderBucket([])).toBe("evening");
  });

  it("casts no vote for ambiguous anchors and falls back to evening", () => {
    expect(suggestReminderBucket(["at my desk", "in the car"])).toBe("evening");
  });

  it("resolves a tie with evening in favor of the evening default", () => {
    expect(suggestReminderBucket(["with my coffee", "before bed"])).toBe(
      "evening",
    );
  });

  it("is case-insensitive", () => {
    expect(suggestReminderBucket(["After My MORNING Coffee"])).toBe("morning");
  });
});

describe("reminder bucket resolution", () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
  });

  it("defaults to the 8 PM evening bucket when nothing is stored", async () => {
    const resolved = await getResolvedReminderTime();
    expect(resolved).toEqual({
      ...REMINDER_BUCKETS.evening,
      bucket: "evening",
      source: "default",
    });
    expect(resolved.hour).toBe(20);
  });

  it("uses the anchor-derived suggestion when the user has not picked a time", async () => {
    await AsyncStorage.setItem("evolve_reminder_bucket_suggested", "midday");
    const resolved = await getResolvedReminderTime();
    expect(resolved.bucket).toBe("midday");
    expect(resolved.source).toBe("routine");
    expect(resolved.hour).toBe(12);
  });

  it("prefers the user's explicit pick over the suggestion", async () => {
    await AsyncStorage.setItem("evolve_reminder_bucket_suggested", "midday");
    await AsyncStorage.setItem("evolve_reminder_bucket_user", "morning");
    const resolved = await getResolvedReminderTime();
    expect(resolved.bucket).toBe("morning");
    expect(resolved.source).toBe("user");
    expect(resolved.hour).toBe(8);
  });

  it("ignores corrupt stored bucket values", async () => {
    await AsyncStorage.setItem("evolve_reminder_bucket_user", "midnight");
    expect(await getUserReminderBucket()).toBeNull();
    const resolved = await getResolvedReminderTime();
    expect(resolved.source).toBe("default");
  });
});
