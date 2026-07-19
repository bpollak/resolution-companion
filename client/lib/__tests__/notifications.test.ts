/**
 * Unit tests for the pure reminder-bucket logic in client/lib/notifications.ts.
 *
 * The module calls Notifications.setNotificationHandler at import time, so
 * expo-notifications (plus expo-device and AsyncStorage) are mocked before
 * the module under test is loaded (jest.mock calls are hoisted above the
 * imports by babel-plugin-jest-hoist).
 */

import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Notifications from "expo-notifications";
import {
  suggestReminderBucket,
  getResolvedReminderTime,
  getUserReminderBucket,
  selectReminderHook,
  reminderBody,
  reminderTitle,
  getRemainingReminderActions,
  scheduleDailyReminder,
  REMINDER_BUCKETS,
  type ReminderHookStats,
} from "@/lib/notifications";
import type { DailyLog, ElementalAction } from "@/lib/storage";

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
    momentum: { taps: 0, opportunities: 0 },
    coach: { taps: 0, opportunities: 0 },
    calm: { taps: 0, opportunities: 0 },
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
      momentum: { taps: 5, opportunities: 8 },
      coach: { taps: 1, opportunities: 8 },
      calm: { taps: 0, opportunities: 8 },
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
      momentum: { taps: 2, opportunities: 3 },
      coach: { taps: 0, opportunities: 3 },
      calm: { taps: 0, opportunities: 3 },
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

  it("chooses the best response rate rather than the largest raw tap count", () => {
    const stats: ReminderHookStats = {
      momentum: { taps: 8, opportunities: 40 },
      coach: { taps: 4, opportunities: 8 },
      calm: { taps: 3, opportunities: 30 },
    };
    const exploitDays = Array.from(
      { length: 18 },
      (_, i) => `2026-10-${String(i + 1).padStart(2, "0")}`,
    );
    const picks = exploitDays.map((day) => selectReminderHook(stats, day));
    expect(picks.filter((pick) => pick === "coach").length).toBeGreaterThan(
      picks.filter((pick) => pick === "momentum").length,
    );
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

  it("names the unfinished action and identity", () => {
    const options = {
      personaName: "5K-Ready Weekend Runner",
      remainingActions: [
        {
          id: "run",
          title: "Run for 20 minutes",
          kickstartVersion: "Put on your running shoes",
        },
      ],
    };
    expect(reminderTitle(options)).toBe("One action left today");
    expect(reminderBody("momentum", options)).toContain("Run for 20 minutes");
    expect(reminderBody("momentum", options)).toContain(
      "5K-Ready Weekend Runner",
    );
  });

  it("uses the real kickstart version for a gentle comeback", () => {
    expect(
      reminderBody("calm", {
        missedRun: 3,
        remainingActions: [
          {
            id: "run",
            title: "Run for 20 minutes",
            kickstartVersion: "Put on your running shoes",
          },
        ],
      }),
    ).toContain("Put on your running shoes");
  });
});

describe("getRemainingReminderActions", () => {
  const action: ElementalAction = {
    id: "run",
    benchmarkId: "benchmark",
    title: "Run for 20 minutes",
    frequency: ["Sunday"],
    anchorLink: "after breakfast",
    kickstartVersion: "Put on running shoes",
    createdAt: "2026-07-01T12:00:00",
  };

  it("includes only actions scheduled and unfinished on that date", () => {
    const sunday = new Date(2026, 6, 19, 12);
    expect(getRemainingReminderActions([action], [], sunday)).toEqual([action]);
    expect(
      getRemainingReminderActions(
        [action],
        [
          {
            id: "log",
            actionId: action.id,
            logDate: "2026-07-19",
            status: true,
            createdAt: "2026-07-19T12:00:00",
          } satisfies DailyLog,
        ],
        sunday,
      ),
    ).toEqual([]);
  });

  it("stays quiet on an unscheduled day", () => {
    expect(
      getRemainingReminderActions([action], [], new Date(2026, 6, 20, 12)),
    ).toEqual([]);
  });
});

describe("personalized reminder plan", () => {
  beforeEach(async () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date(2026, 6, 19, 18, 0));
    await AsyncStorage.clear();
    jest
      .mocked(Notifications.scheduleNotificationAsync)
      .mockReset()
      .mockResolvedValueOnce("today")
      .mockResolvedValueOnce("next-sunday");
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("queues a rolling schedule only on days that have unfinished work", async () => {
    const action: ElementalAction = {
      id: "run",
      benchmarkId: "benchmark",
      title: "Run for 20 minutes",
      frequency: ["Sunday"],
      anchorLink: "after breakfast",
      kickstartVersion: "Put on running shoes",
      createdAt: "2026-07-01T12:00:00",
    };

    await scheduleDailyReminder({
      personaName: "5K-Ready Weekend Runner",
      actions: [action],
      dailyLogs: [],
    });

    expect(Notifications.scheduleNotificationAsync).toHaveBeenCalledTimes(2);
    const first = jest.mocked(Notifications.scheduleNotificationAsync).mock
      .calls[0][0];
    expect(first.content.title).toBe("One action left today");
    expect(first.content.body).toContain("Run for 20 minutes");
    expect(first.content.data).toMatchObject({
      dateKey: "2026-07-19",
      actionIds: ["run"],
    });
    expect(first.trigger).toMatchObject({ type: "date" });
  });
});
