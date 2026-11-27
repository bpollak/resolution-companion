import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  createPlanDraft,
  approvePlan,
  getPlanIssue,
  sanitizeDraft,
  shouldOfferPlanReview,
  WHY_MAX_LENGTH,
} from "@/lib/onboarding-plan";
import { STARTER_BENCHMARKS } from "@/lib/starter-plan";
import { storage } from "@/lib/storage";

jest.mock("@react-native-async-storage/async-storage", () =>
  jest.requireActual(
    "@react-native-async-storage/async-storage/jest/async-storage-mock",
  ),
);
const draft = () =>
  createPlanDraft(
    {
      personaName: "Consistent Writer",
      personaDescription: "Writes regularly",
      benchmarks: STARTER_BENCHMARKS,
    },
    true,
  );

beforeEach(async () => {
  await AsyncStorage.clear();
});

test("approval saves exactly the selected habit and never adds the setup weekday", () => {
  const proposal = draft();
  proposal.suggestions[0].elementalAction.frequency = ["Monday", "Wednesday"];
  const before = JSON.stringify(proposal);
  const plan = approvePlan(proposal);
  expect(plan.actions).toHaveLength(1);
  expect(plan.benchmarks).toHaveLength(1);
  expect(plan.actions[0].frequency).toEqual(["Monday", "Wednesday"]);
  expect(JSON.stringify(proposal)).toBe(before);
});

test("sparse suggestions are not padded, and unsupported days require a choice", () => {
  const proposal = createPlanDraft(
    {
      personaName: "Writer",
      personaDescription: "",
      benchmarks: [
        {
          ...STARTER_BENCHMARKS[0],
          elementalAction: {
            ...STARTER_BENCHMARKS[0].elementalAction,
            frequency: ["First Thursday"],
          },
        },
      ],
    },
    true,
  );
  expect(proposal.suggestions).toHaveLength(1);
  expect(proposal.suggestions[0].elementalAction.frequency).toEqual([]);
  expect(() => approvePlan(proposal)).toThrow("at least one day");
  proposal.suggestions[0].elementalAction.frequency = ["Thursday"];
  expect(approvePlan(proposal).actions[0].frequency).toEqual(["Thursday"]);
});

test("empty selection cannot commit; unselected incomplete ideas do not block approval", () => {
  const proposal = draft();
  proposal.suggestions.forEach((item) => {
    item.selected = false;
  });
  expect(() => approvePlan(proposal)).toThrow("Choose at least one");
  proposal.suggestions[0].selected = true;
  proposal.suggestions[1].elementalAction.frequency = [];
  expect(approvePlan(proposal).actions).toHaveLength(1);
});

test("draft edits survive restoration without committing a persona", async () => {
  const proposal = draft();
  proposal.suggestions[0].elementalAction.title = "Write one paragraph";
  await storage.setOnboardingDraft(proposal);
  expect(await storage.getOnboardingDraft()).toEqual(proposal);
  expect(await storage.getPersonas()).toEqual([]);
  expect(await storage.getHasOnboarded()).toBe(false);
});

test("approval is retryable and preserves all other personas, actions, and logs", async () => {
  const old = draft();
  old.name = "Existing Identity";
  old.id = "existing";
  await storage.commitOnboardingPlan(old);
  const existing = { actions: await storage.getElementalActions() };
  const log = {
    id: "log-existing",
    actionId: existing.actions[0].id,
    logDate: "2026-09-04",
    status: true,
    createdAt: "2026-09-04T18:00:00.000Z",
  };
  await storage.upsertDailyLog(log);
  const next = draft();
  await storage.commitOnboardingPlan(next);
  await storage.commitOnboardingPlan(next);
  expect(await storage.getPersonas()).toHaveLength(2);
  expect(await storage.getBenchmarks()).toHaveLength(2);
  expect(await storage.getElementalActions()).toHaveLength(2);
  expect(
    (await storage.getElementalActions()).find(
      (item) => item.id === existing.actions[0].id,
    ),
  ).toEqual(existing.actions[0]);
  expect(await storage.getDailyLogs()).toEqual([log]);
  expect((await storage.getActivePersona())?.id).toBe(next.id);
});

