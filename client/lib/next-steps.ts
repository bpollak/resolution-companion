import type { Benchmark, ElementalAction } from "@/lib/storage";
import type { OnboardingPlanDraft } from "@/lib/onboarding-plan";
import { WEEKDAY_ORDER, sortWeekdays } from "@/lib/progress";
import { withSuggestedReminderTime } from "@/lib/habit-reminders";
import { NEUTRAL_CUE } from "@/lib/ai-prompts";
import { HABIT_LIMIT } from "@/lib/plan-editing";

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

/** Enough to keep the path visible without turning Journey into a backlog. */
export const NEXT_STEP_LIMIT = 6;

export const HABIT_LIMIT_MESSAGE =
  "Your plan holds five habits. Remove one, then add this.";
/** Used when a step has no 2-minute version of its own. */
export const DEFAULT_KICKSTART = "Do the first two minutes of it.";
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

/**
 * Reads Coach's one-step proposal from a plan-shaped reply: the first entry
 * that could become a habit. Throws when there is none, so an empty title or
 * a step with no valid days is never previewed.
 */
export function parseNextStepProposal(
  data: unknown,
  id = `coach-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
): NextStep {
  const entries =
    data && typeof data === "object"
      ? (data as { benchmarks?: unknown }).benchmarks
      : null;
  for (const entry of Array.isArray(entries) ? entries : []) {
    if (!entry || typeof entry !== "object") continue;
    const raw = entry as { why?: unknown; elementalAction?: unknown };
    const habit =
      raw.elementalAction && typeof raw.elementalAction === "object"
        ? (raw.elementalAction as Record<string, unknown>)
        : {};
    const step = normalizeStep({
      id,
      title: habit.title,
      why: raw.why,
      frequency: habit.frequency,
      kickstart: habit.kickstartVersion,
      cue: habit.anchorLink,
      source: "coach",
    });
    if (step) return step;
  }
  throw new Error("Coach did not return a step that can be added.");
}

export const STEP_LIMIT_MESSAGE =
  "You have reached this month's limit for step suggestions. You can still add a habit yourself in Journey.";
export const STEP_TIMEOUT_MESSAGE =
  "That took too long. Your plan was not changed.";
export const STEP_UNAVAILABLE_MESSAGE =
  "Coach could not suggest a step right now. Your plan was not changed.";

const STEP_LIMIT_ERROR = "StepLimitError";

/** The server answered 429: this month's step suggestions are used up. */
export function stepLimitError(): Error {
  const error = new Error(STEP_LIMIT_MESSAGE);
  error.name = STEP_LIMIT_ERROR;
  return error;
}

/**
 * What to tell the person when a step suggestion fails. A limit is not
 * something to retry, so it never gets the "right now" wording.
 */
export function nextStepErrorMessage(error: unknown): string {
  if (error instanceof Error && error.name === STEP_LIMIT_ERROR)
    return STEP_LIMIT_MESSAGE;
  if (error instanceof Error && error.name === "AbortError")
    return STEP_TIMEOUT_MESSAGE;
  return STEP_UNAVAILABLE_MESSAGE;
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
    kickstartVersion: step.kickstart ?? DEFAULT_KICKSTART,
    anchorLink: step.cue ?? NEUTRAL_CUE,
  });
}

const titleKey = (title: string) =>
  title.replace(/\s+/g, " ").trim().toLowerCase();

/** Two titles name the same step or habit, ignoring case and spacing. */
export function sameStepTitle(a: string, b: string): boolean {
  return titleKey(a) === titleKey(b);
}

/**
 * Adds a step to the list unless one with the same title is already there.
 * `saved` is the step as stored: the existing one on a title match, so the
 * caller adds by an id that is really in the list.
 */
export function withNextStepSaved(
  steps: readonly NextStep[],
  step: NextStep,
): { steps: NextStep[]; saved: NextStep } {
  const existing = steps.find((item) => sameStepTitle(item.title, step.title));
  if (existing) return { steps: [...steps], saved: existing };
  // At the cap the oldest idea makes room for the one just offered.
  const next = normalizeNextSteps([...steps, step].slice(-NEXT_STEP_LIMIT));
  return {
    steps: next,
    saved: next.find((item) => item.id === step.id) ?? step,
  };
}

export type NextStepAddPlan =
  | { kind: "missing" }
  /** A habit with this title is already in the plan; only tidy the list. */
  | { kind: "already_added" }
  | { kind: "refused"; reason: "habit_limit" | "no_milestone" }
  | { kind: "create"; action: Omit<ElementalAction, "id" | "createdAt"> };

/**
 * What adding a stored step should do. A retry after a half-finished add
 * (habit written, list not yet updated) finds the habit and creates nothing,
 * so the same step can never become two habits.
 */
export function planNextStepAdd(input: {
  steps: readonly NextStep[];
  stepId: string;
  planActions: readonly Pick<ElementalAction, "title">[];
  planBenchmarks: readonly Benchmark[];
}): NextStepAddPlan {
  const step = input.steps.find((item) => item.id === input.stepId);
  if (!step) return { kind: "missing" };
  if (input.planActions.some((item) => sameStepTitle(item.title, step.title)))
    return { kind: "already_added" };
  const allowed = canAddNextStep(input.planActions.length);
  if (!allowed.ok) return { kind: "refused", reason: allowed.reason };
  const milestone = milestoneForNextStep(input.planBenchmarks);
  if (!milestone) return { kind: "refused", reason: "no_milestone" };
  return { kind: "create", action: nextStepToAction(step, milestone.id) };
}
