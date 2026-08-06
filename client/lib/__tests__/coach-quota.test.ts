import {
  coachRequestAllowed,
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
