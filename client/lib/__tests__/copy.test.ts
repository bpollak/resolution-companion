import {
  ASK_COACH_TO_CHANGE,
  GOAL_TO_STEPS_LINE,
  HIDE_MORE_STEPS,
  MILESTONE_HINT,
  MILESTONE_PLACEHOLDER,
  PLAN_NAME_REQUIRED,
  SELF_SETUP_STARTERS_LABEL,
  WELCOME_STEPS,
  STEP_SAVED_FOR_LATER,
  moreStepsLabel,
  planReviewIntro,
  repeatsText,
  scheduleLabel,
  startWithHabitsLabel,
} from "@/lib/copy";

const WEEK = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
];

describe("repeatsText", () => {
  it("flags a milestone label that restates the habit", () => {
    expect(
      repeatsText(
        "20-minute walk after dinner (weekdays)",
        "Do a 20-minute walk after dinner, Monday-Friday",
      ),
    ).toBe(true);
  });

  it("keeps a label that adds the real goal", () => {
    expect(repeatsText("Lose 15 lb", "Do a 20-minute walk after dinner")).toBe(
      false,
    );
  });
});

describe("plan review copy", () => {
  it("counts the other steps", () => {
    expect(moreStepsLabel(1)).toBe("See 1 more step toward this");
    expect(moreStepsLabel(2)).toBe("See 2 more steps toward this");
  });

  it("keeps the Start label the regression flows select on", () => {
    expect(startWithHabitsLabel(1)).toBe("Start with 1 habit");
    expect(startWithHabitsLabel(3)).toBe("Start with 3 habits");
  });

  it("promises steps in Journey only when some are kept", () => {
    expect(planReviewIntro(2)).toBe(
      "Start with one step. The others wait for you in Journey.",
    );
    expect(planReviewIntro(0)).not.toContain("The others");
  });

  it("labels days the person did not state as a suggestion", () => {
    const days = ["Monday", "Wednesday", "Friday"];
    expect(scheduleLabel(days, "suggested")).toBe("Suggested: Mon · Wed · Fri");
    expect(scheduleLabel(days, "stated")).toBe("Mon · Wed · Fri");
    expect(scheduleLabel(WEEK, "stated")).toBe("Every day");
    expect(scheduleLabel(WEEK, "suggested")).toBe("Suggested: Every day");
  });

  it("never calls an empty schedule a suggestion", () => {
    expect(scheduleLabel([], "suggested")).toBe("Choose your days");
  });

  it("uses plain words and no em dashes", () => {
    for (const text of [
      planReviewIntro(0),
      planReviewIntro(2),
      moreStepsLabel(2),
      HIDE_MORE_STEPS,
      ASK_COACH_TO_CHANGE,
      STEP_SAVED_FOR_LATER,
    ]) {
      expect(text).not.toMatch(/persona|benchmark|vote|—/i);
    }
  });
});

describe("goal to steps framing", () => {
  it("leads with the steps question", () => {
    expect(GOAL_TO_STEPS_LINE).toBe(
      "Know the goal but not the steps? Talk it through with Coach and leave with the first one.",
    );
  });

  it("describes talking with Coach as finding the steps", () => {
    expect(WELCOME_STEPS[0]).toEqual([
      "Talk with Coach",
      "Share the goal. Coach helps you find the steps.",
    ]);
    expect(WELCOME_STEPS).toHaveLength(2);
  });

  it("asks for a plan name in plain words", () => {
    expect(PLAN_NAME_REQUIRED).toBe("Give this plan a name.");
  });

  it("uses none of the retired vocabulary and no em dashes", () => {
    for (const text of [
      GOAL_TO_STEPS_LINE,
      ...WELCOME_STEPS.flat(),
      PLAN_NAME_REQUIRED,
      MILESTONE_HINT,
      MILESTONE_PLACEHOLDER,
      SELF_SETUP_STARTERS_LABEL,
    ]) {
      expect(text).not.toMatch(/persona|benchmark|future self|vote|—/i);
    }
  });
});

describe("tidyCoachText", () => {
  const { tidyCoachText } =
    jest.requireActual<typeof import("@/lib/copy")>("@/lib/copy");

  it("replaces em dashes with commas", () => {
    expect(tidyCoachText("Great goal, thanks — what's next?")).toBe(
      "Great goal, thanks, what's next?",
    );
    expect(tidyCoachText("every scheduled action—that's a start")).toBe(
      "every scheduled action, that's a start",
    );
  });

  it("keeps hyphens and ranges", () => {
    expect(tidyCoachText("A 20-minute walk, Monday–Friday.")).toBe(
      "A 20-minute walk, Monday–Friday.",
    );
  });
});
