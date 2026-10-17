import {
  STARTER_BENCHMARKS,
  SELF_SETUP_NAME,
  approvalClearsCoachTranscript,
  createStarterPlanDraft,
  isSelfSetupDraft,
  uniqueSelfSetupName,
} from "@/lib/starter-plan";
import { approvePlan, getPlanIssue } from "@/lib/onboarding-plan";

describe("createStarterPlanDraft", () => {
  it("builds a non-AI draft from the starter habits with only the anchor selected", () => {
    const draft = createStarterPlanDraft();
    expect(draft.usesAI).toBe(false);
    expect(isSelfSetupDraft(draft)).toBe(true);
    expect(draft.name).toBe(SELF_SETUP_NAME);
    expect(draft.resolution).toBe("");
    expect(draft.suggestions.map((item) => item.title)).toEqual(
      STARTER_BENCHMARKS.map((item) => item.title),
    );
    expect(draft.suggestions.map((item) => item.selected)).toEqual([
      true,
      false,
      false,
    ]);
  });

  it("is approvable as-is and saves a daily habit", () => {
    const draft = createStarterPlanDraft();
    expect(getPlanIssue(draft)).toBeNull();
    const plan = approvePlan(draft);
    expect(plan.persona.id).toBe(draft.id);
    expect(plan.persona).not.toHaveProperty("resolution");
    expect(plan.actions).toHaveLength(1);
    expect(plan.actions[0].frequency).toHaveLength(7);
  });

  it("does not share frequency arrays with the starter constants", () => {
    const draft = createStarterPlanDraft();
    draft.suggestions[0].elementalAction.frequency.pop();
    expect(STARTER_BENCHMARKS[0].elementalAction.frequency).toHaveLength(7);
  });

  it("picks a name that does not collide with existing personas", () => {
    expect(uniqueSelfSetupName([])).toBe(SELF_SETUP_NAME);
    expect(uniqueSelfSetupName([SELF_SETUP_NAME])).toBe(`${SELF_SETUP_NAME} 2`);
    expect(uniqueSelfSetupName([SELF_SETUP_NAME, `${SELF_SETUP_NAME} 2`])).toBe(
      `${SELF_SETUP_NAME} 3`,
    );
    expect(createStarterPlanDraft([SELF_SETUP_NAME]).name).toBe(
      `${SELF_SETUP_NAME} 2`,
    );
  });
});

describe("isSelfSetupDraft", () => {
  it("ignores Coach drafts and legacy manual drafts", () => {
    expect(isSelfSetupDraft(null)).toBe(false);
    expect(isSelfSetupDraft({ id: "plan-1", usesAI: false })).toBe(false);
    expect(isSelfSetupDraft({ id: "self-plan-1", usesAI: true })).toBe(false);
    expect(isSelfSetupDraft({ id: "self-plan-1", usesAI: false })).toBe(true);
  });
});

describe("approvalClearsCoachTranscript", () => {
  it("keeps a paused Coach conversation when a self-made plan is approved", () => {
    expect(approvalClearsCoachTranscript(createStarterPlanDraft())).toBe(false);
  });

  it("clears the transcript a Coach plan came from", () => {
    expect(
      approvalClearsCoachTranscript({ id: "persona-1", usesAI: true }),
    ).toBe(true);
    expect(
      approvalClearsCoachTranscript({ id: "legacy-manual", usesAI: false }),
    ).toBe(true);
  });
});
