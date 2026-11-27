import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  HABIT_LIMIT,
  HABIT_LIMIT_MESSAGE,
  NEXT_STEP_LIMIT,
  canAddNextStep,
  draftStepId,
  milestoneForNextStep,
  nextStepToAction,
  nextStepsFromDraft,
  normalizeNextSteps,
  parseNextStepProposal,
  withNextStepSaved,
  type NextStep,
} from "@/lib/next-steps";
import { approvePlan, createPlanDraft } from "@/lib/onboarding-plan";
import { storage, type Benchmark } from "@/lib/storage";

jest.mock("@react-native-async-storage/async-storage", () =>
  jest.requireActual(
    "@react-native-async-storage/async-storage/jest/async-storage-mock",
  ),
);

const action = (title: string, frequency: string[], anchorLink = "") => ({
  title,
  frequency,
  kickstartVersion: `Start ${title.toLowerCase()}`,
  anchorLink,
});

const draft = () =>
  createPlanDraft(
    {
      personaName: "Steady Mover",
      personaDescription: "Moves most days.",
      benchmarks: [
        {
          title: "21 walks toward feeling healthier",
          why: "Walking most days builds the base.",
          scheduleSource: "stated",
          elementalAction: action(
            "Walk for 10 minutes",
            ["Monday", "Wednesday", "Friday"],
            "After dinner",
          ),
        },
        {
          title: "21 stretches",
          why: "Stretching keeps you moving without pain.",
          elementalAction: action("Stretch for 5 minutes", [
            "Tuesday",
            "Thursday",
          ]),
        },
        {
          title: "21 early nights",
          elementalAction: action("Lights out by 10:30", ["Sunday"]),
        },
      ],
    },
    true,
  );

const step = (overrides: Partial<NextStep> = {}): NextStep => ({
  id: "step-1",
  title: "Stretch for 5 minutes",
  frequency: ["Tuesday", "Thursday"],
  source: "onboarding",
  ...overrides,
});

beforeEach(async () => {
  await AsyncStorage.clear();
});

describe("nextStepsFromDraft", () => {
  test("keeps the steps the person did not start with, with their why", () => {
    const proposal = draft();
    const steps = nextStepsFromDraft(proposal, [draftStepId(proposal, 0)]);
    expect(steps.map((item) => item.title)).toEqual([
      "Stretch for 5 minutes",
      "Lights out by 10:30",
    ]);
    expect(steps[0]).toMatchObject({
      id: draftStepId(proposal, 1),
      why: "Stretching keeps you moving without pain.",
      frequency: ["Tuesday", "Thursday"],
      kickstart: "Start stretch for 5 minutes",
      source: "onboarding",
    });
    expect(steps[1]).not.toHaveProperty("why");
    expect(steps[1]).not.toHaveProperty("cue");
  });

  test("returns nothing when every step was selected", () => {
    const proposal = draft();
    expect(
      nextStepsFromDraft(
        proposal,
        proposal.suggestions.map((_, index) => draftStepId(proposal, index)),
      ),
    ).toEqual([]);
  });

  test("drops steps that could not become a habit", () => {
    const proposal = draft();
    proposal.suggestions[1].elementalAction.title = "  ";
    proposal.suggestions[2].elementalAction.frequency = [];
    expect(nextStepsFromDraft(proposal, [draftStepId(proposal, 0)])).toEqual(
      [],
    );
  });
});

