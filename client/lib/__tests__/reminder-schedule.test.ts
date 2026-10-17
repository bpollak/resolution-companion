/**
 * Regression tests for daily-reminder rescheduling (2026-10-13 review, A2/A3).
 * Concurrent reschedules used to interleave cancel/schedule/save and orphan
 * each other's requests, leaving duplicates that survived turning reminders
 * off. The fake scheduler below keeps real state and yields between steps so
 * unserialized runs would interleave.
 */

import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Notifications from "expo-notifications";
import {
  REMINDER_LOCK_TIMEOUT_MS,
  cancelDailyReminder,
  createTimedSerialQueue,
  ensureReminderScheduled,
  scheduleDailyReminder,
  selectMarkAllDoneActions,
  suppressReminderForToday,
  type ReminderOptions,
} from "@/lib/notifications";
import type { DailyLog, ElementalAction } from "@/lib/storage";

interface MockRequest {
  identifier: string;
  content: { data?: Record<string, unknown>; categoryIdentifier?: string };
}

const mockScheduled = new Map<string, MockRequest>();
let mockNextId = 0;
const mockYield = async () => {
  for (let i = 0; i < 3; i++) await Promise.resolve();
};

jest.mock("expo-notifications", () => ({
  setNotificationHandler: jest.fn(),
  scheduleNotificationAsync: jest.fn(
    async (request: { content: MockRequest["content"] }) => {
      await mockYield();
      const identifier = `n${++mockNextId}`;
      mockScheduled.set(identifier, { identifier, content: request.content });
      return identifier;
    },
  ),
  cancelScheduledNotificationAsync: jest.fn(async (identifier: string) => {
    await mockYield();
    mockScheduled.delete(identifier);
  }),
  getAllScheduledNotificationsAsync: jest.fn(async () => {
    await mockYield();
    return [...mockScheduled.values()];
  }),
  getPermissionsAsync: jest.fn(),
  requestPermissionsAsync: jest.fn(),
  setNotificationChannelAsync: jest.fn(),
  AndroidImportance: { HIGH: 4 },
  SchedulableTriggerInputTypes: { DAILY: "daily", DATE: "date" },
}));

jest.mock("expo-device", () => ({ isDevice: true }));

jest.mock("@react-native-async-storage/async-storage", () =>
  jest.requireActual(
    "@react-native-async-storage/async-storage/jest/async-storage-mock",
  ),
);

const EVERY_DAY = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

const walk: ElementalAction = {
  id: "walk",
  benchmarkId: "b1",
  title: "Walk 20 minutes",
  frequency: EVERY_DAY,
  anchorLink: "After dinner",
  kickstartVersion: "Step outside",
  createdAt: "2026-10-01T12:00:00",
};

const options = (dailyLogs: DailyLog[] = []): ReminderOptions => ({
  personaName: "Walker",
  actions: [walk],
  dailyLogs,
});

const reminderIds = () =>
  [...mockScheduled.values()]
    .filter((request) => request.content.data?.type === "daily-reminder")
    .map((request) => request.identifier);

beforeEach(async () => {
  jest.useFakeTimers();
  // Tuesday morning, before the 8 PM default reminder
  jest.setSystemTime(new Date(2026, 9, 13, 9, 0));
  await AsyncStorage.clear();
  mockScheduled.clear();
  mockNextId = 0;
  jest.mocked(Notifications.scheduleNotificationAsync).mockClear();
});

afterEach(() => {
  jest.useRealTimers();
});

