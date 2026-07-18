import type { Subscription } from "@/lib/storage";

export interface ServerSubscriptionStatus {
  isPremium: boolean;
  plan: string;
  currentPeriodEnd: string | null;
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
      expiresAt: server.currentPeriodEnd ?? local.expiresAt,
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
