import AsyncStorage from "@react-native-async-storage/async-storage";
import { logger } from "@/lib/logger";

/**
 * Milestone reward layer: small permanent cosmetics unlocked by completing
 * milestones. Rewards only ever accumulate — mirroring fill-only milestones —
 * and none are purchasable; they are earned or they don't exist (the Finch
 * lesson: people pay to love the thing, but they earn the things they love).
 */

export interface Reward {
  id: string;
  title: string;
  description: string;
  /** What unlocking it changes. "theme" rewards appear under Appearance. */
  kind: "theme";
  /** Total completed milestones (across personas) required to unlock. */
  milestonesRequired: number;
}

export const REWARDS: Reward[] = [
  {
    id: "dawn-theme",
    title: "Dawn theme",
    description:
      "A light look for the app — unlocked by your first completed milestone. Switch anytime in Profile → Appearance.",
    kind: "theme",
    milestonesRequired: 1,
  },
];

const UNLOCKED_REWARDS_KEY = "unlocked_reward_ids";

export async function getUnlockedRewardIds(): Promise<string[]> {
  try {
    const raw = await AsyncStorage.getItem(UNLOCKED_REWARDS_KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(parsed)
      ? parsed.filter((id): id is string => typeof id === "string")
      : [];
  } catch {
    return [];
  }
}

export async function isRewardUnlocked(id: string): Promise<boolean> {
  return (await getUnlockedRewardIds()).includes(id);
}

/**
 * Unlock every reward whose threshold the given completed-milestone count
 * now meets. Returns only the NEWLY unlocked rewards (empty when nothing
 * changed) so callers can celebrate exactly once.
 */
export async function unlockRewardsForMilestoneCount(
  completedMilestones: number,
): Promise<Reward[]> {
  try {
    const unlocked = await getUnlockedRewardIds();
    const newlyUnlocked = REWARDS.filter(
      (reward) =>
        reward.milestonesRequired <= completedMilestones &&
        !unlocked.includes(reward.id),
    );
    if (newlyUnlocked.length > 0) {
      await AsyncStorage.setItem(
        UNLOCKED_REWARDS_KEY,
        JSON.stringify([...unlocked, ...newlyUnlocked.map((r) => r.id)]),
      );
    }
    return newlyUnlocked;
  } catch (error) {
    logger.error("Failed to unlock rewards:", error);
    return [];
  }
}
