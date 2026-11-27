import {
  COACH_CAPABILITIES,
  EXTRACTION_PROMPT,
  NEUTRAL_CUE,
  NEXT_STEP_PROMPT,
  ONBOARDING_OPENER,
  asksForHelp,
  buildCoachPlanContext,
  buildNextStepRequest,
  coachFirstMessageInstruction,
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

describe("Coach sheet prompt pieces", () => {
  it("names the habit and milestone the sheet was opened from", () => {
    const context = buildCoachPlanContext({
      originHabit: "Walk for 10 minutes",
      originMilestone: "21 walks toward feeling healthier",
      milestoneTitles: ["21 walks toward feeling healthier", "21 early nights"],
    })!;
    expect(context).toContain(
      'They opened Coach from this habit: "Walk for 10 minutes"',
    );
    expect(context).toContain(
      'It belongs to this milestone: "21 walks toward feeling healthier"',
    );
    expect(context).toContain(
      'Milestones in their plan: "21 walks toward feeling healthier"; "21 early nights".',
    );
  });

  it("names a milestone origin on its own, and still lists the plan", () => {
    const context = buildCoachPlanContext({
      originMilestone: "21 early nights",
      milestoneTitles: ["21 early nights"],
    })!;
    expect(context).toContain(
      'They opened Coach from this milestone: "21 early nights"',
    );
    expect(context).not.toContain("this habit");
    expect(
      buildCoachPlanContext({ milestoneTitles: ["21 early nights"] }),
    ).toContain("Milestones in their plan");
    expect(buildCoachPlanContext({ milestoneTitles: [] })).toBeUndefined();
  });

  it("helps at once when the first message asks for help", () => {
    const base = { isWeekly: false, justStarted: true, isAhead: false };
    const helping = coachFirstMessageInstruction({
      ...base,
      isBehind: false,
      askedForHelp: true,
    });
    expect(helping).toContain("They asked for help, so help in this reply");
    expect(helping).not.toContain("Ask ONE simple question about their");

    const opener = coachFirstMessageInstruction({
      ...base,
      isBehind: true,
      askedForHelp: false,
    });
    expect(opener).toContain("Ask ONE simple question about their experience");
    expect(opener).not.toContain("They asked for help");
  });

  it("keeps the weekly ritual opener even for a help-shaped prompt", () => {
    expect(
      coachFirstMessageInstruction({
        isWeekly: true,
        askedForHelp: true,
        justStarted: false,
        isAhead: true,
        isBehind: false,
      }),
    ).toContain("weekly ritual");
  });

  it("tells a request from an open remark", () => {
    for (const text of [
      "Help me get started with today’s habit.",
      "What should I do on days I travel?",
      "I'm stuck on mornings",
      "can you break this down",
      "Any tips for evenings",
    ])
      expect(asksForHelp(text)).toBe(true);
    for (const text of ["", undefined, "Today went well.", "I did my walk"])
      expect(asksForHelp(text)).toBe(false);
  });

  it("says plainly what Coach can and cannot change", () => {
    expect(COACH_CAPABILITIES).toContain(
      "You cannot change the plan from this chat",
    );
    expect(COACH_CAPABILITIES).toContain('"Help me add a next step"');
    expect(COACH_CAPABILITIES).toContain("open Journey");
    expect(COACH_CAPABILITIES).not.toMatch(/persona|benchmark|—/i);
  });
});

describe("one-step proposal prompt", () => {
  it("asks for one new step that differs from the plan's habits", () => {
    expect(NEXT_STEP_PROMPT).toContain("ONE next step");
    expect(NEXT_STEP_PROMPT).toContain(
      "clearly different from every habit already in the plan",
    );
    expect(NEXT_STEP_PROMPT).toContain(
      '"scheduleSource" is always "suggested"',
    );
    expect(NEXT_STEP_PROMPT).toContain(`exactly "${NEUTRAL_CUE}"`);
    expect(NEXT_STEP_PROMPT.length).toBeLessThan(10000);
  });

  it("sends the resolution, existing habits, and the person's request", () => {
    const request = buildNextStepRequest({
      resolution: "Get healthier this year",
      existingHabits: ["Walk for 10 minutes", " "],
      userMessage: "something for evenings",
    });
    expect(request).toContain("My resolution: Get healthier this year.");
    expect(request).toContain(
      'Habits already in my plan: "Walk for 10 minutes".',
    );
    expect(request).toContain("What I asked for: something for evenings");
    expect(
      buildNextStepRequest({ resolution: "", existingHabits: [] }),
    ).toContain("Suggest one next step I could add.");
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
