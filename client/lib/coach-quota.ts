export function coachRequestAllowed(input: {
  isWeeklyReview: boolean;
  alreadyCounted: boolean;
  isPremium: boolean;
  hasFreeSession: boolean;
  isPlanTuneUp?: boolean;
}): boolean {
  if (input.isPremium || input.alreadyCounted) return true;
  if (input.isWeeklyReview && !input.isPlanTuneUp) return true;
  return input.hasFreeSession;
}

export function shouldConsumeCoachSession(input: {
  successfulResponse: boolean;
  isWeeklyReview: boolean;
  alreadyCounted: boolean;
  isPremium: boolean;
  isPlanTuneUp?: boolean;
}): boolean {
  return (
    input.successfulResponse &&
    !input.isPremium &&
    !input.alreadyCounted &&
    (!input.isWeeklyReview || input.isPlanTuneUp === true)
  );
}