describe("serialized reminder rescheduling", () => {
  it("leaves one 14-day set after two concurrent reschedules", async () => {
    await Promise.all([
      scheduleDailyReminder(options()),
      scheduleDailyReminder(options()),
    ]);
    expect(reminderIds()).toHaveLength(14);
    const stored = JSON.parse(
      (await AsyncStorage.getItem("evolve_daily_reminder_id")) ?? "[]",
    );
    expect([...stored].sort()).toEqual(reminderIds().sort());
  });

  it("leaves none when reminders are turned off during reschedules", async () => {
    await scheduleDailyReminder(options());
    const done: DailyLog = {
      id: "l1",
      actionId: "walk",
      logDate: "2026-10-13",
      status: true,
      createdAt: "2026-10-13T16:00:00.000Z",
    };
    await Promise.all([
      ensureReminderScheduled(options()),
      suppressReminderForToday(options([done])),
      scheduleDailyReminder(options()),
      cancelDailyReminder(),
      // Queued behind the cancel: must see reminders are off and stay quiet
      ensureReminderScheduled(options([done])),
    ]);
    expect(reminderIds()).toEqual([]);
    expect(await AsyncStorage.getItem("evolve_notifications_enabled")).toBe(
      "false",
    );
  });

  it("cancels orphaned daily reminders that were never stored", async () => {
    mockScheduled.set("orphan-1", {
      identifier: "orphan-1",
      content: { data: { type: "daily-reminder", dateKey: "2026-10-14" } },
    });
    mockScheduled.set("orphan-legacy", {
      identifier: "orphan-legacy",
      content: { categoryIdentifier: "daily-reminder" },
    });
    mockScheduled.set("unrelated", {
      identifier: "unrelated",
      content: { data: { type: "something-else" } },
    });

    await scheduleDailyReminder(options());
    expect(reminderIds()).toHaveLength(14);
    expect(mockScheduled.has("orphan-1")).toBe(false);

    await cancelDailyReminder();
    expect([...mockScheduled.keys()]).toEqual(["unrelated"]);
  });

  it("does not rebuild the plan when nothing that would be scheduled changed", async () => {
    await scheduleDailyReminder(options());
    const done: DailyLog = {
      id: "l1",
      actionId: "walk",
      logDate: "2026-10-13",
      status: true,
      createdAt: "2026-10-13T16:00:00.000Z",
    };
    await suppressReminderForToday(options([done]));
    const afterSuppress = jest.mocked(Notifications.scheduleNotificationAsync)
      .mock.calls.length;
    expect(reminderIds()).toHaveLength(13);

    // Today re-runs this on every log change once the day is done (a note,
    // say), and a foreground refresh starts from today; both agree.
    await suppressReminderForToday(options([{ ...done, note: "Felt good" }]));
    await ensureReminderScheduled(options([done]));
    expect(
      jest.mocked(Notifications.scheduleNotificationAsync).mock.calls.length,
    ).toBe(afterSuppress);
    expect(reminderIds()).toHaveLength(13);
  });
});

describe("reminder lock timeout", () => {
  it("releases the lock after a hung task so later tasks still run", async () => {
    const errorSpy = jest.spyOn(console, "error").mockImplementation(() => {});
    const enqueue = createTimedSerialQueue(REMINDER_LOCK_TIMEOUT_MS);
    let finishHung: (value: string) => void = () => {};
    const hung = enqueue(
      () =>
        new Promise<string>((resolve) => {
          finishHung = resolve;
        }),
    ).catch((error: Error) => error.message);
    const next = jest.fn(async () => "next");
    const queued = enqueue(next);

    await jest.advanceTimersByTimeAsync(REMINDER_LOCK_TIMEOUT_MS - 1);
    expect(next).not.toHaveBeenCalled();

    await jest.advanceTimersByTimeAsync(1);
    await expect(hung).resolves.toBe("Reminder task timed out");
    await expect(queued).resolves.toBe("next");
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining("releasing the reminder lock"),
    );

    // The abandoned task settling late changes nothing it already reported.
    finishHung("late");
    await expect(hung).resolves.toBe("Reminder task timed out");
    errorSpy.mockRestore();
  });

  it("swallows a late rejection from an abandoned task", async () => {
    const errorSpy = jest.spyOn(console, "error").mockImplementation(() => {});
    const enqueue = createTimedSerialQueue(50);
    let failHung: (error: Error) => void = () => {};
    const hung = enqueue(
      () =>
        new Promise<void>((_, reject) => {
          failHung = reject;
        }),
    );
    const settled = hung.then(
      () => "resolved",
      () => "timed out",
    );
    await jest.advanceTimersByTimeAsync(50);
    await expect(settled).resolves.toBe("timed out");
    failHung(new Error("native call finally failed"));
    await expect(enqueue(async () => "ok")).resolves.toBe("ok");
    errorSpy.mockRestore();
  });

  it("runs tasks in order and leaves no timer behind", async () => {
    const enqueue = createTimedSerialQueue(REMINDER_LOCK_TIMEOUT_MS);
    const order: number[] = [];
    await Promise.all([
      enqueue(async () => {
        await Promise.resolve();
        order.push(1);
      }),
      enqueue(async () => {
        order.push(2);
      }),
    ]);
    expect(order).toEqual([1, 2]);
    expect(jest.getTimerCount()).toBe(0);
  });
});

describe("selectMarkAllDoneActions", () => {
  const read: ElementalAction = {
    ...walk,
    id: "read",
    frequency: ["Monday"],
  };
  const later: ElementalAction = {
    ...walk,
    id: "later",
    createdAt: "2026-10-20T12:00:00",
  };

  it("targets the reminder's named actions scheduled that day", () => {
    expect(
      selectMarkAllDoneActions([walk, read, later], "2026-10-13", ["walk"]).map(
        (action) => action.id,
      ),
    ).toEqual(["walk"]);
  });

  it("falls back to every scheduled, started action for legacy reminders", () => {
    expect(
      selectMarkAllDoneActions(
        [walk, read, later],
        "2026-10-12",
        undefined,
      ).map((action) => action.id),
    ).toEqual(["walk", "read"]);
  });
});
