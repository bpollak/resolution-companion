import AsyncStorage from "@react-native-async-storage/async-storage";
import { storage } from "@/lib/storage";

jest.mock("@react-native-async-storage/async-storage", () =>
  jest.requireActual(
    "@react-native-async-storage/async-storage/jest/async-storage-mock",
  ),
);

describe("persona-scoped local storage", () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
  });

  it("upserts one daily context per persona and local date", async () => {
    const first = await storage.upsertDailyContext(
      "p1",
      {
        logDate: "2026-07-28",
        helped: ["energy"],
        hindered: [],
      },
      new Date("2026-07-28T10:00:00.000Z"),
    );
    const updated = await storage.upsertDailyContext(
      "p1",
      {
        logDate: "2026-07-28",
        helped: ["support"],
        hindered: ["time"],
        note: "Changed the plan.",
      },
      new Date("2026-07-28T11:00:00.000Z"),
    );
    const secondPersona = await storage.upsertDailyContext(
      "p2",
      {
        logDate: "2026-07-28",
        helped: ["environment"],
        hindered: [],
      },
      new Date("2026-07-28T12:00:00.000Z"),
    );

    expect(updated.id).toBe(first.id);
    expect(updated.createdAt).toBe(first.createdAt);
    expect(updated.updatedAt).not.toBe(first.updatedAt);
    expect(secondPersona.id).not.toBe(first.id);
    expect(await storage.getDailyContexts()).toHaveLength(2);
  });

  it("cascades daily context when its persona is deleted", async () => {
    await storage.setPersonas([
      {
        id: "p1",
        name: "Writer",
        description: "",
        createdAt: "2026-07-01T00:00:00.000Z",
      },
      {
        id: "p2",
        name: "Runner",
        description: "",
        createdAt: "2026-07-01T00:00:00.000Z",
      },
    ]);
    await storage.setActivePersonaId("p1");
    await storage.upsertDailyContext("p1", {
      logDate: "2026-07-28",
      helped: ["energy"],
      hindered: [],
    });
    await storage.upsertDailyContext("p2", {
      logDate: "2026-07-28",
      helped: ["support"],
      hindered: [],
    });
    await storage.setPlanAdjustments([
      {
        id: "adjustment-p1",
        personaId: "p1",
        actionId: "a1",
        appliedAt: "2026-07-28T12:00:00.000Z",
        summary: "First persona",
        before: {
          frequency: ["Monday"],
          anchorLink: "After coffee",
          kickstartVersion: "Open the draft",
        },
        after: {
          frequency: ["Monday"],
          anchorLink: "When coffee pours",
          kickstartVersion: "Open the draft",
        },
      },
      {
        id: "adjustment-p2",
        personaId: "p2",
        actionId: "a2",
        appliedAt: "2026-07-28T12:00:00.000Z",
        summary: "Second persona",
        before: {
          frequency: ["Tuesday"],
          anchorLink: "After lunch",
          kickstartVersion: "Put on shoes",
        },
        after: {
          frequency: ["Tuesday"],
          anchorLink: "When lunch ends",
          kickstartVersion: "Put on shoes",
        },
      },
    ]);

    await storage.deletePersona("p1");

    expect(await storage.getDailyContexts()).toEqual([
      expect.objectContaining({ personaId: "p2" }),
    ]);
    expect(await storage.getPlanAdjustments()).toEqual([
      expect.objectContaining({ personaId: "p2" }),
    ]);
    expect(await storage.getActivePersonaId()).toBe("p2");
  });

  it("includes new local evidence data in Clear All Data", async () => {
    await storage.upsertDailyContext("p1", {
      logDate: "2026-07-28",
      helped: [],
      hindered: [],
      note: "Local note",
    });
    await storage.setPlanAdjustments([
      {
        id: "adjustment-p1",
        personaId: "p1",
        actionId: "a1",
        appliedAt: "2026-07-28T12:00:00.000Z",
        summary: "A local adjustment",
        before: {
          frequency: ["Monday"],
          anchorLink: "After coffee",
          kickstartVersion: "Open the draft",
        },
        after: {
          frequency: ["Monday"],
          anchorLink: "When coffee pours",
          kickstartVersion: "Open the draft",
        },
      },
    ]);
    await storage.clearAll();
    expect(await storage.getDailyContexts()).toEqual([]);
    expect(await storage.getPlanAdjustments()).toEqual([]);
  });

  it("applies a Tune-Up and records its before/after values in one write", async () => {
    await storage.setElementalActions([
      {
        id: "a1",
        benchmarkId: "b1",
        title: "Write",
        frequency: ["Monday", "Wednesday", "Friday"],
        anchorLink: "After coffee",
        kickstartVersion: "Open the draft",
        createdAt: "2026-07-01T00:00:00.000Z",
      },
    ]);
    const result = await storage.applyPlanTuneUp(
      "p1",
      "a1",
      {
        summary: "Bring the cue closer to the routine.",
        changes: { anchorLink: "When I pour coffee" },
      },
      new Date("2026-07-28T12:00:00.000Z"),
    );
    expect(result.action.anchorLink).toBe("When I pour coffee");
    expect(result.adjustment).toMatchObject({
      personaId: "p1",
      actionId: "a1",
      before: { anchorLink: "After coffee" },
      after: { anchorLink: "When I pour coffee" },
    });
    expect(await storage.getElementalActions()).toEqual([result.action]);
    expect(await storage.getPlanAdjustments()).toEqual([result.adjustment]);
  });

  it("leaves settings untouched when a Tune-Up is unchanged", async () => {
    const original = {
      id: "a1",
      benchmarkId: "b1",
      title: "Write",
      frequency: ["Monday"],
      anchorLink: "After coffee",
      kickstartVersion: "Open the draft",
      createdAt: "2026-07-01T00:00:00.000Z",
    };
    await storage.setElementalActions([original]);
    const errorSpy = jest.spyOn(console, "error").mockImplementation(() => {});
    try {
      await expect(
        storage.applyPlanTuneUp("p1", "a1", {
          summary: "Keep the plan as it is.",
          changes: { anchorLink: "After coffee" },
        }),
      ).rejects.toThrow("does not change");
    } finally {
      errorSpy.mockRestore();
    }
    expect(await storage.getElementalActions()).toEqual([original]);
    expect(await storage.getPlanAdjustments()).toEqual([]);
  });

  it("cascades Tune-Up history when its action is deleted", async () => {
    await storage.setElementalActions([
      {
        id: "a1",
        benchmarkId: "b1",
        title: "Write",
        frequency: ["Monday"],
        anchorLink: "After coffee",
        kickstartVersion: "Open the draft",
        createdAt: "2026-07-01T00:00:00.000Z",
      },
    ]);
    await storage.applyPlanTuneUp("p1", "a1", {
      summary: "Use a more immediate cue.",
      changes: { anchorLink: "When I pour coffee" },
    });
    await storage.deleteElementalAction("a1");
    expect(await storage.getPlanAdjustments()).toEqual([]);
  });
});