describe("approval keeps the other steps on the plan", () => {
  test("unselected steps are stored as next steps, selected ones are not", () => {
    const { persona, actions } = approvePlan(draft());
    expect(actions).toHaveLength(1);
    expect(persona.nextSteps?.map((item) => item.title)).toEqual([
      "Stretch for 5 minutes",
      "Lights out by 10:30",
    ]);
  });

  test("a plan with nothing left over has no nextSteps key", () => {
    const proposal = draft();
    for (const item of proposal.suggestions) item.selected = true;
    expect(approvePlan(proposal).persona).not.toHaveProperty("nextSteps");
  });

  test("committing the plan persists the steps and removing one sticks", async () => {
    const proposal = draft();
    await storage.commitOnboardingPlan(proposal);
    const saved = (await storage.getActivePersona())!;
    expect(normalizeNextSteps(saved.nextSteps)).toHaveLength(2);

    const remaining = normalizeNextSteps(saved.nextSteps).slice(1);
    const updated = await storage.setPersonaNextSteps(saved.id, remaining);
    expect(updated?.nextSteps).toEqual(remaining);
    expect((await storage.getActivePersona())?.nextSteps).toEqual(remaining);
    expect((await storage.getPersona())?.nextSteps).toEqual(remaining);

    const cleared = await storage.setPersonaNextSteps(saved.id, []);
    expect(cleared).not.toHaveProperty("nextSteps");
    expect(cleared?.name).toBe("Steady Mover");
  });
});

describe("normalizeNextSteps", () => {
  test("a plan saved by 1.6.1 has no key and yields an empty list", () => {
    const legacyPlan = {
      id: "plan-old",
      name: "Consistent Reader",
      description: "Reads daily.",
      createdAt: "2026-11-01T08:00:00.000Z",
    } as { nextSteps?: unknown };
    expect(normalizeNextSteps(legacyPlan.nextSteps)).toEqual([]);
    expect(normalizeNextSteps(null)).toEqual([]);
    expect(normalizeNextSteps("nope")).toEqual([]);
  });

  test("drops malformed and duplicate entries from a restored backup", () => {
    const steps = normalizeNextSteps([
      step(),
      step(),
      null,
      "text",
      step({ id: "no-days", frequency: [] }),
      step({ id: "bad-days", frequency: ["Someday"] }),
      { id: "no-title", frequency: ["Monday"] },
      step({ id: "coach-1", source: "coach", frequency: ["Friday", "Monday"] }),
    ]);
    expect(steps.map((item) => item.id)).toEqual(["step-1", "coach-1"]);
    expect(steps[1].frequency).toEqual(["Monday", "Friday"]);
    expect(steps[1].source).toBe("coach");
  });

  test("caps the list", () => {
    const many = Array.from({ length: 12 }, (_, index) =>
      step({ id: `step-${index}`, title: `Step ${index}` }),
    );
    expect(normalizeNextSteps(many)).toHaveLength(NEXT_STEP_LIMIT);
  });
});

describe("canAddNextStep", () => {
  test("allows adding below five habits", () => {
    expect(canAddNextStep(0)).toEqual({ ok: true });
    expect(canAddNextStep(HABIT_LIMIT - 1)).toEqual({ ok: true });
  });

  test("refuses at the limit with a reason the screen can explain", () => {
    expect(canAddNextStep(HABIT_LIMIT)).toEqual({
      ok: false,
      reason: "habit_limit",
    });
    expect(canAddNextStep(HABIT_LIMIT + 2)).toEqual({
      ok: false,
      reason: "habit_limit",
    });
    expect(HABIT_LIMIT_MESSAGE).toBe(
      "Your plan holds five habits. Finish or remove one, then add this.",
    );
  });
});

