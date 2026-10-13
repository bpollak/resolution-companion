import { WEEKDAY_ORDER } from "@/lib/progress";
import {
  createPlanDraft,
  type OnboardingPlanDraft,
} from "@/lib/onboarding-plan";

// Local suggestions for the plan review. Only explicitly chosen habits are saved.
//
// INVARIANT (enforced by starter-plan.test.ts): at least one action is
// scheduled on EVERY weekday, so a fresh install on any day, Sunday included,
// has something loggable on day one. Previously the anchor action was Mon–Fri
// only, which left Sunday empty (no reward loop to taste at activation). It is
// now daily; the 2-minute kickstart keeps that no-guilt.
export const STARTER_BENCHMARKS = [
  {
    title: "Build Daily Momentum",
    elementalAction: {
      title: "Complete one action toward your goal",
      frequency: [...WEEKDAY_ORDER], // every day: the daily-momentum anchor
      kickstartVersion: "Spend 2 minutes planning your next step",
      anchorLink: "After I check my phone in the morning",
    },
  },
  {
    title: "Develop Mindfulness Practice",
    elementalAction: {
      title: "Practice mindful breathing",
      frequency: ["Monday", "Wednesday", "Friday"],
      kickstartVersion: "Take 3 deep breaths",
      anchorLink: "After I sit down at my desk",
    },
  },
  {
    title: "Maintain Physical Wellness",
    elementalAction: {
      title: "Move your body intentionally",
      frequency: ["Tuesday", "Thursday", "Saturday"],
      kickstartVersion: "Do 10 jumping jacks",
      anchorLink: "After I wake up",
    },
  },
];

// Drafts built here never touch an AI endpoint, so setup still works for
// someone who declines AI consent or is offline. The id prefix marks them so a
// saved self-made draft resumes, while legacy manual drafts stay ignored.
export const SELF_SETUP_ID_PREFIX = "self-plan-";
export const SELF_SETUP_NAME = "My Future Self";
const SELF_SETUP_DESCRIPTION =
  "Someone who shows up for one small step at a time.";

export function isSelfSetupDraft(
  draft: Pick<OnboardingPlanDraft, "id" | "usesAI"> | null | undefined,
): boolean {
  return (
    draft?.usesAI === false &&
    typeof draft.id === "string" &&
    draft.id.startsWith(SELF_SETUP_ID_PREFIX)
  );
}

/**
 * Only a Coach-made plan consumes the Coach transcript. Someone can pause a
 * Coach conversation to try "Set it up myself"; approving that plan must not
 * silently erase the conversation they may come back to.
 */
export function approvalClearsCoachTranscript(
  draft: Pick<OnboardingPlanDraft, "id" | "usesAI"> | null | undefined,
): boolean {
  return !isSelfSetupDraft(draft);
}

/** First default name not already taken, since commit rejects duplicates. */
export function uniqueSelfSetupName(existingNames: readonly string[]): string {
  const taken = new Set(existingNames.map((name) => name.trim()));
  if (!taken.has(SELF_SETUP_NAME)) return SELF_SETUP_NAME;
  let suffix = 2;
  while (taken.has(`${SELF_SETUP_NAME} ${suffix}`)) suffix += 1;
  return `${SELF_SETUP_NAME} ${suffix}`;
}

/**
 * An editable plan from the starter suggestions, with only the daily anchor
 * selected. The empty resolution makes the review offer a field for it.
 */
export function createStarterPlanDraft(
  existingNames: readonly string[] = [],
): OnboardingPlanDraft {
  const draft = createPlanDraft(
    {
      personaName: uniqueSelfSetupName(existingNames),
      personaDescription: SELF_SETUP_DESCRIPTION,
      benchmarks: STARTER_BENCHMARKS,
    },
    false,
  );
  return {
    ...draft,
    id: `${SELF_SETUP_ID_PREFIX}${draft.id.replace(/^plan-/, "")}`,
    resolution: "",
  };
}
