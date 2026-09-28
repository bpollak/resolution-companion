import AsyncStorage from "@react-native-async-storage/async-storage";
import { storage } from "@/lib/storage";

jest.mock("@react-native-async-storage/async-storage", () =>
  jest.requireActual(
    "@react-native-async-storage/async-storage/jest/async-storage-mock",
  ),
);

describe("ambient coach local storage", () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
  });

  it("upserts daily context once per persona and date", async () => {
    const first = await storage.upsertDailyContextEntry({
      personaId: "persona-1",
      logDate: "2026-08-04",
      factors: { energy: "helped" },
      status: "saved",
    });
    const updated = await storage.upsertDailyContextEntry({
      personaId: "persona-1",
      logDate: "2026-08-04T12:00:00",
      factors: { time: "hindered" },
      note: "Busy day",
      status: "saved",
    });
    expect(updated.id).toBe(first.id);
    expect(await storage.getDailyContextEntries()).toEqual([updated]);
  });

  it("cascades persona and action deletion into private ambient records", async () => {
    await storage.setPersonas([
      {
        id: "persona-1",
        name: "Steady",
        description: "",
        createdAt: "2026-01-01",
      },
    ]);
    await storage.setBenchmarks([
      {
        id: "benchmark-1",
        personaId: "persona-1",
        title: "Milestone",
        targetDate: null,
        status: "active",
        createdAt: "2026-01-01",
      },
    ]);
    await storage.setElementalActions([
      {
        id: "action-1",
        benchmarkId: "benchmark-1",
        title: "Walk",
        frequency: ["Monday"],
        anchorLink: "After lunch",
        kickstartVersion: "Put shoes on",
        createdAt: "2026-01-01",
      },
    ]);
    await storage.setDailyContextEntries([
      {
        id: "context-1",
        personaId: "persona-1",
        logDate: "2026-08-04",
        factors: {},
        status: "dismissed",
        createdAt: "2026-08-04",
        updatedAt: "2026-08-04",
      },
    ]);
    await storage.setPlanAdjustments([
      {
        id: "adjustment-1",
        personaId: "persona-1",
        actionId: "action-1",
        before: {},
        after: { frequency: ["Monday"] },
        rationale: "Test",
        status: "applied",
        createdAt: "2026-08-04",
      },
    ]);
    await storage.deletePersona("persona-1");
    expect(await storage.getDailyContextEntries()).toEqual([]);
    expect(await storage.getPlanAdjustments()).toEqual([]);
  });

  it("cascades action deletion into logs and adjustment audit records", async () => {
    await storage.setElementalActions([
      {
        id: "delete-action",
        benchmarkId: "benchmark-1",
        title: "Delete me",
        frequency: ["Monday"],
        anchorLink: "After lunch",
        kickstartVersion: "Start",
        createdAt: "2026-01-01",
      },
      {
        id: "keep-action",
        benchmarkId: "benchmark-1",
        title: "Keep me",
        frequency: ["Tuesday"],
        anchorLink: "After lunch",
        kickstartVersion: "Start",
        createdAt: "2026-01-01",
      },
    ]);
    await storage.setDailyLogs([
      {
        id: "delete-log",
        actionId: "delete-action",
        logDate: "2026-08-04",
        status: true,
        createdAt: "2026-08-04",
      },
      {
        id: "keep-log",
        actionId: "keep-action",
        logDate: "2026-08-04",
        status: true,
        createdAt: "2026-08-04",
      },
    ]);
    await storage.setPlanAdjustments([
      {
        id: "delete-adjustment",
        personaId: "persona-1",
        actionId: "delete-action",
        before: {},
        after: { frequency: ["Monday"] },
        rationale: "Delete",
        status: "applied",
        createdAt: "2026-08-04",
      },
      {
        id: "keep-adjustment",
        personaId: "persona-1",
        actionId: "keep-action",
        before: {},
        after: { frequency: ["Tuesday"] },
        rationale: "Keep",
        status: "applied",
        createdAt: "2026-08-04",
      },
    ]);

    await storage.deleteElementalAction("delete-action");

    expect((await storage.getElementalActions()).map(({ id }) => id)).toEqual([
      "keep-action",
    ]);
    expect((await storage.getDailyLogs()).map(({ id }) => id)).toEqual([
      "keep-log",
    ]);
    expect((await storage.getPlanAdjustments()).map(({ id }) => id)).toEqual([
      "keep-adjustment",
    ]);
  });

  it("cascades milestone deletion into its actions, logs, and adjustments", async () => {
    await storage.setBenchmarks([
      {
        id: "delete-benchmark",
        personaId: "persona-1",
        title: "Delete me",
        targetDate: null,
        status: "active",
        createdAt: "2026-01-01",
      },
      {
        id: "keep-benchmark",
        personaId: "persona-1",
        title: "Keep me",
        targetDate: null,
        status: "active",
        createdAt: "2026-01-01",
      },
    ]);
    await storage.setElementalActions([
      {
        id: "delete-action",
        benchmarkId: "delete-benchmark",
        title: "Delete me",
        frequency: ["Monday"],
        anchorLink: "After lunch",
        kickstartVersion: "Start",
        createdAt: "2026-01-01",
      },
      {
        id: "keep-action",
        benchmarkId: "keep-benchmark",
        title: "Keep me",
        frequency: ["Tuesday"],
        anchorLink: "After lunch",
        kickstartVersion: "Start",
        createdAt: "2026-01-01",
      },
    ]);
    await storage.setDailyLogs([
      {
        id: "delete-log",
        actionId: "delete-action",
        logDate: "2026-08-04",
        status: true,
        createdAt: "2026-08-04",
      },
      {
        id: "keep-log",
        actionId: "keep-action",
        logDate: "2026-08-04",
        status: true,
        createdAt: "2026-08-04",
      },
    ]);
    await storage.setPlanAdjustments([
      {
        id: "delete-adjustment",
        personaId: "persona-1",
        actionId: "delete-action",
        before: {},
        after: { frequency: ["Monday"] },
        rationale: "Delete",
        status: "applied",
        createdAt: "2026-08-04",
      },
      {
        id: "keep-adjustment",
        personaId: "persona-1",
        actionId: "keep-action",
        before: {},
        after: { frequency: ["Tuesday"] },
        rationale: "Keep",
        status: "applied",
        createdAt: "2026-08-04",
      },
    ]);

    await storage.deleteBenchmark("delete-benchmark");

    expect((await storage.getBenchmarks()).map(({ id }) => id)).toEqual([
      "keep-benchmark",
    ]);
    expect((await storage.getElementalActions()).map(({ id }) => id)).toEqual([
      "keep-action",
    ]);
    expect((await storage.getDailyLogs()).map(({ id }) => id)).toEqual([
      "keep-log",
    ]);
    expect((await storage.getPlanAdjustments()).map(({ id }) => id)).toEqual([
      "keep-adjustment",
    ]);
  });

  it("applies an adjustment and writes its audit record in one multiSet", async () => {
    await storage.setElementalActions([
      {
        id: "action-1",
        benchmarkId: "benchmark-1",
        title: "Walk",
        frequency: ["Monday", "Friday"],
        anchorLink: "After lunch",
        kickstartVersion: "Put shoes on",
        createdAt: "2026-01-01",
      },
    ]);
    const multiSet = jest.spyOn(AsyncStorage, "multiSet");
    multiSet.mockClear();
    const result = await storage.applyPlanAdjustment(
      "action-1",
      "persona-1",
      { frequency: ["Friday"] },
      "A smaller schedule may fit.",
    );
    expect(result?.action.frequency).toEqual(["Friday"]);
    expect(result?.adjustment.before.frequency).toEqual(["Monday", "Friday"]);
    expect(multiSet).toHaveBeenCalledTimes(1);
  });

  it("keeps legacy reflections readable", async () => {
    await storage.setReflections([
      {
        id: "legacy",
        periodType: "monthly",
        userInput: "Hi",
        aiFeedback: "Hello",
        momentumScore: 50,
        createdAt: "2026-01-01",
      },
    ]);
    expect((await storage.getReflections())[0]).toMatchObject({ id: "legacy" });
  });
});
