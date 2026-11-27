import type { Benchmark, ElementalAction } from "@/lib/storage";
import type { OnboardingPlanDraft } from "@/lib/onboarding-plan";
import { WEEKDAY_ORDER, sortWeekdays } from "@/lib/progress";
import { withSuggestedReminderTime } from "@/lib/habit-reminders";
import { NEUTRAL_CUE } from "@/lib/ai-prompts";

/**
 * A step toward the resolution that the person has not started yet. Kept on
 * the plan so the path Coach named is not lost when they start with one.
 */
export type NextStep = {
  id: string;
  title: string;
  why?: string;
  frequency: string[];
  kickstart?: string;
  cue?: string;
  source: "onboarding" | "coach";
};

/** A plan holds at most this many habits, for everyone. */
export const HABIT_LIMIT = 5;
/** Enough to keep the path visible without turning Journey into a backlog. */
export const NEXT_STEP_LIMIT = 6;

export const HABIT_LIMIT_MESSAGE =
  "Your plan holds five habits. Finish or remove one, then add this.";
export const NO_MILESTONE_MESSAGE =
  "Add a milestone in Journey first, then add this step.";

const text = (value: unknown, max: number): string | undefined => {
  if (typeof value !== "string") return undefined;
  const trimmed = value.replace(/\s+/g, " ").trim();
  return trimmed ? trimmed.slice(0, max) : undefined;
};

const weekdays = (value: unknown): string[] =>
  Array.isArray(value)
    ? sortWeekdays([
        ...new Set(
          value.filter(
            (day): day is string =>
              typeof day === "string" && WEEKDAY_ORDER.includes(day),
          ),
        ),
      ])
    : [];

/** Id of a draft step, so selection can be passed by id rather than index. */
export function draftStepId(
  draft: Pick<OnboardingPlanDraft, "id">,
  index: number,
): string {
  return `${draft.id}-step-${index}`;
}

function normalizeStep(value: unknown): NextStep | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  const id = text(raw.id, 120);
  const title = text(raw.title, 160);
  const frequency = weekdays(raw.frequency);
  // A step with no title or no days cannot become a habit.
  if (!id || !title || frequency.length === 0) return null;
  const why = text(raw.why, 140);
  const kickstart = text(raw.kickstart, 200);
  const cue = text(raw.cue, 160);
  return {
    id,
    title,
    ...(why ? { why } : {}),
    frequency,
    ...(kickstart ? { kickstart } : {}),
    ...(cue ? { cue } : {}),
    source: raw.source === "coach" ? "coach" : "onboarding",
  };
}

/**
 * Next steps as stored on a plan. Plans saved before 1.7.0 have no key, and
 * a restored backup may hold anything, so this never throws and drops
 * entries that could not be added as a habit.
 */
export function normalizeNextSteps(value: unknown): NextStep[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const steps: NextStep[] = [];
  for (const item of value) {
    const step = normalizeStep(item);
    if (!step || seen.has(step.id)) continue;
    seen.add(step.id);
    steps.push(step);
  }
  return steps.slice(0, NEXT_STEP_LIMIT);
}

/** The draft's steps the person did not start with. */
export function nextStepsFromDraft(
  draft: OnboardingPlanDraft,
  selectedIds: string[],
): NextStep[] {
  const selected = new Set(selectedIds);
  return normalizeNextSteps(
    draft.suggestions.map((item, index) => {
      const id = draftStepId(draft, index);
      if (selected.has(id)) return null;
      return {
        id,
        title: item.elementalAction.title,
        why: item.why,
        frequency: item.elementalAction.frequency,
        kickstart: item.elementalAction.kickstartVersion,
        cue: item.elementalAction.anchorLink,
        source: "onboarding",
      };
    }),
  );
}

export function canAddNextStep(
  actionCount: number,
): { ok: true } | { ok: false; reason: "habit_limit" } {
  return actionCount >= HABIT_LIMIT
    ? { ok: false, reason: "habit_limit" }
    : { ok: true };
}

/**
 * Where an added step goes: the first unfinished milestone in plan order,
 * or the most recent one when every milestone is finished.
 */
export function milestoneForNextStep(
  benchmarks: readonly Benchmark[],
): Benchmark | null {
  const active = benchmarks.find((item) => item.status === "active");
  if (active) return active;
  return (
    [...benchmarks].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))[0] ??
    null
  );
}

/** The habit a step becomes. Its reminder time follows the cue, as usual. */
export function nextStepToAction(
  step: NextStep,
  benchmarkId: string,
): Omit<ElementalAction, "id" | "createdAt"> {
  return withSuggestedReminderTime({
    benchmarkId,
    title: step.title,
    frequency: sortWeekdays([...step.frequency]),
    kickstartVersion:
      step.kickstart ?? `Do ${step.title.toLowerCase()} for 2 minutes`,
    anchorLink: step.cue ?? NEUTRAL_CUE,
  });
}

/** Adds a step to the list unless one with the same title is already there. */
export function withNextStepSaved(
  steps: readonly NextStep[],
  step: NextStep,
): NextStep[] {
  const key = step.title.trim().toLowerCase();
  if (steps.some((item) => item.title.trim().toLowerCase() === key))
    return [...steps];
  // At the cap the oldest idea makes room for the one just offered.
  return normalizeNextSteps([...steps, step].slice(-NEXT_STEP_LIMIT));
}
