import {
  buildLocalMilestoneProposal,
  normalizeCoachMilestoneProposal,
} from "@/lib/milestone-proposal";

describe("next milestone proposal", () => {
  it("keeps the completed milestone recognizable in the private fallback", () => {
    expect(buildLocalMilestoneProposal("Run a first 5K.", null).title).toBe(
      "Deepen Run a first 5K",
    );
  });

  it("accepts one safe line and rejects empty coach output", () => {
    expect(normalizeCoachMilestoneProposal("  Run twice each week\n"))?.toEqual(
      { title: "Run twice each week", source: "coach" },
    );
    expect(normalizeCoachMilestoneProposal(" ")).toBeNull();
  });
});
