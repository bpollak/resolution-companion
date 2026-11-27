// Daily AI budget breaker. The per-device monthly quotas stop one device from
// overspending; this stops the sum of all devices (a launch spike, or an
// extracted bundle key spread across many ids) from running past a known
// daily request count.

export const AI_DAILY_REQUEST_CAP_DEFAULT = 20000;
const CACHE_MS = 30_000;
const DAY_MS = 24 * 60 * 60 * 1000;

// An unset, non-numeric, zero, or negative override falls back to the default
// so a typo in the environment can neither switch coaching off nor uncap it.
export function aiDailyRequestCap(
  env: Record<string, string | undefined> = process.env,
): number {
  const raw = env.AI_DAILY_REQUEST_CAP;
  if (!raw || !/^\d+$/.test(raw.trim())) return AI_DAILY_REQUEST_CAP_DEFAULT;
  const parsed = Number(raw.trim());
  return Number.isSafeInteger(parsed) && parsed > 0
    ? parsed
    : AI_DAILY_REQUEST_CAP_DEFAULT;
}

export interface AiBudgetStatus {
  exhausted: boolean;
  // Seconds until the UTC day (the budget window) rolls over.
  retryAfterSeconds: number;
}

export interface AiBudgetDeps {
  // Total AI requests recorded for a UTC day (YYYY-MM-DD).
  fetchTotal: (day: string) => Promise<number>;
  cap?: () => number;
  now?: () => number;
  cacheMs?: number;
}

export function createAiBudgetBreaker({
  fetchTotal,
  cap = aiDailyRequestCap,
  now = () => Date.now(),
  cacheMs = CACHE_MS,
}: AiBudgetDeps) {
  let cached: { day: string; total: number; fetchedAt: number } | null = null;
  let inFlight: Promise<void> | null = null;

  async function refresh(day: string, at: number): Promise<void> {
    try {
      const total = await fetchTotal(day);
      cached = {
        day,
        total: Number.isFinite(total) ? total : 0,
        fetchedAt: at,
      };
    } catch (error) {
      // Fail open: a database hiccup must not take coaching down. The last
      // total known for today still stands; with none, requests are allowed.
      // Either way the next read waits a full cache window.
      console.error("AI budget check error (allowing requests):", error);
      cached = {
        day,
        total: cached?.day === day ? cached.total : 0,
        fetchedAt: at,
      };
    }
  }

  return {
    // At most one count query per cache window, shared by every request that
    // arrives while it is running; all other calls are answered from memory.
    async check(): Promise<AiBudgetStatus> {
      const at = now();
      const day = new Date(at).toISOString().slice(0, 10);
      if (!cached || cached.day !== day || at - cached.fetchedAt >= cacheMs) {
        if (!inFlight) {
          inFlight = refresh(day, at).finally(() => {
            inFlight = null;
          });
        }
        await inFlight;
      }
      const total = cached?.day === day ? cached.total : 0;
      return {
        exhausted: total >= cap(),
        retryAfterSeconds: Math.max(
          1,
          Math.ceil((DAY_MS - (at % DAY_MS)) / 1000),
        ),
      };
    },
  };
}
