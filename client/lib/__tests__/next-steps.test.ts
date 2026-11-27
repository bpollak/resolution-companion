import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  DEFAULT_KICKSTART,
  HABIT_LIMIT_MESSAGE,
  STEP_TIMEOUT_MESSAGE,
  STEP_UNAVAILABLE_MESSAGE,
  nextStepErrorMessage,
  planNextStepAdd,
  stepLimitError,
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
import { storage, type Benchmark, type DailyLog } from "@/lib/storage";
import { HABIT_LIMIT } from "@/lib/plan-editing";
import {
  WEEKDAY_ORDER,
  computeMilestoneProgress,
  getLocalDateString,
} from "@/lib/progress";
import {
  STARTER_BENCHMARKS,
  STARTER_TOPICS,
  createStarterPlanDraft,
  withStarterResolution,
} from "@/lib/starter-plan";

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
      "Your plan holds five habits. Remove one, then add this.",
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
    expect(habit.kickstartVersion).toBe(DEFAULT_KICKSTART);
    expect(DEFAULT_KICKSTART).toBe("Do the first two minutes of it.");
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
  test("adds a step Coach proposed and returns it as stored", () => {
    const proposed = step({
      id: "coach-1",
      title: "Take the stairs",
      source: "coach",
    });
    const { steps, saved } = withNextStepSaved([step()], proposed);
    expect(steps.map((item) => item.id)).toEqual(["step-1", "coach-1"]);
    expect(saved).toEqual(proposed);
  });

  test("on a title match keeps the list and returns the existing step", () => {
    const existing = step();
    const { steps, saved } = withNextStepSaved(
      [existing],
      step({ id: "coach-1", title: " stretch for 5 MINUTES " }),
    );
    expect(steps).toEqual([existing]);
    expect(saved.id).toBe("step-1");
  });

  test("makes room for the newest step at the cap", () => {
    const full = Array.from({ length: NEXT_STEP_LIMIT }, (_, index) =>
      step({ id: `step-${index}`, title: `Step ${index}` }),
    );
    const { steps, saved } = withNextStepSaved(
      full,
      step({ id: "newest", title: "Newest" }),
    );
    expect(steps).toHaveLength(NEXT_STEP_LIMIT);
    expect(steps.at(-1)?.id).toBe("newest");
    expect(steps[0].id).toBe("step-1");
    expect(saved.id).toBe("newest");
  });
});

describe("planNextStepAdd", () => {
  const milestone: Benchmark = {
    id: "m1",
    personaId: "plan",
    title: "21 walks",
    targetDate: null,
    status: "active",
    createdAt: "2026-01-01T00:00:00.000Z",
  };
  const base = {
    steps: [step()],
    stepId: "step-1",
    planBenchmarks: [milestone],
  };

  test("creates the habit under the current milestone", () => {
    const plan = planNextStepAdd({ ...base, planActions: [] });
    expect(plan).toMatchObject({
      kind: "create",
      action: { benchmarkId: "m1", title: "Stretch for 5 minutes" },
    });
  });

  test("creates nothing when a habit with that title is already in the plan", () => {
    expect(
      planNextStepAdd({
        ...base,
        planActions: [{ title: "  stretch for 5 minutes" }],
      }),
    ).toEqual({ kind: "already_added" });
  });

  test("an already added step is tidied even at the habit limit", () => {
    const five = Array.from({ length: HABIT_LIMIT - 1 }, (_, index) => ({
      title: `Habit ${index}`,
    }));
    expect(
      planNextStepAdd({
        ...base,
        planActions: [...five, { title: "Stretch for 5 minutes" }],
      }),
    ).toEqual({ kind: "already_added" });
  });

  test("refuses at the limit, with no milestone, or for an unknown step", () => {
    const five = Array.from({ length: HABIT_LIMIT }, (_, index) => ({
      title: `Habit ${index}`,
    }));
    expect(planNextStepAdd({ ...base, planActions: five })).toEqual({
      kind: "refused",
      reason: "habit_limit",
    });
    expect(
      planNextStepAdd({ ...base, planActions: [], planBenchmarks: [] }),
    ).toEqual({ kind: "refused", reason: "no_milestone" });
    expect(
      planNextStepAdd({ ...base, planActions: [], stepId: "gone" }),
    ).toEqual({ kind: "missing" });
  });
});