test("retry after a failed final marker does not duplicate the approved plan", async () => {
  const proposal = draft();
  const spy = jest
    .spyOn(storage, "setHasOnboarded")
    .mockRejectedValueOnce(new Error("disk unavailable"));
  await expect(storage.commitOnboardingPlan(proposal)).rejects.toThrow(
    "disk unavailable",
  );
  spy.mockRestore();
  expect(await storage.getHasOnboarded()).toBe(false);
  await storage.commitOnboardingPlan(proposal);
  expect(await storage.getPersonas()).toHaveLength(1);
  expect(await storage.getElementalActions()).toHaveLength(1);
  expect(await storage.getHasOnboarded()).toBe(true);
});

test("an old draft starts its schedule on acceptance, with the same timestamp on retry", async () => {
  const proposal = draft();
  proposal.createdAt = "2026-01-01T00:00:00.000Z";
  await storage.commitOnboardingPlan(proposal);
  const first = (await storage.getActivePersona())!;
  expect(first.createdAt).not.toBe(proposal.createdAt);
  expect((await storage.getElementalActions())[0].createdAt).toBe(
    first.createdAt,
  );
  await storage.commitOnboardingPlan(proposal);
  expect((await storage.getActivePersona())?.createdAt).toBe(first.createdAt);
});

test("retry reconciles orphan actions from a partial write and preserves other plans", async () => {
  const existing = draft();
  existing.name = "Existing Writer";
  await storage.commitOnboardingPlan(existing);
  const priorActions = await storage.getElementalActions();
  const proposal = draft();
  const partialPlan = approvePlan(proposal);
  await storage.setElementalActions([...priorActions, ...partialPlan.actions]);
  expect(await storage.getBenchmarks()).toHaveLength(1);

  await storage.commitOnboardingPlan(proposal);
  const actions = await storage.getElementalActions();
  expect(actions).toHaveLength(2);
  expect(new Set(actions.map((action) => action.id)).size).toBe(2);
  expect(actions[0]).toEqual(priorActions[0]);
  expect(await storage.getBenchmarks()).toHaveLength(2);
});

test("retry drops a deselected draft habit even when its benchmark write failed", async () => {
  const proposal = draft();
  proposal.suggestions[1].selected = true;
  await storage.setElementalActions(approvePlan(proposal).actions);
  proposal.suggestions[1].selected = false;

  await storage.commitOnboardingPlan(proposal);
  expect(await storage.getElementalActions()).toHaveLength(1);
  expect((await storage.getElementalActions())[0].id).toBe(
    `${proposal.id}-action-0`,
  );
  expect(await storage.getBenchmarks()).toHaveLength(1);
});

test("validation identifies the selected habit field to reveal without changing the draft", () => {
  const proposal = draft();
  proposal.suggestions[0].selected = false;
  proposal.suggestions[1].selected = true;
  proposal.suggestions[1].elementalAction.frequency = [];
  const before = JSON.stringify(proposal);
  expect(getPlanIssue(proposal)).toEqual({
    field: "days",
    suggestionIndex: 1,
    message: "Choose at least one day for habit 2.",
  });
  expect(() => approvePlan(proposal)).toThrow(getPlanIssue(proposal)!.message);
  expect(JSON.stringify(proposal)).toBe(before);
});

test("hidden incomplete optional ideas do not prevent starting a valid plan", () => {
  const proposal = draft();
  proposal.suggestions[1].title = "";
  proposal.suggestions[1].elementalAction.title = "";
  proposal.suggestions[1].elementalAction.frequency = [];
  expect(getPlanIssue(proposal)).toBeNull();
  proposal.suggestions[1].selected = true;
  expect(getPlanIssue(proposal)).toMatchObject({
    field: "action",
    suggestionIndex: 1,
  });
});

test("approved habits get a reminder time only when the anchor says when", () => {
  const proposal = draft();
  for (const item of proposal.suggestions) item.selected = true;
  const times = approvePlan(proposal).actions.map(
    (action) => action.reminderTime,
  );
  // "...my phone in the morning" → 07:30; "at my desk" and the blank-anchor
  // fallback "After I wake up" say nothing about the time of day.
  expect(times).toEqual(["07:30", undefined, undefined]);
});

