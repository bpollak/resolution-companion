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
