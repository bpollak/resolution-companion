import type { Subscription } from "@/lib/storage";
import {
  selectPreferredEntitlement,
  type StoreEntitlementResult,
} from "@/lib/subscription";

type PaidPlan = "monthly" | "yearly" | "lifetime";

export type ServerRestoreResult =
  | { ok: false }
  | {
      ok: true;
      isPremium: boolean;
      plan?: string;
      currentPeriodEnd?: string | null;
    };

export interface RestoreDeps {
  /** Asked on every restore; never read from state captured at mount. */
  isStoreAvailable: () => Promise<boolean>;
  restoreFromStore: () => Promise<StoreEntitlementResult>;
  restoreFromServer: () => Promise<ServerRestoreResult>;
  planForProduct: (productId: string) => PaidPlan;
  estimateExpiry: (plan: PaidPlan) => string | null;
  nowMs?: () => number;
}

export type RestoreOutcome =
  | { kind: "restored"; subscription: Subscription }
  /** A completed store check and the server both found nothing. */
  | { kind: "none" }
  /**
   * The store could not be asked, or holds a purchase nobody could verify.
   * A paying person can be in this state; it must never read as "none".
   */
  | { kind: "unconfirmed" }
  | { kind: "error" };

/**
 * Restore Purchases, store first. The server-side record is the fallback
 * for a reinstall whose store query comes back empty, and it may always
 * upgrade; it may only answer "nothing found" once the store has given a
 * completed answer (or there is no store module on this build at all).
 */
export async function runRestore(deps: RestoreDeps): Promise<RestoreOutcome> {
  const now = deps.nowMs ?? Date.now;
  const storeAvailable = await deps.isStoreAvailable().catch(() => false);

  let storeAnswered = !storeAvailable;
  if (storeAvailable) {
    const check = await deps.restoreFromStore().catch(() => null);
    const purchase = check
      ? selectPreferredEntitlement(check.purchases, deps.planForProduct)
      : null;
    if (purchase) {
      const plan = deps.planForProduct(purchase.productId);
      return {
        kind: "restored",
        subscription: {
          isPremium: true,
          plan,
          expiresAt:
            plan === "lifetime"
              ? null
              : purchase.expirationDate || deps.estimateExpiry(plan),
          purchasedAt: new Date(purchase.purchaseTime).toISOString(),
        },
      };
    }
    storeAnswered =
      check !== null && check.storeAvailable && check.verificationCompleted;
  }

  const server = await deps
    .restoreFromServer()
    .catch(() => ({ ok: false }) as const);
  if (server.ok && server.isPremium) {
    const plan: PaidPlan =
      server.plan === "monthly" ||
      server.plan === "yearly" ||
      server.plan === "lifetime"
        ? server.plan
        : "monthly";
    return {
      kind: "restored",
      subscription: {
        isPremium: true,
        plan,
        expiresAt:
          plan === "lifetime" ? null : (server.currentPeriodEnd ?? null),
        purchasedAt: new Date(now()).toISOString(),
      },
    };
  }
  if (!storeAnswered) return { kind: "unconfirmed" };
  return server.ok ? { kind: "none" } : { kind: "error" };
}

export function restoreOutcomeMessage(
  outcome: RestoreOutcome,
  storeName: string,
): { title: string; message: string } {
  switch (outcome.kind) {
    case "restored":
      return {
        title: "Success",
        message: "Your subscription has been restored!",
      };
    case "none":
      return {
        title: "No Purchases Found",
        message:
          "We couldn't find an active subscription for this device. If you believe this is an error, please contact support.",
      };
    case "unconfirmed":
      return {
        title: "Couldn't Confirm Yet",
        message: `We couldn't confirm your purchase with the ${storeName} just now. Any purchase you made is safe. Please check your connection and try again in a moment.`,
      };
    case "error":
      return {
        title: "Error",
        message:
          "We couldn't check your subscription right now. Please try again later or contact support.",
      };
  }
}
