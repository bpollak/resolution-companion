import { reconcileSubscription } from "@/lib/subscription";
import type { Subscription } from "@/lib/storage";

const local: Subscription = {
  isPremium: true,
  plan: "yearly",
  expiresAt: "2026-08-01T00:00:00.000Z",
  purchasedAt: "2026-07-01T00:00:00.000Z",
};

describe("reconcileSubscription", () => {
  it("accepts an active server entitlement and its validated expiry", () => {
    expect(
      reconcileSubscription(local, {
        isPremium: true,
        plan: "monthly",
        currentPeriodEnd: "2026-09-01T00:00:00.000Z",
      }),
    ).toMatchObject({
      isPremium: true,
      plan: "monthly",
      expiresAt: "2026-09-01T00:00:00.000Z",
    });
  });

  it("keeps paid access when the server disagrees but local expiry is future", () => {
    expect(
      reconcileSubscription(
        local,
        { isPremium: false, plan: "free", currentPeriodEnd: null },
        new Date("2026-07-18T00:00:00.000Z").getTime(),
      ),
    ).toBe(local);
  });

  it("revokes stale local premium only after its expiry", () => {
    expect(
      reconcileSubscription(
        local,
        { isPremium: false, plan: "free", currentPeriodEnd: null },
        new Date("2026-08-02T00:00:00.000Z").getTime(),
      ),
    ).toEqual({
      isPremium: false,
      plan: "free",
      expiresAt: local.expiresAt,
      purchasedAt: local.purchasedAt,
    });
  });
});
