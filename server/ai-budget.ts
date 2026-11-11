// Global daily ceiling on model tokens across every device. Per-device
// quotas and per-IP limits do not bound total spend: device ids are an
// unauthenticated header, so a caller can mint fresh quotas. This breaker
// is the last wall before the OpenAI bill.

const DEFAULT_DAILY_TOKEN_BUDGET = 30_000_000;
const CACHE_MS = 60_000;

export function dailyTokenBudget(
  raw: string | undefined = process.env.AI_DAILY_TOKEN_BUDGET,
): number {
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0
    ? Math.floor(parsed)
    : DEFAULT_DAILY_TOKEN_BUDGET;
}

export function utcDay(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10);
}

export type DailyTokenReader = (day: string) => Promise<number>;

export function createDailyBudgetGuard(
  readTokens: DailyTokenReader,
  options: { budget?: () => number; now?: () => number } = {},
) {
  const budget = options.budget ?? (() => dailyTokenBudget());
  const now = options.now ?? (() => Date.now());
  let cached: { day: string; tokens: number; at: number } | null = null;

  return {
    // True when today's recorded tokens have reached the budget. The count
    // is cached for a minute so the hot path adds no query per request; a
    // read failure reports false because per-device quotas still apply and
    // metering trouble should not take coaching down.
    async isExhausted(): Promise<boolean> {
      const at = now();
      const day = utcDay(new Date(at));
      if (!cached || cached.day !== day || at - cached.at >= CACHE_MS) {
        try {
          cached = { day, tokens: await readTokens(day), at };
        } catch (error) {
          console.error("AI daily budget read error:", error);
          return false;
        }
      }
      return cached.tokens >= budget();
    },
  };
}
