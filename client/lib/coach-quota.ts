export const FREE_REFLECTION_LIMIT = 10;

export function getCoachQuotaMessage(used: number, now = new Date()): string {
  const remaining = Math.max(0, FREE_REFLECTION_LIMIT - Math.max(0, used));
  if (remaining > 0) {
    return `${remaining} free check-in${remaining === 1 ? "" : "s"} left this month. Premium removes the cap.`;
  }
  const reset = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  return `Your ${FREE_REFLECTION_LIMIT} free check-ins are used. More become available ${reset.toLocaleDateString("en-US", { month: "long", day: "numeric" })}. Premium removes the cap.`;
}

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
