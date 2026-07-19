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
  kind: "theme" | "coach-tone" | "celebration" | "app-icon";
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
  {
    id: "direct-coach-tone",
    title: "Direct coach tone",
    description:
      "A concise coaching voice that gets to the point while staying kind. Switch anytime in Profile → Appearance.",
    kind: "coach-tone",
    milestonesRequired: 2,
  },
  {
    id: "aurora-celebration",
    title: "Aurora celebrations",
    description:
      "A violet-and-gold milestone burst, permanently unlocked. Switch anytime in Profile → Appearance.",
    kind: "celebration",
    milestonesRequired: 3,
  },
  {
    id: "aurora-app-icon",
    title: "Aurora app icon",
    description:
      "A violet-and-cyan compass for your Home Screen, permanently unlocked. Switch anytime in Profile → Appearance.",
    kind: "app-icon",
    milestonesRequired: 4,
  },
  {
    id: "violet-accent",
    title: "Violet accent",
    description:
      "A softer violet highlight across the app, permanently unlocked. Switch anytime in Profile → Appearance.",
    kind: "theme",
    milestonesRequired: 5,
  },
];

const UNLOCKED_REWARDS_KEY = "unlocked_reward_ids";
const COACH_TONE_KEY = "reward_coach_tone";
const CELEBRATION_STYLE_KEY = "reward_celebration_style";

export type CoachTone = "supportive" | "direct";
export type CelebrationStyle = "classic" | "aurora";

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

export async function getCoachTone(): Promise<CoachTone> {
  return (await AsyncStorage.getItem(COACH_TONE_KEY)) === "direct"
    ? "direct"
    : "supportive";
}

export async function setCoachTone(tone: CoachTone): Promise<void> {
  await AsyncStorage.setItem(COACH_TONE_KEY, tone);
}

export async function getCelebrationStyle(): Promise<CelebrationStyle> {
  return (await AsyncStorage.getItem(CELEBRATION_STYLE_KEY)) === "aurora"
    ? "aurora"
    : "classic";
}

export async function setCelebrationStyle(
  style: CelebrationStyle,
): Promise<void> {
  await AsyncStorage.setItem(CELEBRATION_STYLE_KEY, style);
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
