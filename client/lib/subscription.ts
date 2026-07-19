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
