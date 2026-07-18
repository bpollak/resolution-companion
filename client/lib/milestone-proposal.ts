import type { Persona } from "@/lib/storage";

export interface MilestoneProposal {
  title: string;
  source: "coach" | "local";
}

/**
 * Instant, private fallback shown while an opted-in coach suggestion loads.
 * The completed milestone stays recognizable so the proposal is useful even
 * offline and never invents a new domain the user did not choose.
 */
export function buildLocalMilestoneProposal(
  completedTitle: string,
  persona: Persona | null,
): MilestoneProposal {
  const cleanTitle = completedTitle.trim().replace(/[.!?]+$/, "");
  const identity = persona?.name.trim();
  return {
    title: cleanTitle
      ? `Deepen ${cleanTitle}`
      : identity
        ? `Strengthen the ${identity} rhythm`
        : "Strengthen this new rhythm",
    source: "local",
  };
}

export function normalizeCoachMilestoneProposal(
  value: unknown,
): MilestoneProposal | null {
  if (typeof value !== "string") return null;
  const title = value
    .replace(/[\r\n]+/g, " ")
    .trim()
    .slice(0, 100);
  if (title.length < 3) return null;
  return { title, source: "coach" };
}
