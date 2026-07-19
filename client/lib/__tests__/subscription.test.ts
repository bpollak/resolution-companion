import {
  getProfileSubscriptionCopy,
  reconcileSubscription,
  selectPreferredEntitlement,
} from "@/lib/subscription";
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

  it("accepts a lifetime entitlement without an expiry", () => {
    expect(
      reconcileSubscription(local, {
        isPremium: true,
        plan: "lifetime",
        currentPeriodEnd: null,
      }),
    ).toMatchObject({
      isPremium: true,
      plan: "lifetime",
      expiresAt: null,
    });
  });
});

describe("Profile subscription status", () => {
  it.each([
    ["monthly", "Monthly Premium"],
    ["yearly", "Yearly Premium"],
  ] as const)("shows a verified %s subscription", (plan, title) => {
    expect(
      getProfileSubscriptionCopy(
        { ...local, plan },
        "verified",
        10,
        "App Store",
      ),
    ).toEqual({
      title,
      subtitle: "Verified with the App Store",
    });
  });

  it("does not offer an upgrade while an existing purchase is still being checked", () => {
    expect(
      getProfileSubscriptionCopy(
        {
          isPremium: false,
          plan: "free",
          expiresAt: null,
          purchasedAt: null,
        },
        "checking",
        10,
        "App Store",
      ),
    ).toEqual({
      title: "Checking Premium status",
      subtitle: "Looking for an existing App Store subscription…",
    });
  });

  it("preserves Premium copy without falsely claiming verification offline", () => {
    expect(
      getProfileSubscriptionCopy(local, "unavailable", 10, "App Store"),
    ).toEqual({
      title: "Yearly Premium",
      subtitle: "Access preserved · Verification unavailable",
    });
  });
});

describe("current entitlement selection", () => {
  const planForProduct = (productId: string) =>
    productId.includes("lifetime")
      ? ("lifetime" as const)
      : productId.includes("annual")
        ? ("yearly" as const)
        : ("monthly" as const);

  it("chooses the most recent active subscription", () => {
    const monthly = { productId: "monthly", purchaseTime: 100 };
    const yearly = { productId: "annual", purchaseTime: 200 };
    expect(selectPreferredEntitlement([monthly, yearly], planForProduct)).toBe(
      yearly,
    );
  });

  it("always prefers a verified lifetime entitlement", () => {
    const lifetime = { productId: "lifetime", purchaseTime: 100 };
    const yearly = { productId: "annual", purchaseTime: 200 };
    expect(selectPreferredEntitlement([yearly, lifetime], planForProduct)).toBe(
      lifetime,
    );
  });
});
