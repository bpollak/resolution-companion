import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  createPlanDraft,
  approvePlan,
  getPlanIssue,
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
