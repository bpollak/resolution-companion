import {
  ambientPlanTuneUpRequestSchema,
  parseAmbientPlanTuneUpResponse,
} from "../ambient-plan-tune-up";

const request = ambientPlanTuneUpRequestSchema.parse({
  daysActive: 30,
  monthlyConsistency: 45,
  actions: [
    {
      slot: 0,
      frequency: ["Monday", "Wednesday"],
      anchorLink: "After breakfast",
      kickstartVersion: "Open the book",
      scheduled: 8,
      completed: 2,
      kickstarts: 1,
      factors: Object.fromEntries(
        ["energy", "time", "support", "environment", "planFit"].map(
          (factor) => [factor, { helped: 0, hindered: 0 }],
        ),
      ),
    },
  ],
});

describe("ambient plan tune-up compatibility", () => {
  it("accepts the bounded multi-action client contract", () => {
    expect(request.actions).toHaveLength(1);
    expect(Object.keys(request.actions[0])).not.toContain("id");
    expect(Object.keys(request)).not.toContain("persona");
  });

  it("rejects unknown slots, unsupported fields, and no-op changes", () => {
    expect(() =>
      parseAmbientPlanTuneUpResponse(
        { slot: 3, changes: { frequency: ["Monday"] }, rationale: "Smaller." },
        request,
      ),
    ).toThrow("Unknown action slot");
    expect(() =>
      parseAmbientPlanTuneUpResponse(
        { slot: 0, changes: { title: "No" }, rationale: "No." },
        request,
      ),
    ).toThrow();
    expect(() =>
      parseAmbientPlanTuneUpResponse(
        {
          slot: 0,
          changes: { frequency: ["Monday", "Wednesday"] },
          rationale: "Same.",
        },
        request,
      ),
    ).toThrow("did not change");
  });
});
