import {
  coachRequestAllowed,
  getCoachQuotaMessage,
  shouldConsumeCoachSession,
} from "@/lib/coach-quota";

describe("contextual Coach quota timing", () => {
  it("does not consume on open, prompt send, or failure; only a successful response", () => {
    const base = {
      isWeeklyReview: false,
      alreadyCounted: false,
      isPremium: false,
    };
    expect(
      shouldConsumeCoachSession({ ...base, successfulResponse: false }),
    ).toBe(false);
    expect(
      shouldConsumeCoachSession({ ...base, successfulResponse: true }),
    ).toBe(true);
    expect(
      shouldConsumeCoachSession({
        ...base,
        successfulResponse: true,
        alreadyCounted: true,
      }),
    ).toBe(false);
  });

  it("keeps weekly reviews free but counts plan tuning unless the session already counted", () => {
    const weekly = {
      successfulResponse: true,
      isWeeklyReview: true,
      alreadyCounted: false,
      isPremium: false,
    };
    expect(shouldConsumeCoachSession(weekly)).toBe(false);
    expect(shouldConsumeCoachSession({ ...weekly, isPlanTuneUp: true })).toBe(
      true,
    );
    expect(
      coachRequestAllowed({
        isWeeklyReview: true,
        alreadyCounted: false,
        isPremium: false,
        hasFreeSession: false,
      }),
    ).toBe(true);
    expect(
      coachRequestAllowed({
        isWeeklyReview: true,
        alreadyCounted: false,
        isPremium: false,
        hasFreeSession: false,
        isPlanTuneUp: true,
      }),
    ).toBe(false);
  });
});

describe("quota explanations", () => {
  test.each([
    [0, "10 free check-ins left"],
    [7, "3 free check-ins left"],
    [9, "1 free check-in left"],
  ])("matches usage %i", (used, expected) => {
    expect(getCoachQuotaMessage(used)).toContain(expected);
    expect(getCoachQuotaMessage(used)).not.toContain("are used");
  });
  test("exhausted quota names the next calendar-month reset across year boundaries", () => {
    expect(getCoachQuotaMessage(10, new Date(2026, 11, 31))).toContain(
      "January 1",
    );
    expect(getCoachQuotaMessage(14, new Date(2026, 8, 5))).toContain(
      "October 1",
    );
  });
});