describe("steps carry why and where the schedule came from", () => {
  const step = STARTER_BENCHMARKS[0];

  test("a model reply without the new fields still makes a usable draft", () => {
    const proposal = createPlanDraft(
      { personaName: "Walker", personaDescription: "", benchmarks: [step] },
      true,
    );
    expect(proposal.suggestions).toHaveLength(1);
    expect(proposal.suggestions[0].why).toBeUndefined();
    expect(proposal.suggestions[0].scheduleSource).toBe("suggested");
    expect(getPlanIssue(proposal)).toBeNull();
    expect(approvePlan(proposal).actions).toHaveLength(1);
  });

  test("why is kept, trimmed, and cut at 140 characters", () => {
    const long = "word ".repeat(60);
    const proposal = createPlanDraft(
      {
        personaName: "Walker",
        personaDescription: "",
        benchmarks: [
          { ...step, why: "  Walking most days builds the base.  " },
          { ...step, why: long },
          { ...step, why: null, scheduleSource: null },
        ],
      },
      true,
    );
    expect(proposal.suggestions[0].why).toBe(
      "Walking most days builds the base.",
    );
    expect(proposal.suggestions[1].why!.length).toBeLessThanOrEqual(
      WHY_MAX_LENGTH,
    );
    expect(proposal.suggestions[1].why!.endsWith("...")).toBe(true);
    expect("why" in proposal.suggestions[2]).toBe(false);
    expect(proposal.suggestions[2].scheduleSource).toBe("suggested");
  });

  test("only an explicit stated source is treated as the person's own days", () => {
    const proposal = createPlanDraft(
      {
        personaName: "Walker",
        personaDescription: "",
        benchmarks: [
          { ...step, scheduleSource: "stated" },
          { ...step, scheduleSource: "guessed" as never },
          step,
        ],
      },
      true,
    );
    expect(proposal.suggestions.map((item) => item.scheduleSource)).toEqual([
      "stated",
      "suggested",
      "suggested",
    ]);
  });

  test("a draft saved before 1.7.0 is normalised without losing edits", () => {
    const saved = draft();
    const legacy = JSON.parse(JSON.stringify(saved));
    for (const item of legacy.suggestions) delete item.scheduleSource;
    legacy.suggestions[0].elementalAction.title = "Walk to the corner";
    const restored = sanitizeDraft(legacy);
    expect(restored.suggestions[0].elementalAction.title).toBe(
      "Walk to the corner",
    );
    expect(
      restored.suggestions.every((item) => item.scheduleSource === "suggested"),
    ).toBe(true);
    expect(sanitizeDraft(restored)).toEqual(restored);
  });

  test("a legacy draft with no steps array is returned untouched", () => {
    const legacy = { id: "old", usesAI: false } as never;
    expect(sanitizeDraft(legacy)).toBe(legacy);
  });

  test("the saved plan does not carry draft-only fields onto the habit", () => {
    const proposal = createPlanDraft(
      {
        personaName: "Walker",
        personaDescription: "",
        benchmarks: [{ ...step, why: "It helps.", scheduleSource: "stated" }],
      },
      true,
    );
    const [action] = approvePlan(proposal).actions;
    expect(action).not.toHaveProperty("why");
    expect(action).not.toHaveProperty("scheduleSource");
  });
});

describe("inline review button", () => {
  const coach = (content: string) => ({ role: "assistant", content });
  const user = (content: string) => ({ role: "user", content });

  test("is not offered before the person has said anything", () => {
    expect(shouldOfferPlanReview([])).toBe(false);
    expect(shouldOfferPlanReview([coach("What's your resolution?")])).toBe(
      false,
    );
  });

  test("waits for Coach's reply", () => {
    expect(
      shouldOfferPlanReview([coach("Welcome."), user("Get healthier")]),
    ).toBe(false);
  });

  test("after one message, a clarifying question holds it back", () => {
    expect(
      shouldOfferPlanReview([
        coach("Welcome."),
        user("Get healthier"),
        coach("Is that more about moving or eating?"),
      ]),
    ).toBe(false);
  });

  test("a ready message shows it even when it ends with a question", () => {
    expect(
      shouldOfferPlanReview([
        coach("Welcome."),
        user("Read one page on Fridays"),
        coach("Your plan is ready to review below. Sound good?"),
      ]),
    ).toBe(true);
  });

  test("from the second message on it never depends on a question mark", () => {
    expect(
      shouldOfferPlanReview([
        coach("Welcome."),
        user("Get healthier"),
        coach("Moving or eating?"),
        user("Moving"),
        coach("Three steps: walk, stretch, stairs. Which fits?"),
      ]),
    ).toBe(true);
  });
});