describe("saving and adding a step in storage", () => {
  const planHabits = async (personaId: string) => {
    const ids = new Set(
      (await storage.getBenchmarks())
        .filter((item) => item.personaId === personaId)
        .map((item) => item.id),
    );
    return (await storage.getElementalActions()).filter((item) =>
      ids.has(item.benchmarkId),
    );
  };

  test("save then add works when Coach proposes a title already saved", async () => {
    const proposal = draft();
    await storage.commitOnboardingPlan(proposal);
    const existing = normalizeNextSteps(
      (await storage.getActivePersona())!.nextSteps,
    )[0];

    const proposed = step({
      id: "coach-dup",
      title: existing.title.toUpperCase(),
      source: "coach",
    });
    const result = await storage.saveNextStep(proposal.id, proposed);
    expect(result?.saved.id).toBe(existing.id);
    expect(normalizeNextSteps(result?.persona.nextSteps)).toHaveLength(2);

    // Adding by the proposal's own id is what used to fail.
    expect((await storage.addNextStepToPlan(proposal.id, proposed.id)).ok).toBe(
      false,
    );
    const added = await storage.addNextStepToPlan(
      proposal.id,
      result!.saved.id,
    );
    expect(added.ok).toBe(true);
    expect(added.action?.title).toBe(existing.title);
    expect(await planHabits(proposal.id)).toHaveLength(2);
    expect(
      normalizeNextSteps(added.persona?.nextSteps).map((item) => item.id),
    ).not.toContain(existing.id);
  });

  test("a retry after a half-finished add does not create a second habit", async () => {
    const proposal = draft();
    await storage.commitOnboardingPlan(proposal);
    const target = normalizeNextSteps(
      (await storage.getActivePersona())!.nextSteps,
    )[0];
    const spy = jest
      .spyOn(storage, "setPersonaNextSteps")
      .mockRejectedValueOnce(new Error("disk unavailable"));
    await expect(
      storage.addNextStepToPlan(proposal.id, target.id),
    ).rejects.toThrow("disk unavailable");
    spy.mockRestore();
    // The habit was written; the step is still listed.
    expect(await planHabits(proposal.id)).toHaveLength(2);

    const retry = await storage.addNextStepToPlan(proposal.id, target.id);
    expect(retry).toMatchObject({ ok: true, action: undefined });
    expect(await planHabits(proposal.id)).toHaveLength(2);
    expect(
      normalizeNextSteps(retry.persona?.nextSteps).map((item) => item.id),
    ).not.toContain(target.id);
  });

  test("adding the same step twice in a row creates one habit", async () => {
    const proposal = draft();
    await storage.commitOnboardingPlan(proposal);
    const target = normalizeNextSteps(
      (await storage.getActivePersona())!.nextSteps,
    )[0];
    expect((await storage.addNextStepToPlan(proposal.id, target.id)).ok).toBe(
      true,
    );
    expect((await storage.addNextStepToPlan(proposal.id, target.id)).ok).toBe(
      false,
    );
    expect(await planHabits(proposal.id)).toHaveLength(2);
  });

  test("a milestone at 15 of 21 stays there after a next step is added", async () => {
    const proposal = draft();
    proposal.suggestions[0].elementalAction.frequency = [...WEEKDAY_ORDER];
    await storage.commitOnboardingPlan(proposal);
    const start = new Date();
    start.setDate(start.getDate() - 30);
    const [milestone] = await storage.getBenchmarks();
    await storage.setBenchmarks([
      { ...milestone, createdAt: start.toISOString() },
    ]);
    const [habit] = await storage.getElementalActions();
    await storage.setElementalActions([
      { ...habit, createdAt: start.toISOString() },
    ]);
    const logIndex = new Map<string, DailyLog>();
    for (let back = 1; back <= 15; back++) {
      const day = new Date();
      day.setDate(day.getDate() - back);
      const logDate = getLocalDateString(day);
      logIndex.set(`${habit.id}|${logDate}`, {
        id: `log-${back}`,
        actionId: habit.id,
        logDate,
        status: true,
        createdAt: day.toISOString(),
      });
    }
    const [benchmark] = await storage.getBenchmarks();
    const before = computeMilestoneProgress(
      benchmark,
      await storage.getElementalActions(),
      logIndex,
    );
    expect(before.daysDone).toBe(15);

    const target = normalizeNextSteps(
      (await storage.getActivePersona())!.nextSteps,
    )[0];
    expect((await storage.addNextStepToPlan(proposal.id, target.id)).ok).toBe(
      true,
    );
    const after = computeMilestoneProgress(
      benchmark,
      await storage.getElementalActions(),
      logIndex,
    );
    expect(after.actions).toHaveLength(2);
    expect(after.daysDone).toBe(15);
    expect(after.target).toBe(21);
  });
});

