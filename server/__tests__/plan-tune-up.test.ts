import {
  parsePlanTuneUpResponse,
  planTuneUpRequestSchema,
} from "../plan-tune-up";

const request = planTuneUpRequestSchema.parse({
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

describe("plan tune-up server schemas", () => {
  it("rejects identifying and unbounded request fields", () => {
    expect(() =>
      planTuneUpRequestSchema.parse({
        ...request,
        actions: [{ ...request.actions[0], slot: 6 }],
      }),
    ).toThrow();
  });

  it("rejects unknown slots, disallowed fields, and no-op changes", () => {
    expect(() =>
      parsePlanTuneUpResponse(
        { slot: 3, changes: { frequency: ["Monday"] }, rationale: "Smaller." },
        request,
      ),
    ).toThrow("Unknown action slot");
    expect(() =>
      parsePlanTuneUpResponse(
        { slot: 0, changes: { title: "No" }, rationale: "No." },
        request,
      ),
    ).toThrow();
    expect(() =>
      parsePlanTuneUpResponse(
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
