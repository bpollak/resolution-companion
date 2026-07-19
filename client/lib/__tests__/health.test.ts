import { evaluateHealthGoal, HEALTH_STEPS_THRESHOLD } from "@/lib/health";

jest.mock("react-native", () => ({ Platform: { OS: "web" } }));
jest.mock("@/lib/logger", () => ({
  logger: { error: jest.fn() },
}));

function adapter(options?: {
  steps?: number;
  workouts?: unknown[];
  mindful?: unknown[];
  error?: string;
}) {
  return {
    getStepCount: jest.fn((_query, callback) =>
      callback(
        options?.error ?? null,
        options?.error ? null : { value: options?.steps ?? 0 },
      ),
    ),
    getSamples: jest.fn((_query, callback) =>
      callback(
        options?.error ?? null,
        options?.error ? null : (options?.workouts ?? []),
      ),
    ),
    getMindfulSession: jest.fn((_query, callback) =>
      callback(
        options?.error ?? null,
        options?.error ? null : (options?.mindful ?? []),
      ),
    ),
  };
}

describe("Health auto-votes", () => {
  it("casts a step vote only at the configured threshold", async () => {
    await expect(
      evaluateHealthGoal(
        adapter({ steps: HEALTH_STEPS_THRESHOLD - 1 }),
        "steps",
      ),
    ).resolves.toBe(false);
    await expect(
      evaluateHealthGoal(adapter({ steps: HEALTH_STEPS_THRESHOLD }), "steps"),
    ).resolves.toBe(true);
  });

  it("casts workout and mindful votes from non-empty samples", async () => {
    const health = adapter({
      workouts: [{ id: "workout" }],
      mindful: [{ id: "mindful" }],
    });
    await expect(evaluateHealthGoal(health, "workout")).resolves.toBe(true);
    await expect(evaluateHealthGoal(health, "mindful")).resolves.toBe(true);
  });

  it("fails closed when Health returns an error", async () => {
    await expect(
      evaluateHealthGoal(adapter({ error: "denied" }), "workout"),
    ).resolves.toBe(false);
  });
});
