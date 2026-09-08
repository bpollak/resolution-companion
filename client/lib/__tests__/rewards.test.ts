import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  getCelebrationStyle,
  getCoachTone,
  getUnlockedRewardIds,
  setCelebrationStyle,
  setCoachTone,
  unlockRewardsForMilestoneCount,
} from "@/lib/rewards";

jest.mock("@react-native-async-storage/async-storage", () =>
  jest.requireActual(
    "@react-native-async-storage/async-storage/jest/async-storage-mock",
  ),
);

describe("milestone rewards", () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
  });

  it("unlocks permanent rewards at the first five milestone thresholds", async () => {
    expect((await unlockRewardsForMilestoneCount(1)).map((r) => r.id)).toEqual([
      "dawn-theme",
    ]);
    expect((await unlockRewardsForMilestoneCount(2)).map((r) => r.id)).toEqual([
      "direct-coach-tone",
    ]);
    expect((await unlockRewardsForMilestoneCount(3)).map((r) => r.id)).toEqual([
      "aurora-celebration",
    ]);
    expect((await unlockRewardsForMilestoneCount(4)).map((r) => r.id)).toEqual([
      "aurora-app-icon",
    ]);
    expect((await unlockRewardsForMilestoneCount(5)).map((r) => r.id)).toEqual([
      "violet-accent",
    ]);
    expect(await getUnlockedRewardIds()).toEqual([
      "dawn-theme",
      "direct-coach-tone",
      "aurora-celebration",
      "aurora-app-icon",
      "violet-accent",
    ]);
  });

  it("never returns the same reward twice", async () => {
    await unlockRewardsForMilestoneCount(5);
    expect(await unlockRewardsForMilestoneCount(5)).toEqual([]);
  });

  it("persists the earned coach and celebration preferences", async () => {
    expect(await getCoachTone()).toBe("supportive");
    expect(await getCelebrationStyle()).toBe("classic");
    await setCoachTone("direct");
    await setCelebrationStyle("aurora");
    expect(await getCoachTone()).toBe("direct");
    expect(await getCelebrationStyle()).toBe("aurora");
  });
});
