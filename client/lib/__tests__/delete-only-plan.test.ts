/**
 * Anyone, free or Premium, can delete their only plan after a confirmation
 * and start again from the empty Today state. Free stays at one plan at a
 * time; deleting is how a free person changes direction.
 */

import AsyncStorage from "@react-native-async-storage/async-storage";
import { planDeletionPrompt } from "@/lib/plan-editing";
import { storage } from "@/lib/storage";

jest.mock("@react-native-async-storage/async-storage", () =>
  jest.requireActual(
    "@react-native-async-storage/async-storage/jest/async-storage-mock",
  ),
);

describe("planDeletionPrompt", () => {
  it("names the plan and what goes with it", () => {
    expect(
      planDeletionPrompt({ name: "Steady Runner", isOnlyPlan: false }),
    ).toEqual({
      title: "Delete plan",
      message:
        'Delete "Steady Runner"? This also removes its milestones, habits, and history.',
      confirmLabel: "Delete",
    });
  });

  it("tells someone deleting their only plan what happens next", () => {
    const prompt = planDeletionPrompt({
      name: "Steady Runner",
      isOnlyPlan: true,
    });
    expect(prompt.title).toBe("Delete plan");
    expect(prompt.message).toBe(
      'Delete "Steady Runner"? This also removes its milestones, habits, and history. You can start a new plan right after.',
    );
  });

  it("uses plain words: no dashes, no internal vocabulary, no guilt", () => {
    for (const isOnlyPlan of [true, false]) {
      const { title, message, confirmLabel } = planDeletionPrompt({
        name: "X",
        isOnlyPlan,
      });
      const text = `${title} ${message} ${confirmLabel}`;
      expect(text).not.toMatch(/—|persona|benchmark|vote|lose|give up/i);
    }
  });
});

describe("deleting the only plan", () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
    await storage.setPersonas([
      {
        id: "p1",
        name: "Steady Runner",
        description: "",
        createdAt: "2026-11-01T09:00:00",
      },
    ]);
    await storage.setActivePersonaId("p1");
    await storage.setHasOnboarded(true);
    await storage.setBenchmarks([
      {
        id: "b1",
        personaId: "p1",
        title: "First 21 days",
        targetDate: null,
        status: "active",
        createdAt: "2026-11-01T09:00:00",
      },
    ]);
    await storage.setElementalActions([
      {
        id: "a1",
        benchmarkId: "b1",
        title: "Walk",
        frequency: ["Monday"],
        anchorLink: "",
        kickstartVersion: "",
        createdAt: "2026-11-01T09:00:00",
      },
    ]);
    await storage.setDailyLogs([
      {
        id: "l1",
        actionId: "a1",
        logDate: "2026-11-02",
        status: true,
        createdAt: "2026-11-02T09:00:00",
      },
    ]);
  });

  it("leaves the empty first-run state, ready for a new plan", async () => {
    await storage.deletePersona("p1");

    expect(await storage.getPersonas()).toEqual([]);
    expect(await storage.getActivePersona()).toBeNull();
    expect(await storage.getHasOnboarded()).toBe(false);
    expect(await storage.getBenchmarks()).toEqual([]);
    expect(await storage.getElementalActions()).toEqual([]);
    expect(await storage.getDailyLogs()).toEqual([]);
  });

  it("keeps what is not part of the plan", async () => {
    const deviceId = await storage.getDeviceId();
    await storage.setAiConsent(true);
    await storage.deletePersona("p1");
    expect(await storage.getDeviceId()).toBe(deviceId);
    expect(await storage.getAiConsent()).toBe(true);
  });
});
