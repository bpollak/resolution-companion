import {
  EXTRACTION_PROMPT,
  NEUTRAL_CUE,
  ONBOARDING_OPENER,
  getOnboardingSystemPrompt,
} from "@/lib/ai-prompts";

const BANNED = /persona|benchmark|elemental action|\bvot(?:e|es|ing)\b/i;

describe("onboarding conversation prompt", () => {
  const prompt = getOnboardingSystemPrompt(1);

  it("tells Coach to name two or three steps toward the stated goal", () => {
    expect(prompt).toContain(
      "name two or three concrete steps that lead to the goal they stated",
    );
    expect(prompt).toContain("Recommend one to start with");
  });

  it("forbids presenting guessed days as the person's own", () => {
    expect(prompt).toContain("Never state days the person did not give");
  });

  it("breaks down the goal, not one habit, when asked to break it down", () => {
    expect(prompt).toMatch(/break the GOAL down into those steps/);
  });

  it("keeps one question per reply and one step to start", () => {
    expect(prompt).toContain("Ask at most ONE question per reply");
    expect(prompt).toContain("They start with ONE step");
  });

  it("uses none of the retired vocabulary and no em dashes", () => {
    for (const count of [0, 1]) {
      const text = getOnboardingSystemPrompt(count);
      expect(text).not.toMatch(BANNED);
      expect(text).not.toContain("—");
    }
  });
});

describe("fixed opener", () => {
  it("is one welcome and one question, in plain words", () => {
    expect(ONBOARDING_OPENER.match(/\?/g)).toHaveLength(1);
    expect(ONBOARDING_OPENER).toContain("resolution");
    expect(ONBOARDING_OPENER).not.toMatch(BANNED);
    expect(ONBOARDING_OPENER).not.toContain("—");
  });
});

describe("extraction prompt", () => {
  it("asks for why and the schedule source on every step", () => {
    expect(EXTRACTION_PROMPT).toContain('"why"');
    expect(EXTRACTION_PROMPT).toContain('"scheduleSource"');
    expect(EXTRACTION_PROMPT).toContain(
      '"scheduleSource" is "stated" ONLY when the person gave',
    );
  });

  it("puts the chosen step first and keeps the other named steps", () => {
    expect(EXTRACTION_PROMPT).toContain("Step 1 is the step the person chose");
    expect(EXTRACTION_PROMPT).toContain(
      "Steps 2 and 3 are the other steps Coach named",
    );
  });

  it("never guesses a time of day the person did not mention", () => {
    expect(EXTRACTION_PROMPT).toContain(`exactly "${NEUTRAL_CUE}"`);
  });

  it("fits the server's 10000 character limit", () => {
    expect(EXTRACTION_PROMPT.length).toBeLessThan(10000);
  });
});
