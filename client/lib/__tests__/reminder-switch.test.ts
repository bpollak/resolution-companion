/**
 * The Daily Reminders switch must describe what the phone will actually do.
 * With iOS permission denied nothing can fire, so "On" was a false promise.
 */

import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Notifications from "expo-notifications";
import {
  REMINDER_SETTINGS_HINT,
  reminderSwitchDisplay,
} from "@/lib/reminder-switch";
import { getNotificationPermissionState } from "@/lib/notifications";

jest.mock("expo-notifications", () => ({
  setNotificationHandler: jest.fn(),
  getPermissionsAsync: jest.fn(),
  AndroidImportance: { HIGH: 4 },
  SchedulableTriggerInputTypes: { DAILY: "daily", DATE: "date" },
}));
jest.mock("expo-device", () => ({ isDevice: true }));
jest.mock("@react-native-async-storage/async-storage", () =>
  jest.requireActual(
    "@react-native-async-storage/async-storage/jest/async-storage-mock",
  ),
);

describe("reminderSwitchDisplay", () => {
  it("is on only when reminders are enabled and the system allows them", () => {
    expect(
      reminderSwitchDisplay({ enabled: true, permission: "granted" }),
    ).toEqual({ on: true, needsSettings: false, hint: null });
  });

  it("shows off with a Settings hint when permission is denied", () => {
    expect(
      reminderSwitchDisplay({ enabled: true, permission: "denied" }),
    ).toEqual({ on: false, needsSettings: true, hint: "Turn on in Settings" });
    expect(REMINDER_SETTINGS_HINT).toBe("Turn on in Settings");
  });

  it("keeps the hint when reminders were never enabled but permission is denied", () => {
    expect(
      reminderSwitchDisplay({ enabled: false, permission: "denied" }),
    ).toEqual({ on: false, needsSettings: true, hint: "Turn on in Settings" });
  });

  it("shows plain off before the system has ever asked", () => {
    // A restored backup can carry the enabled flag onto a phone that has
    // not been asked yet: nothing will fire, and flipping the switch asks.
    expect(
      reminderSwitchDisplay({ enabled: true, permission: "undetermined" }),
    ).toEqual({ on: false, needsSettings: false, hint: null });
    expect(
      reminderSwitchDisplay({ enabled: false, permission: "granted" }),
    ).toEqual({ on: false, needsSettings: false, hint: null });
  });
});

describe("getNotificationPermissionState", () => {
  const getPermissions = Notifications.getPermissionsAsync as jest.Mock;

  beforeEach(async () => {
    await AsyncStorage.clear();
  });

  it.each([
    ["granted", "granted"],
    ["denied", "denied"],
    ["undetermined", "undetermined"],
  ])("maps a system status of %s to %s", async (status, expected) => {
    getPermissions.mockResolvedValueOnce({ status });
    await expect(getNotificationPermissionState()).resolves.toBe(expected);
  });

  it("treats a failed lookup as not yet known, never as denied", async () => {
    getPermissions.mockRejectedValueOnce(new Error("unavailable"));
    await expect(getNotificationPermissionState()).resolves.toBe(
      "undetermined",
    );
  });
});