describe("self-made plans keep only steps that fit the resolution", () => {
  test("generic starter leftovers are not stored as next steps", async () => {
    const starterDraft = createStarterPlanDraft();
    await storage.commitOnboardingPlan(starterDraft);
    expect(await storage.getActivePersona()).not.toHaveProperty("nextSteps");
    expect(await storage.getElementalActions()).toHaveLength(1);
  });

  test("topic starters from a chip or typed resolution are stored", async () => {
    const topicDraft = withStarterResolution(
      createStarterPlanDraft(),
      "Read more",
    );
    await storage.commitOnboardingPlan(topicDraft);
    expect(
      normalizeNextSteps((await storage.getActivePersona())!.nextSteps).map(
        (item) => item.title,
      ),
    ).toEqual(
      STARTER_TOPICS.reading.benchmarks
        .slice(1)
        .map((item) => item.elementalAction.title),
    );
  });

  test("a generic starter the person rewrote is kept", async () => {
    const edited = createStarterPlanDraft();
    edited.suggestions[1].elementalAction.title = "Call my sister";
    await storage.commitOnboardingPlan(edited);
    expect(
      normalizeNextSteps((await storage.getActivePersona())!.nextSteps).map(
        (item) => item.title,
      ),
    ).toEqual(["Call my sister"]);
  });

  test("a Coach-made plan keeps its other steps whatever they are called", async () => {
    const coachDraft = createPlanDraft(
      {
        personaName: "Mover",
        personaDescription: "",
        benchmarks: STARTER_BENCHMARKS,
      },
      true,
    );
    await storage.commitOnboardingPlan(coachDraft);
    expect(
      normalizeNextSteps((await storage.getActivePersona())!.nextSteps),
    ).toHaveLength(2);
  });
});

describe("step suggestion errors", () => {
  test("a monthly limit gets its own message, not a retry prompt", () => {
    expect(nextStepErrorMessage(stepLimitError())).toBe(
      "You have reached this month's limit for step suggestions. You can still add a habit yourself in Journey.",
    );
  });

  test("an aborted wait reads as a timeout", () => {
    const aborted = new Error("Aborted");
    aborted.name = "AbortError";
    expect(nextStepErrorMessage(aborted)).toBe(STEP_TIMEOUT_MESSAGE);
  });

  test("anything else says the plan was not changed", () => {
    expect(nextStepErrorMessage(new Error("500"))).toBe(
      STEP_UNAVAILABLE_MESSAGE,
    );
    expect(nextStepErrorMessage("nope")).toBe(STEP_UNAVAILABLE_MESSAGE);
  });
});
