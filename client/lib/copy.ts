// Small copy helpers shared by cards that stack a milestone label over a habit.

const STOP = new Set([
  "a",
  "an",
  "the",
  "do",
  "to",
  "of",
  "and",
  "on",
  "for",
  "my",
]);

function words(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((word) => word && !STOP.has(word));
}

/**
 * True when a label only repeats the text under it (for example a milestone
 * titled "20-minute walk after dinner (weekdays)" above the habit "Do a
 * 20-minute walk after dinner, Monday-Friday"), so the card can drop it.
 */
export function repeatsText(label: string, text: string): boolean {
  const labelWords = words(label);
  if (labelWords.length === 0) return true;
  const textWords = new Set(words(text));
  const shared = labelWords.filter((word) => textWords.has(word)).length;
  return shared / labelWords.length >= 0.7;
}

/**
 * Coach models slip in em dashes despite the prompt; the app never shows one.
 * "thanks — what's" -> "thanks, what's". Leaves hyphens and en dashes alone.
 */
export function tidyCoachText(text: string): string {
  return text
    .replace(/\s*—\s*/g, ", ")
    .replace(/,\s*,/g, ",")
    .replace(/,\s*([.!?])/g, "$1")
    .replace(/^,\s*/, "");
}

// --- Plan review (onboarding step 2) ---

const plural = (count: number, word: string) =>
  `${count} ${word}${count === 1 ? "" : "s"}`;

/** Intro above the plan. Only promises Journey steps when some exist. */
export function planReviewIntro(otherStepCount: number): string {
  return otherStepCount > 0
    ? "Start with one step. The others wait for you in Journey."
    : "Start with one step. You can add more later in Journey.";
}

/** "Mon · Wed · Fri", "Every day", or a prompt when nothing is chosen. */
export function daysLabel(frequency: readonly string[]): string {
  if (frequency.length === 7) return "Every day";
  if (frequency.length === 0) return "Choose your days";
  return frequency.map((day) => day.slice(0, 3)).join(" · ");
}

/**
 * Days the person did not state are shown as a suggestion, never as their
 * own words.
 */
export function scheduleLabel(
  frequency: readonly string[],
  source: "stated" | "suggested",
): string {
  const days = daysLabel(frequency);
  return source === "suggested" && frequency.length > 0
    ? `Suggested: ${days}`
    : days;
}

export function moreStepsLabel(count: number): string {
  return `See ${plural(count, "more step")} toward this`;
}

export const HIDE_MORE_STEPS = "Hide the other steps";
export const ASK_COACH_TO_CHANGE = "Ask Coach to change this";
export const CHANGE_DAYS = "Change";
export const STEP_INCLUDED = "Included in your plan";
export const STEP_SAVED_FOR_LATER = "Saved for later in Journey";

/** The regression flows select on this exact text. */
export function startWithHabitsLabel(count: number): string {
  return `Start with ${plural(count, "habit")}`;
}

// --- In-app framing: goal to steps ---

/** Under "What's your resolution?" on empty Today and the welcome screen. */
export const GOAL_TO_STEPS_LINE =
  "Know the goal but not the steps? Talk it through with Coach and leave with the first one.";

/** The two welcome steps, as [title, detail]. */
export const WELCOME_STEPS: readonly (readonly [string, string])[] = [
  ["Talk with Coach", "Share the goal. Coach helps you find the steps."],
  [
    "Review your plan",
    "Check your habit and schedule. Start when it feels right.",
  ],
];

export const PLAN_NAME_REQUIRED = "Give this plan a name.";
export const MILESTONE_HINT = "A marker of progress toward your resolution.";
export const MILESTONE_PLACEHOLDER = "e.g., 21 evening walks, 10 books read";
export const SELF_SETUP_STARTERS_LABEL =
  "Pick a starting point, or type your own resolution above.";
