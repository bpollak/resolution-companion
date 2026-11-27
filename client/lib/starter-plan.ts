import { WEEKDAY_ORDER } from "@/lib/progress";
import { NEUTRAL_CUE } from "@/lib/ai-prompts";
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

type StarterBenchmark = (typeof STARTER_BENCHMARKS)[number];

const starter = (
  title: string,
  action: string,
  frequency: string[],
  kickstartVersion: string,
): StarterBenchmark => ({
  title,
  elementalAction: {
    title: action,
    frequency,
    kickstartVersion,
    // Nothing is known about the person's routine, so no time is implied.
    anchorLink: NEUTRAL_CUE,
  },
});

const EVERY_DAY = [...WEEKDAY_ORDER];

export type StarterTopic =
  | "fitness"
  | "weight"
  | "money"
  | "reading"
  | "sleep"
  | "stress"
  | "learning";

/**
 * Three starter steps per common resolution, for people setting up without
 * Coach. INVARIANT (starter-plan.test.ts): the first step of every topic is
 * daily, so the one selected by default is loggable on day one.
 */
export const STARTER_TOPICS: Record<
  StarterTopic,
  { chip: string; match: RegExp; benchmarks: StarterBenchmark[] }
> = {
  // Weight is checked before fitness: "get in shape and lose 15 pounds".
  weight: {
    chip: "Lose weight",
    match: /\b(weight|pounds?|lbs?|kilos?|kg|diet|slim(mer)?)\b/i,
    benchmarks: [
      starter(
        "Move every day",
        "Walk for 10 minutes",
        EVERY_DAY,
        "Walk to the end of the street",
      ),
      starter(
        "Cook at home more often",
        "Cook dinner at home",
        ["Monday", "Wednesday", "Friday"],
        "Take one ingredient out for dinner",
      ),
      starter(
        "Plan meals ahead",
        "Plan the next few dinners",
        ["Sunday", "Wednesday"],
        "Decide tomorrow's dinner",
      ),
    ],
  },
  fitness: {
    chip: "Get fit",
    match:
      /\b(fit|fitter|fitness|exercis\w*|work ?outs?|gym|run|running|jog\w*|strong\w*|strength|shape|active|healthier|healthy)\b/i,
    benchmarks: [
      starter(
        "Move every day",
        "Move for 10 minutes",
        EVERY_DAY,
        "Put on your shoes and step outside",
      ),
      starter(
        "Build strength",
        "Do a short strength set",
        ["Monday", "Wednesday", "Friday"],
        "Do 5 squats",
      ),
      starter(
        "Stay loose",
        "Stretch for 5 minutes",
        ["Tuesday", "Thursday", "Saturday"],
        "Reach for your toes once",
      ),
    ],
  },
  money: {
    chip: "Save money",
    match:
      /\b(money|sav(e|ing|ings)|debt|budget\w*|spend\w*|financ\w*|pay off)\b/i,
    benchmarks: [
      starter(
        "Know where it goes",
        "Check today's spending",
        EVERY_DAY,
        "Look at your last purchase",
      ),
      starter(
        "Pay yourself first",
        "Move money into savings",
        ["Friday"],
        "Move one dollar into savings",
      ),
      starter(
        "Spend with a plan",
        "Plan the week's spending",
        ["Sunday"],
        "Name one thing to skip this week",
      ),
    ],
  },
  reading: {
    chip: "Read more",
    match: /\b(read|reading|books?|novels?)\b/i,
    benchmarks: [
      starter("Read every day", "Read 10 pages", EVERY_DAY, "Read one page"),
      starter(
        "Talk about what you read",
        "Tell someone one thing you read",
        ["Tuesday", "Thursday"],
        "Say one sentence about your book",
      ),
      starter(
        "Always have a next book",
        "Choose what to read next",
        ["Sunday"],
        "Pick one title to try",
      ),
    ],
  },
  sleep: {
    chip: "Sleep better",
    match: /\b(sleep\w*|bed ?time|insomnia|wake up earlier|well rested)\b/i,
    benchmarks: [
      starter(
        "A steady bedtime",
        "Lights out by your bedtime",
        EVERY_DAY,
        "Set tomorrow's alarm",
      ),
      starter(
        "Screens off early",
        "Put your phone away 30 minutes before bed",
        ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday"],
        "Plug your phone in across the room",
      ),
      starter(
        "Morning light",
        "Get outside within an hour of waking",
        ["Monday", "Wednesday", "Friday"],
        "Open the curtains",
      ),
    ],
  },
  stress: {
    chip: "Stress less",
    match:
      /\b(stress\w*|anxi\w*|calm\w*|relax\w*|mindful\w*|meditat\w*|overwhelm\w*|burn ?out)\b/i,
    benchmarks: [
      starter(
        "A daily pause",
        "Breathe slowly for 5 minutes",
        EVERY_DAY,
        "Take 3 deep breaths",
      ),
      starter(
        "Walk it off",
        "Walk for 10 minutes",
        ["Monday", "Wednesday", "Friday"],
        "Step outside for one minute",
      ),
      starter(
        "Time for something you enjoy",
        "Do one thing you enjoy for 15 minutes",
        ["Tuesday", "Thursday", "Saturday"],
        "Pick the thing you will do",
      ),
    ],
  },
  learning: {
    chip: "Learn a skill",
    match:
      /\b(learn\w*|skills?|language|stud(y|ying)|practic\w*|course|instrument|guitar|piano|cod(e|ing))\b/i,
    benchmarks: [
      starter(
        "Practice every day",
        "Practice for 10 minutes",
        EVERY_DAY,
        "Practice for 2 minutes",
      ),
      starter(
        "Learn something new",
        "Work through one new lesson",
        ["Monday", "Wednesday", "Friday"],
        "Open the next lesson",
      ),
      starter(
        "Use what you learned",
        "Try the skill on something real",
        ["Saturday"],
        "Pick what you will try",
      ),
    ],
  },
};

