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

export function approvePlan(
  draft: OnboardingPlanDraft,
  acceptedAt = new Date().toISOString(),
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
