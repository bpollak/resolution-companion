/**
 * Regression tests for idempotent automatic votes (2026-10-13 review, A1).
 * Health, widget/Siri, and "Mark all done" used to call the toggle, so an
 * overlapping or replayed vote could un-complete a day or write a second
 * record for it.
 */

import AsyncStorage from "@react-native-async-storage/async-storage";
import { completeLogIn, upsertLogIn } from "@/lib/daily-log";
import { storage, type DailyLog } from "@/lib/storage";

jest.mock("@react-native-async-storage/async-storage", () =>
  jest.requireActual(
    "@react-native-async-storage/async-storage/jest/async-storage-mock",
  ),
);

const health = {
  completionSource: "health",
  completionKind: "full",
} as const;

let nextId = 0;
const create = () => ({
  id: `new-${++nextId}`,
  createdAt: "2026-10-13T18:00:00.000Z",
});

function log(overrides: Partial<DailyLog> = {}): DailyLog {
  return {
    id: "log-1",
    actionId: "walk",
    logDate: "2026-10-13",
    status: true,
    createdAt: "2026-10-13T08:00:00.000Z",
    completionSource: "manual",
    completionKind: "full",
    ...overrides,
  };
}

beforeEach(async () => {
  nextId = 0;
  await AsyncStorage.clear();
});

describe("completeLogIn", () => {
  it("adds one completed log when the day has none", () => {
    const result = completeLogIn([], "walk", "2026-10-13", health, create);
    expect(result.changed).toBe(true);
    expect(result.logs).toEqual([
      expect.objectContaining({
        actionId: "walk",
        logDate: "2026-10-13",
        status: true,
        completionSource: "health",
      }),
    ]);
  });

  it("is a no-op when the day is already complete, keeping its source", () => {
    const logs = [log()];
    const result = completeLogIn(logs, "walk", "2026-10-13", health, create);
    expect(result.changed).toBe(false);
    expect(result.logs).toBe(logs);
    expect(result.log.completionSource).toBe("manual");
  });

  it("re-completes an unchecked day in place instead of adding a record", () => {
    const result = completeLogIn(
      [log({ status: false })],
      "walk",
      "2026-10-13",
      health,
      create,
    );
    expect(result.changed).toBe(true);
    expect(result.logs).toHaveLength(1);
    expect(result.logs[0]).toMatchObject({
      id: "log-1",
      status: true,
      completionSource: "health",
    });
  });

  it("matches legacy full-ISO log dates on the local day", () => {
    const result = completeLogIn(
      [log({ logDate: "2026-10-13T07:00:00.000Z" })],
      "walk",
      "2026-10-13",
      health,
      create,
    );
    expect(result.changed).toBe(false);
  });

  it("is a no-op when any duplicate for the day is already complete", () => {
    // A legacy incomplete twin ahead of the completed record must not make
    // an automatic vote re-complete the day and fire analytics again.
    const logs = [log({ id: "stale", status: false }), log()];
    const result = completeLogIn(logs, "walk", "2026-10-13", health, create);
    expect(result.changed).toBe(false);
    expect(result.logs).toBe(logs);
    expect(result.log.id).toBe("log-1");
  });

  it("never un-completes, however many times a vote replays", () => {
    let logs: DailyLog[] = [];
    for (let i = 0; i < 3; i++) {
      logs = completeLogIn(logs, "walk", "2026-10-13", health, create).logs;
    }
    expect(logs).toHaveLength(1);
    expect(logs[0].status).toBe(true);
  });
});

describe("upsertLogIn", () => {
  it("replaces the stored record for the same (action, day) under a new id", () => {
    const stored = [log(), log({ id: "other", actionId: "read" })];
    const next = upsertLogIn(stored, log({ id: "optimistic", status: false }));
    expect(next).toEqual([
      log({ id: "optimistic", status: false }),
      log({ id: "other", actionId: "read" }),
    ]);
  });

  it("heals legacy duplicates for the day on the next write", () => {
    const next = upsertLogIn(
      [log(), log({ id: "dupe", createdAt: "2026-10-13T09:00:00.000Z" })],
      log({ status: false }),
    );
    expect(next).toEqual([log({ status: false })]);
  });

  it("carries a dropped duplicate's note onto a record without one", () => {
    const next = upsertLogIn(
      [log(), log({ id: "dupe", note: "Felt strong" })],
      log({ status: false }),
    );
    expect(next).toEqual([log({ status: false, note: "Felt strong" })]);
  });

  it("keeps the incoming note and honors an explicit clear", () => {
    const stored = [log(), log({ id: "dupe", note: "Old" })];
    expect(upsertLogIn(stored, log({ note: "New" }))).toEqual([
      log({ note: "New" }),
    ]);
    const cleared = upsertLogIn(stored, { ...log(), note: undefined });
    expect(cleared).toHaveLength(1);
    expect(cleared[0].note).toBeUndefined();
  });

  it("gives UI state and storage the same result for legacy duplicates", async () => {
    // AppContext applies upsertLogIn to state while storage.upsertDailyLog
    // persists; matching by id alone in state let the two diverge.
    const stored = [
      log({ id: "dupe-a", status: true, note: "Morning loop" }),
      log({ id: "dupe-b", status: true }),
    ];
    await storage.setDailyLogs(stored);
    const toggled = log({ id: "dupe-b", status: false });
    const uiState = upsertLogIn(stored, toggled);
    await storage.upsertDailyLog(toggled);
    expect(await storage.getDailyLogs()).toEqual(uiState);
    expect(uiState).toEqual([
      log({ id: "dupe-b", status: false, note: "Morning loop" }),
    ]);
  });
});

describe("storage.completeDailyLog", () => {
  it("leaves exactly one completed log after two overlapping runs", async () => {
    // Two Health passes (or a widget vote queued twice) race to persist.
    const results = await Promise.all([
      storage.completeDailyLog("walk", "2026-10-13", health),
      storage.completeDailyLog("walk", "2026-10-13", health),
    ]);
    expect(results.map((result) => result.changed)).toEqual([true, false]);
    const logs = await storage.getDailyLogs();
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({ actionId: "walk", status: true });
  });

  it("does not un-complete a day the user already checked off", async () => {
    await storage.setDailyLogs([log()]);
    const result = await storage.completeDailyLog("walk", "2026-10-13", health);
    expect(result.changed).toBe(false);
    expect(await storage.getDailyLogs()).toEqual([log()]);
  });

  it("uses the optimistic id so UI state and storage agree", async () => {
    await storage.completeDailyLog("walk", "2026-10-13", {
      ...health,
      id: "optimistic",
    });
    expect((await storage.getDailyLogs())[0].id).toBe("optimistic");
  });

  it("keeps one record when a toggle and an automatic vote interleave", async () => {
    await storage.setDailyLogs([log({ status: false })]);
    await Promise.all([
      storage.completeDailyLog("walk", "2026-10-13", health),
      storage.upsertDailyLog(log({ id: "stale-optimistic", status: true })),
    ]);
    const logs = await storage.getDailyLogs();
    expect(logs).toHaveLength(1);
    expect(logs[0].status).toBe(true);
  });
});