/**
 * One tap gets a New Year's user past the blank box. Shown in the Coach chat
 * (where Coach narrows it down) and on the self-setup plan.
 */
export const RESOLUTION_STARTERS = [
  "Get fit",
  "Lose weight",
  "Save money",
  "Read more",
  "Sleep better",
  "Less phone time",
  "Stress less",
  "Learn a skill",
  "Something else",
];

/** The starter chips that have their own steps, for the self-setup plan. */
export const SELF_SETUP_STARTERS = RESOLUTION_STARTERS.filter((chip) =>
  Object.values(STARTER_TOPICS).some((topic) => topic.chip === chip),
);

/** Which topic a chip or a typed resolution is about, if any. */
export function starterTopicFor(
  resolution: string | undefined,
): StarterTopic | null {
  const text = (resolution ?? "").trim();
  if (!text) return null;
  const topics = Object.entries(STARTER_TOPICS) as [
    StarterTopic,
    (typeof STARTER_TOPICS)[StarterTopic],
  ][];
  const byChip = topics.find(
    ([, topic]) => topic.chip.toLowerCase() === text.toLowerCase(),
  );
  if (byChip) return byChip[0];
  return topics.find(([, topic]) => topic.match.test(text))?.[0] ?? null;
}

/** Starter steps for a resolution; today's generic three when unknown. */
export function starterBenchmarksFor(
  resolution: string | undefined,
): StarterBenchmark[] {
  const topic = starterTopicFor(resolution);
  return topic ? STARTER_TOPICS[topic].benchmarks : STARTER_BENCHMARKS;
}

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

const stepsSignature = (
  steps: readonly {
    title: string;
    selected?: boolean;
    elementalAction: StarterBenchmark["elementalAction"];
  }[],
) =>
  JSON.stringify(
    steps.map((item, index) => [
      item.title,
      item.elementalAction.title,
      [...item.elementalAction.frequency].sort(),
      item.elementalAction.kickstartVersion,
      item.elementalAction.anchorLink,
      item.selected ?? index === 0,
    ]),
  );

const STARTER_SIGNATURES = new Set(
  [
    STARTER_BENCHMARKS,
    ...Object.values(STARTER_TOPICS).map((topic) => topic.benchmarks),
  ].map(stepsSignature),
);

/**
 * Sets the resolution on a self-made plan and, while its steps are still an
 * untouched starter set, swaps them for the steps that fit the resolution.
 * Once the person has edited or reselected anything, their steps are kept.
 */
export function withStarterResolution(
  draft: OnboardingPlanDraft,
  resolution: string,
): OnboardingPlanDraft {
  const next = { ...draft, resolution };
  if (
    !isSelfSetupDraft(draft) ||
    !STARTER_SIGNATURES.has(stepsSignature(draft.suggestions))
  )
    return next;
  const benchmarks = starterBenchmarksFor(resolution);
  if (stepsSignature(benchmarks) === stepsSignature(draft.suggestions))
    return next;
  return {
    ...next,
    suggestions: createPlanDraft(
      {
        personaName: draft.name,
        personaDescription: draft.description,
        benchmarks,
      },
      false,
    ).suggestions,
  };
}
