import type { Benchmark, ElementalAction } from "./storage";

export function canDeleteMilestone(
  milestoneId: string,
  milestones: Pick<Benchmark, "id" | "personaId">[],
  actions: Pick<ElementalAction, "benchmarkId">[],
): boolean {
  const milestone = milestones.find((item) => item.id === milestoneId);
  if (!milestone) return false;
  const remainingIds = new Set(
    milestones
      .filter(
        (item) =>
          item.personaId === milestone.personaId && item.id !== milestoneId,
      )
      .map((item) => item.id),
  );
  // A milestone deletion also deletes its actions; every persona needs a way to keep going.
  return actions.some((action) => remainingIds.has(action.benchmarkId));
}

/**
 * Confirmation shown before a plan is deleted. Deleting the only plan is
 * allowed for everyone: free stays at one plan at a time, so this is how a
 * free person changes direction. The extra sentence says what comes next.
 */
export function planDeletionPrompt(input: {
  name: string;
  isOnlyPlan: boolean;
}): { title: string; message: string; confirmLabel: string } {
  const base = `Delete "${input.name}"? This also removes its milestones, habits, and history.`;
  return {
    title: "Delete plan",
    message: input.isOnlyPlan
      ? `${base} You can start a new plan right after.`
      : base,
    confirmLabel: "Delete",
  };
}
