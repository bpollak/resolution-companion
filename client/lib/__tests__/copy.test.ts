import {
  ASK_COACH_TO_CHANGE,
  HIDE_MORE_STEPS,
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
