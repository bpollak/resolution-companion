import type { Subscription } from "@/lib/storage";

export type SubscriptionVerificationStatus =
  | "checking"
  | "verified"
  | "unavailable";

export interface ServerSubscriptionStatus {
  isPremium: boolean;
  plan: string;
  currentPeriodEnd: string | null;
}

export function getSubscriptionPlanLabel(
  plan: Subscription["plan"],
): "Free" | "Monthly" | "Yearly" | "Lifetime" {
  if (plan === "monthly") return "Monthly";
  if (plan === "yearly") return "Yearly";
  if (plan === "lifetime") return "Lifetime";
  return "Free";
}

export function getProfileSubscriptionCopy(
  subscription: Subscription,
  verificationStatus: SubscriptionVerificationStatus,
  freeCheckInsRemaining: number,
  storeName = "store",
): { title: string; subtitle: string } {
  if (subscription.isPremium) {
    const plan = getSubscriptionPlanLabel(subscription.plan);
    if (verificationStatus === "checking") {
      return {
        title: `${plan} Premium`,
        subtitle: `Checking subscription with the ${storeName}…`,
      };
    }
    if (verificationStatus === "verified") {
      return {
        title: `${plan} Premium`,
        subtitle: `Verified with the ${storeName}`,
      };
    }
    return {
      title: `${plan} Premium`,
      subtitle: "Access preserved · Verification unavailable",
    };
  }

  if (verificationStatus === "checking") {
    return {
      title: "Checking Premium status",
      subtitle: `Looking for an existing ${storeName} subscription…`,
    };
  }
  if (verificationStatus === "unavailable") {
    return {
      title: "Check Premium status",
      subtitle: `Couldn’t reach the ${storeName} · Tap to try again`,
    };
  }
  return {
    title: "Upgrade to Premium",
    subtitle:
      freeCheckInsRemaining === 0
        ? "Free check-in limit reached"
        : `${freeCheckInsRemaining} free check-ins left this month`,
  };
}

export function selectPreferredEntitlement<
  T extends { productId: string; purchaseTime: number },
>(
  purchases: T[],
  planForProduct: (productId: string) => "monthly" | "yearly" | "lifetime",
): T | null {
  if (purchases.length === 0) return null;
  return (
    purchases.find(
      (purchase) => planForProduct(purchase.productId) === "lifetime",
    ) ?? [...purchases].sort((a, b) => b.purchaseTime - a.purchaseTime)[0]
  );
}

/**
 * Reconcile local offline entitlement with server truth. A positive server
 * entitlement always wins. A negative response only revokes after the local
 * store-validated period has actually elapsed, so a delayed webhook or DB
 * write cannot strand a paying user offline.
 */
export function reconcileSubscription(
  local: Subscription,
  server: ServerSubscriptionStatus,
  nowMs: number = Date.now(),
): Subscription {
  if (server.isPremium) {
    return {
      isPremium: true,
      plan:
        server.plan === "yearly" ||
        server.plan === "monthly" ||
        server.plan === "lifetime"
          ? server.plan
          : local.plan,
      expiresAt:
        server.plan === "lifetime"
          ? null
          : (server.currentPeriodEnd ?? local.expiresAt),
      purchasedAt: local.purchasedAt,
    };
  }
  if (
    local.isPremium &&
    local.expiresAt &&
    new Date(local.expiresAt).getTime() < nowMs
  ) {
    return {
      isPremium: false,
      plan: "free",
      expiresAt: local.expiresAt,
      purchasedAt: local.purchasedAt,
    };
  }
  return local;
}

/** The parts of a StoreKit/Play current-entitlements check this needs. */
export interface StoreEntitlementResult {
  storeAvailable: boolean;
  verificationCompleted: boolean;
  purchases: {
    productId: string;
    purchaseTime: number;
    expirationDate?: string | null;
  }[];
}

/**
 * Decide the subscription to keep after a launch/profile/purchase check.
 * `store` is null where there is no store (web). A store that answered but
 * whose entitlement could not be verified (server 5xx, retryable, offline)
 * holds a purchase we can neither confirm nor rule out, so it may upgrade
 * via the server record but must never cause a downgrade to free.
 */
export function resolveSubscriptionCheck({
  local,
  server,
  store,
  planForProduct,
  nowMs = Date.now(),
}: {
  local: Subscription;
  server: ServerSubscriptionStatus | null;
  store: StoreEntitlementResult | null;
  planForProduct: (productId: string) => "monthly" | "yearly" | "lifetime";
  nowMs?: number;
}): { subscription: Subscription; status: SubscriptionVerificationStatus } {
  if (store) {
    const purchase = selectPreferredEntitlement(
      store.purchases,
      planForProduct,
    );
    if (purchase) {
      const plan = planForProduct(purchase.productId);
      return {
        subscription: {
          isPremium: true,
          plan,
          expiresAt:
            plan === "lifetime"
              ? null
              : (purchase.expirationDate ??
                (local.plan === plan ? local.expiresAt : null)),
          purchasedAt: new Date(purchase.purchaseTime).toISOString(),
        },
        status: "verified",
      };
    }

    if (store.storeAvailable && store.verificationCompleted) {
      // StoreKit's active-entitlements list is current account truth. An
      // empty completed result clears stale local/server Premium flags,
      // including lifetime access left behind by a missed revocation.
      return {
        subscription: {
          isPremium: false,
          plan: "free",
          expiresAt: local.expiresAt,
          purchasedAt: local.purchasedAt,
        },
        status: "verified",
      };
    }
  }

  // storeAvailable with verification incomplete means the store returned at
  // least one active entitlement that the server could not verify.
  const unverifiedStoreEntitlement =
    store !== null && store.storeAvailable && !store.verificationCompleted;

  if (server) {
    const next = reconcileSubscription(local, server, nowMs);
    if (unverifiedStoreEntitlement && !next.isPremium) {
      return { subscription: local, status: "unavailable" };
    }
    return {
      subscription: next,
      status: server.isPremium || !next.isPremium ? "verified" : "unavailable",
    };
  }

  // Offline or validation service unavailable. Preserve any local access,
  // but do not describe it as verified until a store-backed check succeeds.
  return { subscription: local, status: "unavailable" };
}
