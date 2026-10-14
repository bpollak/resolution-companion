import {
  getProfileSubscriptionCopy,
  reconcileSubscription,
  resolveSubscriptionCheck,
  sameSubscription,
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

describe("resolveSubscriptionCheck", () => {
  const planForProduct = (productId: string) =>
    productId.includes("annual") ? ("yearly" as const) : ("monthly" as const);
  // Renewed in StoreKit, but the local expiry predates the renewal
  const afterLocalExpiry = new Date("2026-08-02T00:00:00.000Z").getTime();
  const staleServer = {
    isPremium: false,
    plan: "free",
    currentPeriodEnd: null,
  };
  const unverifiedStore = {
    storeAvailable: true,
    verificationCompleted: false,
    purchases: [],
  };

  it("keeps Premium when StoreKit's entitlement could not be verified (upstream 503)", () => {
    expect(
      resolveSubscriptionCheck({
        local,
        server: staleServer,
        store: unverifiedStore,
        planForProduct,
        nowMs: afterLocalExpiry,
      }),
    ).toEqual({ subscription: local, status: "unavailable" });
  });

  it("keeps Premium when both verification and the status endpoint are down", () => {
    expect(
      resolveSubscriptionCheck({
        local,
        server: null,
        store: unverifiedStore,
        planForProduct,
        nowMs: afterLocalExpiry,
      }),
    ).toEqual({ subscription: local, status: "unavailable" });
  });

  it("does not call an unverified free account verified", () => {
    const free = { ...local, isPremium: false, plan: "free" as const };
    expect(
      resolveSubscriptionCheck({
        local: free,
        server: staleServer,
        store: unverifiedStore,
        planForProduct,
        nowMs: afterLocalExpiry,
      }),
    ).toEqual({ subscription: free, status: "unavailable" });
  });

  it("still lets the server record upgrade while StoreKit is unverified", () => {
    const free = { ...local, isPremium: false, plan: "free" as const };
    const result = resolveSubscriptionCheck({
      local: free,
      server: {
        isPremium: true,
        plan: "yearly",
        currentPeriodEnd: "2027-08-01T00:00:00.000Z",
      },
      store: unverifiedStore,
      planForProduct,
    });
    expect(result.subscription).toMatchObject({
      isPremium: true,
      plan: "yearly",
    });
    expect(result.status).toBe("verified");
  });

  it("downgrades only on a completed, empty StoreKit check", () => {
    expect(
      resolveSubscriptionCheck({
        local,
        server: null,
        store: {
          storeAvailable: true,
          verificationCompleted: true,
          purchases: [],
        },
        planForProduct,
      }),
    ).toEqual({
      subscription: {
        isPremium: false,
        plan: "free",
        expiresAt: local.expiresAt,
        purchasedAt: local.purchasedAt,
      },
      status: "verified",
    });
  });

  it("grants a verified StoreKit entitlement with its server expiry", () => {
    const result = resolveSubscriptionCheck({
      local,
      server: null,
      store: {
        storeAvailable: true,
        verificationCompleted: true,
        purchases: [
          {
            productId: "com.resolutioncompanion.annual",
            purchaseTime: Date.parse("2026-07-19T00:00:00.000Z"),
            expirationDate: "2027-07-19T00:00:00.000Z",
          },
        ],
      },
      planForProduct,
    });
    expect(result).toEqual({
      subscription: {
        isPremium: true,
        plan: "yearly",
        expiresAt: "2027-07-19T00:00:00.000Z",
        purchasedAt: "2026-07-19T00:00:00.000Z",
      },
      status: "verified",
    });
  });
});

describe("sameSubscription", () => {
  it("is true for equal fields in distinct objects", () => {
    expect(sameSubscription(local, { ...local })).toBe(true);
  });

  it("is false when any field differs", () => {
    expect(sameSubscription(local, { ...local, isPremium: false })).toBe(false);
    expect(sameSubscription(local, { ...local, plan: "monthly" })).toBe(false);
    expect(sameSubscription(local, { ...local, expiresAt: null })).toBe(false);
    expect(sameSubscription(local, { ...local, purchasedAt: null })).toBe(
      false,
    );
  });
});
