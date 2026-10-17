import {
  approvePlan,
  daysUntil,
  deriveResolution,
  pickResolutionMessage,
  newYearStartOption,
  planStartInstant,
  type OnboardingPlanDraft,
} from "@/lib/onboarding-plan";
import { actionIsScheduledOnDate } from "@/lib/journey-date";

const draft = (
  extra: Partial<OnboardingPlanDraft> = {},
): OnboardingPlanDraft => ({
  id: "plan-1",
  createdAt: "2026-12-10T18:00:00.000Z",
  name: "Consistent Mover",
  description: "I walk after dinner on weekdays.",
  usesAI: true,
  suggestions: [
    {
      selected: true,
      title: "21 evening walks toward losing 15 lb",
      elementalAction: {
        title: "Walk 20 minutes after dinner",
        frequency: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"],
        kickstartVersion: "Step outside for 2 minutes",
        anchorLink: "After dinner",
      },
    },
  ],
  ...extra,
});

describe("deriveResolution", () => {
  it("keeps the person's words and trims the lead-in", () => {
    expect(
      deriveResolution(
        "I want to get in shape this year and lose about 15 pounds",
      ),
    ).toBe("Get in shape this year and lose about 15 pounds");
    expect(deriveResolution("My resolution is to read 20 books.")).toBe(
      "Read 20 books",
    );
    expect(deriveResolution("Save money")).toBe("Save money");
  });

  it("uses only the first sentence and caps the length", () => {
    expect(deriveResolution("Sleep better. I stay up too late.")).toBe(
      "Sleep better",
    );
    expect(deriveResolution("x".repeat(200)).length).toBeLessThanOrEqual(90);
    expect(deriveResolution("   ")).toBe("");
  });
});

describe("deriveResolution with everyday phrasing", () => {
  it.each([
    ["I'd like to read more", "Read more"],
    ["I’d like to read more", "Read more"],
    ["I'm going to run a 5k", "Run a 5k"],
    ["My New Year’s resolution is to save $5,000", "Save $5,000"],
    [
      "To be honest, I want to sleep more",
      "To be honest, I want to sleep more",
    ],
    ["Lose 15 lbs. by March", "Lose 15 lbs. by March"],
    ["Lose 15 pounds by June.", "Lose 15 pounds by June"],
    ["Walk 3 mi.", "Walk 3 mi."],
    ["hi", ""],
  ])("%s -> %s", (input, expected) => {
    expect(deriveResolution(input)).toBe(expected);
  });

  it("prefers a specific outcome after a one-tap starter", () => {
    expect(pickResolutionMessage(["Get fit", "Lose 15 pounds by June"])).toBe(
      "Lose 15 pounds by June",
    );
    expect(
      pickResolutionMessage(["I want to run a marathon", "3 days a week"]),
    ).toBe("I want to run a marathon");
    expect(pickResolutionMessage(["Save money", "Weekdays"])).toBe(
      "Save money",
    );
  });
});

describe("newYearStartOption", () => {
  it("offers January 1 from Nov 15 through Dec 31", () => {
    expect(newYearStartOption(new Date(2026, 10, 14))).toBeNull();
    expect(newYearStartOption(new Date(2026, 10, 15))).toBe("2027-01-01");
    expect(newYearStartOption(new Date(2026, 11, 31))).toBe("2027-01-01");
    expect(newYearStartOption(new Date(2027, 0, 1))).toBeNull();
    expect(newYearStartOption(new Date(2026, 8, 28))).toBeNull();
  });
});

describe("planning ahead for January 1", () => {
  const now = new Date(2026, 11, 10, 10);

  it("starts the plan at local midnight on the chosen day", () => {
    const start = planStartInstant({ startDate: "2027-01-01" }, now);
    expect(start?.getFullYear()).toBe(2027);
    expect(start?.getMonth()).toBe(0);
    expect(start?.getDate()).toBe(1);
    expect(start?.getHours()).toBe(0);
  });

  it("ignores past or malformed start dates", () => {
    expect(planStartInstant({ startDate: "2026-01-01" }, now)).toBeNull();
    expect(planStartInstant({ startDate: "soon" }, now)).toBeNull();
    expect(planStartInstant({}, now)).toBeNull();
  });

  it("schedules nothing before the start date, so no misses pile up", () => {
    const start = planStartInstant({ startDate: "2027-01-01" }, now)!;
    const plan = approvePlan(
      draft({ startDate: "2027-01-01" }),
      start.toISOString(),
    );
    const [action] = plan.actions;
    expect(actionIsScheduledOnDate(action, new Date(2026, 11, 14))).toBe(false);
    expect(actionIsScheduledOnDate(action, new Date(2026, 11, 31))).toBe(false);
    expect(actionIsScheduledOnDate(action, new Date(2027, 0, 1))).toBe(true);
  });

  it("carries the resolution onto the saved plan", () => {
    const plan = approvePlan(draft({ resolution: "  Lose 15 pounds " }));
    expect(plan.persona.resolution).toBe("Lose 15 pounds");
    expect(approvePlan(draft()).persona.resolution).toBeUndefined();
  });
});

describe("countdown to the start day", () => {
  it("counts whole days between local midnights", () => {
    const jan1 = new Date(2027, 0, 1);
    expect(daysUntil(jan1, new Date(2026, 11, 31, 23, 30))).toBe(1);
    expect(daysUntil(jan1, new Date(2026, 11, 10, 8))).toBe(22);
    // DST change in between does not shift the count.
    expect(daysUntil(new Date(2026, 10, 2), new Date(2026, 10, 1, 12))).toBe(1);
  });
});