describe("where and how a step is added", () => {
  const milestone = (
    id: string,
    status: Benchmark["status"],
    createdAt: string,
  ): Benchmark => ({
    id,
    personaId: "plan",
    title: id,
    targetDate: null,
    status,
    createdAt,
  });

  test("goes under the first unfinished milestone in plan order", () => {
    expect(
      milestoneForNextStep([
        milestone("done", "completed", "2026-01-01T00:00:00.000Z"),
        milestone("current", "active", "2026-02-01T00:00:00.000Z"),
        milestone("later", "active", "2026-03-01T00:00:00.000Z"),
      ])?.id,
    ).toBe("current");
  });

  test("falls back to the most recent milestone when all are finished", () => {
    expect(
      milestoneForNextStep([
        milestone("newest", "completed", "2026-03-01T00:00:00.000Z"),
        milestone("oldest", "completed", "2026-01-01T00:00:00.000Z"),
      ])?.id,
    ).toBe("newest");
    expect(milestoneForNextStep([])).toBeNull();
  });

  test("becomes a habit with its cue, small version, and a reminder time", () => {
    expect(
      nextStepToAction(
        step({ cue: "After dinner", kickstart: "Touch your toes once" }),
        "milestone-1",
      ),
    ).toEqual({
      benchmarkId: "milestone-1",
      title: "Stretch for 5 minutes",
      frequency: ["Tuesday", "Thursday"],
      kickstartVersion: "Touch your toes once",
      anchorLink: "After dinner",
      reminderTime: "18:30",
    });
  });

  test("never invents a time of day for a step with no cue", () => {
    const habit = nextStepToAction(step(), "milestone-1");
    expect(habit.anchorLink).toBe("At a time that fits");
    expect(habit).not.toHaveProperty("reminderTime");
    expect(habit.kickstartVersion).toBe(
      "Do stretch for 5 minutes for 2 minutes",
    );
  });
});

describe("parseNextStepProposal", () => {
  const reply = (title: string, frequency: unknown = ["Tuesday"]) => ({
    personaName: "Healthier",
    personaDescription: "Feels better.",
    benchmarks: [
      {
        title: "21 stair climbs",
        why: "Stairs add movement without extra time.",
        scheduleSource: "suggested",
        elementalAction: {
          title,
          frequency,
          kickstartVersion: "Climb one flight",
          anchorLink: "At a time that fits",
        },
      },
    ],
  });

  test("reads the proposed step as a Coach next step", () => {
    expect(parseNextStepProposal(reply("Take the stairs"), "coach-1")).toEqual({
      id: "coach-1",
      title: "Take the stairs",
      why: "Stairs add movement without extra time.",
      frequency: ["Tuesday"],
      kickstart: "Climb one flight",
      cue: "At a time that fits",
      source: "coach",
    });
  });

  test("rejects an empty title", () => {
    expect(() => parseNextStepProposal(reply("   "))).toThrow(
      "did not return a step",
    );
  });

  test("rejects a step with no usable days, and malformed replies", () => {
    expect(() => parseNextStepProposal(reply("Take the stairs", []))).toThrow();
    expect(() =>
      parseNextStepProposal(reply("Take the stairs", "daily")),
    ).toThrow();
    for (const bad of [null, "text", {}, { benchmarks: "none" }])
      expect(() => parseNextStepProposal(bad)).toThrow();
  });

  test("skips an unusable first entry and takes the next one", () => {
    const data = reply("  ");
    data.benchmarks.push(reply("Stretch for 5 minutes").benchmarks[0]);
    expect(parseNextStepProposal(data).title).toBe("Stretch for 5 minutes");
  });
});

describe("withNextStepSaved", () => {
  test("adds a step Coach proposed", () => {
    const saved = withNextStepSaved(
      [step()],
      step({ id: "coach-1", title: "Take the stairs", source: "coach" }),
    );
    expect(saved.map((item) => item.id)).toEqual(["step-1", "coach-1"]);
  });

  test("does not store the same step twice", () => {
    expect(
      withNextStepSaved(
        [step()],
        step({ id: "coach-1", title: " stretch for 5 MINUTES " }),
      ),
    ).toEqual([step()]);
  });

  test("makes room for the newest step at the cap", () => {
    const full = Array.from({ length: NEXT_STEP_LIMIT }, (_, index) =>
      step({ id: `step-${index}`, title: `Step ${index}` }),
    );
    const saved = withNextStepSaved(
      full,
      step({ id: "newest", title: "Newest" }),
    );
    expect(saved).toHaveLength(NEXT_STEP_LIMIT);
    expect(saved.at(-1)?.id).toBe("newest");
    expect(saved[0].id).toBe("step-1");
  });
});
