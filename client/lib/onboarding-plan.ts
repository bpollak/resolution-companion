import type { PersonaData } from "@/lib/ai";
import type { Persona, Benchmark, ElementalAction } from "@/lib/storage";
import { WEEKDAY_ORDER, sortWeekdays } from "@/lib/progress";

export interface OnboardingPlanDraft {
  id: string;
  createdAt: string;
  name: string;
  description: string;
  usesAI: boolean;
  sourceMessageId?: string;
  /** The resolution in the person's own words, shown above the plan. */
  resolution?: string;
  /** Local YYYY-MM-DD the plan starts; absent means today. */
  startDate?: string;
  suggestions: (PersonaData["benchmarks"][number] & { selected: boolean })[];
}

export function createPlanDraft(
  data: PersonaData,
  usesAI: boolean,
): OnboardingPlanDraft {
  return {
    id: `plan-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    createdAt: new Date().toISOString(),
    name: data.personaName,
    description: data.personaDescription,
    usesAI,
    suggestions: data.benchmarks.slice(0, 5).map((suggestion, index) => ({
      ...suggestion,
      selected: index === 0,
      elementalAction: {
        ...suggestion.elementalAction,
        // Unsupported cadences are left empty for the person to choose.
        frequency: sortWeekdays([
          ...new Set(
            suggestion.elementalAction.frequency
              .map((day) =>
                WEEKDAY_ORDER.find(
                  (valid) => valid.toLowerCase() === day.trim().toLowerCase(),
                ),
              )
              .filter((day): day is string => Boolean(day)),
          ),
        ]),
      },
    })),
  };
}

export interface PlanIssue {
  field: "name" | "selection" | "action" | "milestone" | "small" | "days";
  suggestionIndex?: number;
  message: string;
}

export function getPlanIssue(draft: OnboardingPlanDraft): PlanIssue | null {
  if (!draft.name.trim())
    return { field: "name", message: "Give your future self a name." };
  if (!draft.suggestions.some((item) => item.selected))
    return {
      field: "selection",
      message: "Choose at least one habit to start.",
    };
  for (const [index, item] of draft.suggestions.entries()) {
    if (!item.selected) continue;
    const fields = [
      ["action", item.elementalAction.title, "an action"],
      ["milestone", item.title, "a milestone"],
      ["small", item.elementalAction.kickstartVersion, "a 2-minute version"],
    ] as const;
    for (const [field, value, label] of fields) {
      if (!value.trim())
        return {
          field,
          suggestionIndex: index,
          message: `Add ${label} for habit ${index + 1}.`,
        };
    }
    if (
      item.elementalAction.frequency.length === 0 ||
      item.elementalAction.frequency.some((day) => !WEEKDAY_ORDER.includes(day))
    )
      return {
        field: "days",
        suggestionIndex: index,
        message: `Choose at least one day for habit ${index + 1}.`,
      };
  }
  return null;
}

const RESOLUTION_LEADS =
  /^(?:(?:um|so|well|ok|okay)[,\s]+)*(?:i\s+(?:really\s+)?(?:want|would like|'d like|need|hope|plan|am going|'m going)\s+to\s+|i\s+wanna\s+|my\s+(?:new year'?s\s+)?(?:resolution|goal)\s+(?:is|for\s+\S+\s+is)\s+(?:to\s+)?|to\s+)/i;

/**
 * Turns the person's first answer into a short resolution line: "I want to get
 * in shape this year and lose about 15 pounds" -> "Get in shape this year and
 * lose about 15 pounds". Keeps their words; only trims the lead-in.
 */
export function deriveResolution(message: string | undefined): string {
  const text = (message ?? "").replace(/\s+/g, " ").trim();
  if (!text) return "";
  const firstSentence = text.split(/(?<=[.!?])\s/)[0] ?? text;
  const trimmed = firstSentence
    .replace(RESOLUTION_LEADS, "")
    .replace(/[.!?]+$/, "")
    .trim();
  if (!trimmed) return "";
  const clipped =
    trimmed.length > 90 ? `${trimmed.slice(0, 87).trimEnd()}...` : trimmed;
  return clipped.charAt(0).toUpperCase() + clipped.slice(1);
}

/**
 * From Nov 15 through Dec 31 people plan for the new year, so the plan review
 * offers January 1 as a start date. Returns that date (YYYY-MM-DD) or null.
 */
export function newYearStartOption(now = new Date()): string | null {
  const month = now.getMonth();
  const day = now.getDate();
  if (month === 11 || (month === 10 && day >= 15))
    return `${now.getFullYear() + 1}-01-01`;
  return null;
}

/** Whole days from today's midnight to the start day's midnight. */
export function daysUntil(start: Date, now = new Date()): number {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const day = new Date(start.getFullYear(), start.getMonth(), start.getDate());
  return Math.round((day.getTime() - today.getTime()) / 86_400_000);
}

/** Start of the draft's start day in local time, or null to start now. */
export function planStartInstant(
  draft: Pick<OnboardingPlanDraft, "startDate">,
  now = new Date(),
): Date | null {
  if (!draft.startDate || !/^\d{4}-\d{2}-\d{2}$/.test(draft.startDate))
    return null;
  const [year, month, day] = draft.startDate.split("-").map(Number);
  const start = new Date(year, month - 1, day);
  return start.getTime() > now.getTime() ? start : null;
}

export function approvePlan(
  draft: OnboardingPlanDraft,
  acceptedAt = (planStartInstant(draft) ?? new Date()).toISOString(),
): {
  persona: Persona;
  benchmarks: Benchmark[];
  actions: ElementalAction[];
} {
  const issue = getPlanIssue(draft);
  if (issue) throw new Error(issue.message);
  const persona = {
    id: draft.id,
    createdAt: acceptedAt,
    name: draft.name.trim(),
    description: draft.description.trim(),
    ...(draft.resolution?.trim()
      ? { resolution: draft.resolution.trim() }
      : {}),
  };
  const benchmarks: Benchmark[] = [];
  const actions: ElementalAction[] = [];
  draft.suggestions.forEach((item, index) => {
    if (!item.selected) return;
    const benchmarkId = `${draft.id}-milestone-${index}`;
    benchmarks.push({
      id: benchmarkId,
      personaId: draft.id,
      title: item.title.trim(),
      targetDate: null,
      status: "active",
      createdAt: acceptedAt,
    });
    actions.push({
      ...item.elementalAction,
      title: item.elementalAction.title.trim(),
      kickstartVersion: item.elementalAction.kickstartVersion.trim(),
      anchorLink: item.elementalAction.anchorLink.trim(),
      frequency: sortWeekdays([...item.elementalAction.frequency]),
      id: `${draft.id}-action-${index}`,
      benchmarkId,
      createdAt: acceptedAt,
    });
  });
  return { persona, benchmarks, actions };
}
