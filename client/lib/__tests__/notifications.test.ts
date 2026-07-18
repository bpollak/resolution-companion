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
  selectReminderHook,
  reminderBody,
  REMINDER_BUCKETS,
  type ReminderHookStats,
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

describe("selectReminderHook", () => {
  const noSignal: ReminderHookStats = {
    momentum: { taps: 0 },
    coach: { taps: 0 },
    calm: { taps: 0 },
  };

  it("rotates deterministically when no voice has earned enough taps", () => {
    const a = selectReminderHook(noSignal, "2026-07-17");
    expect(a).toBe(selectReminderHook(noSignal, "2026-07-17"));
    // Across a run of days, every voice appears at least once
    const days = [
      "2026-07-17",
      "2026-07-18",
      "2026-07-19",
      "2026-07-20",
      "2026-07-21",
      "2026-07-22",
    ];
    const picks = new Set(days.map((d) => selectReminderHook(noSignal, d)));
    expect(picks.size).toBeGreaterThanOrEqual(2);
  });

  it("exploits the leading voice once it has enough taps", () => {
    const stats: ReminderHookStats = {
      momentum: { taps: 5 },
      coach: { taps: 1 },
      calm: { taps: 0 },
    };
    const days = Array.from(
      { length: 12 },
      (_, i) =>
        // vary the hash by walking the day-of-month
        `2026-08-${String(i + 1).padStart(2, "0")}`,
    );
    const picks = days.map((d) => selectReminderHook(stats, d));
    const leaderShare =
      picks.filter((p) => p === "momentum").length / picks.length;
    expect(leaderShare).toBeGreaterThan(0.5);
  });

  it("keeps rotating below the tap threshold", () => {
    const stats: ReminderHookStats = {
      momentum: { taps: 2 },
      coach: { taps: 0 },
      calm: { taps: 0 },
    };
    const days = [
      "2026-09-01",
      "2026-09-02",
      "2026-09-03",
      "2026-09-04",
      "2026-09-05",
      "2026-09-06",
    ];
    const picks = new Set(days.map((d) => selectReminderHook(stats, d)));
    expect(picks.size).toBeGreaterThanOrEqual(2);
  });
});

describe("reminderBody", () => {
  it("always uses the no-guilt re-engagement voice for a lapsed user", () => {
    for (const hook of ["momentum", "coach", "calm"] as const) {
      expect(reminderBody(hook, { missedRun: 2, streakCount: 5 })).toContain(
        "plan can bend",
      );
    }
  });

  it("frames momentum copy around the persona identity", () => {
    expect(
      reminderBody("momentum", {
        personaName: "Consistent Runner",
        monthlyConsistency: 72.4,
      }),
    ).toBe(
      "Consistent Runner: 72% consistent this month. Today's vote is waiting.",
    );
    expect(reminderBody("momentum", { personaName: "Writer" })).toContain(
      "vote for Writer",
    );
  });

  it("falls back to streak copy for momentum without a persona", () => {
    expect(reminderBody("momentum", { streakCount: 4 })).toContain(
      "4-day streak",
    );
  });

  it("invites a check-in for the coach voice", () => {
    expect(reminderBody("coach", { streakCount: 4 })).toContain("coach");
  });

  it("keeps the calm voice gentle and generic", () => {
    expect(reminderBody("calm", {})).toContain("momentum");
  });
});
