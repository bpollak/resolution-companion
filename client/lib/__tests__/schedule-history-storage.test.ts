/**
 * The storage write paths that change a habit's days must record the change
 * as in force from today, and a plan saved before schedule history existed
 * must read back byte-for-byte the same.
 */

import AsyncStorage from "@react-native-async-storage/async-storage";
import { storage, type ElementalAction } from "@/lib/storage";

jest.mock("@react-native-async-storage/async-storage", () =>
  jest.requireActual(
    "@react-native-async-storage/async-storage/jest/async-storage-mock",
  ),
);

const MWF = ["Monday", "Wednesday", "Friday"];

const legacyAction: ElementalAction = {
  id: "a1",
  benchmarkId: "b1",
  title: "Walk",
  frequency: MWF,
  anchorLink: "after lunch",
  kickstartVersion: "shoes on",
  createdAt: "2026-06-24T09:00:00",
};

describe("schedule history through storage", () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
    jest.useFakeTimers({ doNotFake: ["nextTick", "setImmediate"] });
    jest.setSystemTime(new Date(2026, 6, 6, 21, 30)); // Mon Jul 6, UTC is Jul 7
    await AsyncStorage.setItem(
      "elementalActions",
      JSON.stringify([legacyAction]),
    );
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("reads a 1.6.1 habit back unchanged, with no history key", async () => {
    const [action] = await storage.getElementalActions();
    expect(action).toEqual(legacyAction);
    expect("frequencyHistory" in action).toBe(false);
  });

  it("an edit that leaves the days alone writes no history", async () => {
    const updated = await storage.updateElementalAction("a1", {
      title: "Walk outside",
      frequency: [...MWF],
    });
    expect(updated?.title).toBe("Walk outside");
    expect(updated && "frequencyHistory" in updated).toBe(false);
  });

  it("updateElementalAction records a change of days from the local today", async () => {
    const updated = await storage.updateElementalAction("a1", {
      frequency: ["Monday"],
    });
    expect(updated?.frequency).toEqual(["Monday"]);
    expect(updated?.frequencyHistory).toEqual([
      { from: "2026-06-24", frequency: MWF },
      { from: "2026-07-06", frequency: ["Monday"] },
    ]);
    expect(await storage.getElementalActions()).toEqual([updated]);
  });

  it("ignores a history handed in by the caller", async () => {
    await storage.updateElementalAction("a1", { frequency: ["Monday"] });
    const updated = await storage.updateElementalAction("a1", {
      title: "Stroll",
      frequencyHistory: [],
    });
    expect(updated?.title).toBe("Stroll");
    expect(updated?.frequencyHistory).toHaveLength(2);
  });

  it("applying a plan tune-up records the change of days", async () => {
    const result = await storage.applyPlanAdjustment(
      "a1",
      "p1",
      { frequency: ["Tuesday", "Thursday"], anchorLink: "after dinner" },
      "Evenings fit better",
    );
    expect(result?.action.anchorLink).toBe("after dinner");
    expect(result?.action.frequencyHistory).toEqual([
      { from: "2026-06-24", frequency: MWF },
      { from: "2026-07-06", frequency: ["Tuesday", "Thursday"] },
    ]);
    expect(result?.adjustment.before.frequency).toEqual(MWF);
  });

  it("drops a malformed history from a restored backup", async () => {
    await AsyncStorage.setItem(
      "elementalActions",
      JSON.stringify([{ ...legacyAction, frequencyHistory: "broken" }]),
    );
    const [action] = await storage.getElementalActions();
    expect(action).toEqual(legacyAction);
  });
});
