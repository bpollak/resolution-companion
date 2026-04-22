import { Platform } from "react-native";
import { storage } from "./storage";
import { getApiUrl, getAuthHeaders } from "./query-client";
import { logger } from "./logger";

/**
 * Thin wrapper over react-native-iap that preserves the same public surface
 * SubscriptionScreen uses. We migrated off expo-in-app-purchases (archived /
 * deprecated, flaky on Expo SDK 54 new architecture) to react-native-iap,
 * which is actively maintained.
 *
 * The native module is loaded lazily so Expo Go / web can gracefully report
 * "IAP unavailable" instead of throwing at import time.
 */

let RNIap: typeof import("react-native-iap") | null = null;
let moduleLoadAttempted = false;

async function loadIAPModule(): Promise<
  typeof import("react-native-iap") | null
> {
  if (RNIap || moduleLoadAttempted) return RNIap;
  moduleLoadAttempted = true;

  if (Platform.OS === "web") return null;

  try {
    RNIap = await import("react-native-iap");
    return RNIap;
  } catch (error) {
    logger.log("react-native-iap not available (expected in Expo Go):", error);
    return null;
  }
}

export const PRODUCT_IDS = {
  MONTHLY: Platform.select({
    ios: "com.resolutioncompanion.monthly",
    android: "premium_monthly",
    default: "premium_monthly",
  }),
  YEARLY: Platform.select({
    ios: "com.resolutioncompanion.annual",
    android: "premium_yearly",
    default: "premium_yearly",
  }),
};

export interface IAPProduct {
  productId: string;
  title: string;
  description: string;
  price: string;
  priceAmountMicros: number;
  priceCurrencyCode: string;
  subscriptionPeriod?: string;
}

export interface IAPPurchase {
  productId: string;
  transactionId: string;
  transactionReceipt: string;
  purchaseTime: number;
}

const IAP_CONNECT_TIMEOUT_MS = 8000;
const IAP_PRODUCTS_TIMEOUT_MS = 8000;
const IAP_VALIDATE_TIMEOUT_MS = 15000;

function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race<T>([
    p,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`${label} timed out`)), ms),
    ),
  ]);
}

// Normalize the RNIap subscription shape into the compact IAPProduct our UI
// expects. RNIap returns different fields per platform; we paper over that.
function normalizeProduct(s: any): IAPProduct {
  const priceAmountMicros =
    Number(s.priceAmountMicros) ||
    (typeof s.price === "number"
      ? Math.round(s.price * 1_000_000)
      : typeof s.price === "string"
        ? Math.round(parseFloat(s.price) * 1_000_000) || 0
        : 0);

  return {
    productId: s.productId,
    title: s.title || s.productId,
    description: s.description || "",
    price: s.localizedPrice || String(s.price ?? ""),
    priceAmountMicros,
    priceCurrencyCode: s.currency || s.priceCurrencyCode || "USD",
    subscriptionPeriod:
      s.subscriptionPeriodUnitIOS ||
      s.subscriptionPeriodAndroid ||
      (String(s.productId).includes("yearly") ||
      String(s.productId).includes("annual")
        ? "year"
        : "month"),
  };
}

function normalizePurchase(p: any): IAPPurchase {
  return {
    productId: p.productId,
    transactionId:
      p.transactionId ||
      p.purchaseToken ||
      p.originalTransactionIdentifierIOS ||
      "",
    transactionReceipt:
      p.transactionReceipt || p.purchaseToken || p.dataAndroid || "",
    purchaseTime:
      typeof p.transactionDate === "number"
        ? p.transactionDate
        : Number(p.transactionDate) || Date.now(),
  };
}

class IAPService {
  private isConnected = false;
  private purchaseUpdateSub: { remove: () => void } | null = null;
  private purchaseErrorSub: { remove: () => void } | null = null;
  // Cache raw subscription objects keyed by sku so Android can resolve the
  // offer token needed by requestSubscription.
  private rawSubscriptions = new Map<string, any>();

  async isAvailable(): Promise<boolean> {
    if (Platform.OS === "web") return false;
    const mod = await loadIAPModule();
    return !!mod;
  }

  async connect(): Promise<boolean> {
    if (this.isConnected) return true;
    const mod = await loadIAPModule();
    if (!mod) return false;

    try {
      await withTimeout(
        mod.initConnection(),
        IAP_CONNECT_TIMEOUT_MS,
        "IAP connect",
      );
      this.isConnected = true;
      return true;
    } catch (error) {
      logger.error("Failed to connect to IAP:", error);
      return false;
    }
  }

  async disconnect(): Promise<void> {
    const mod = await loadIAPModule();
    if (!mod || !this.isConnected) return;
    try {
      await mod.endConnection();
    } catch (error) {
      logger.error("Failed to disconnect from IAP:", error);
    }
    this.isConnected = false;
  }

  async getProducts(): Promise<IAPProduct[]> {
    const mod = await loadIAPModule();
    if (!mod) return [];

    const connected = await this.connect();
    if (!connected) return [];

    const skus = [PRODUCT_IDS.MONTHLY, PRODUCT_IDS.YEARLY].filter(
      Boolean,
    ) as string[];

    try {
      // react-native-iap renamed the argument shape a few versions back;
      // handle both the new `{ skus }` form and the older positional form.
      const getSubs = (mod as any).getSubscriptions;
      const results: any = await withTimeout(
        typeof getSubs === "function"
          ? getSubs.length <= 1
            ? getSubs({ skus })
            : getSubs(skus)
          : (mod as any).getProducts({ skus }),
        IAP_PRODUCTS_TIMEOUT_MS,
        "IAP getSubscriptions",
      );

      const list: any[] = Array.isArray(results)
        ? results
        : results?.results || [];
      if (!list.length) {
        logger.log("No IAP products returned from store");
        return [];
      }
      this.rawSubscriptions.clear();
      for (const s of list) {
        if (s?.productId) this.rawSubscriptions.set(s.productId, s);
      }
      return list.map(normalizeProduct);
    } catch (error) {
      logger.error("Failed to get products:", error);
      return [];
    }
  }

  setPurchaseListener(
    onPurchase: (p: IAPPurchase) => void,
    onError: (error: Error) => void,
  ): void {
    if (Platform.OS === "web") return;

    // Replace any prior listeners so we never have stale callbacks hanging.
    this.purchaseUpdateSub?.remove();
    this.purchaseErrorSub?.remove();
    this.purchaseUpdateSub = null;
    this.purchaseErrorSub = null;

    loadIAPModule().then((mod) => {
      if (!mod) return;

      this.purchaseUpdateSub = mod.purchaseUpdatedListener(
        async (purchase: any) => {
          const iap = normalizePurchase(purchase);
          try {
            const validated = await this.validateReceipt(iap);
            if (validated) {
              try {
                // Finish only after server-side validation so Apple/Google
                // stop redelivering the transaction.
                await (mod as any).finishTransaction({
                  purchase,
                  isConsumable: false,
                });
              } catch (finishErr) {
                logger.error(
                  "finishTransaction failed (non-fatal):",
                  finishErr,
                );
              }
              onPurchase(iap);
            } else {
              onError(new Error("Receipt validation failed"));
            }
          } catch (error) {
            onError(error as Error);
          }
        },
      );

      this.purchaseErrorSub = mod.purchaseErrorListener((error: any) => {
        const code = error?.code || "";
        if (code === "E_USER_CANCELLED" || code === "USER_CANCELED") {
          logger.log("User cancelled the purchase");
          return;
        }
        onError(
          new Error(error?.message || `Purchase failed: ${code || "unknown"}`),
        );
      });
    });
  }

  async purchaseProduct(productId: string): Promise<void> {
    const mod = await loadIAPModule();
    if (!mod) {
      throw new Error(
        "In-app purchases are not available on this device. Please try again or contact support.",
      );
    }

    const connected = await this.connect();
    if (!connected) {
      throw new Error(
        "Unable to connect to the App Store. Please check your connection and try again.",
      );
    }

    try {
      // Our products are auto-renewable subscriptions → requestSubscription.
      // The actual purchase event fires on purchaseUpdatedListener; this
      // call just initiates the native sheet.
      const request: any = { sku: productId };

      if (Platform.OS === "android") {
        // Android's Billing Library v6+ requires an explicit offer token
        // from the subscription's subscriptionOfferDetails array.
        const raw = this.rawSubscriptions.get(productId);
        const offers: any[] = raw?.subscriptionOfferDetails || [];
        if (!offers.length) {
          throw new Error(
            "No subscription offers found for this product. Please try again.",
          );
        }
        request.subscriptionOffers = offers.map((offer: any) => ({
          sku: productId,
          offerToken: offer.offerToken,
        }));
      }

      await (mod as any).requestSubscription(request);
    } catch (error: any) {
      const code = error?.code || "";
      const msg = error?.message || String(error);

      if (
        code === "E_USER_CANCELLED" ||
        code === "USER_CANCELED" ||
        msg.includes("cancel")
      ) {
        throw new Error("USER_CANCELED");
      }
      if (msg.includes("NETWORK") || msg.includes("network")) {
        throw new Error(
          "Network error. Please check your connection and try again.",
        );
      }
      if (code === "E_ITEM_UNAVAILABLE" || msg.includes("unavailable")) {
        throw new Error(
          "This subscription is temporarily unavailable. Please try again later.",
        );
      }
      throw error;
    }
  }

  async restorePurchases(): Promise<IAPPurchase[]> {
    const mod = await loadIAPModule();
    if (!mod) return [];

    const connected = await this.connect();
    if (!connected) return [];

    try {
      const available: any[] = await (mod as any).getAvailablePurchases();
      if (!available?.length) return [];

      const purchases: IAPPurchase[] = [];
      for (const p of available) {
        const iap = normalizePurchase(p);
        // Server-validate each so we never surface a restored purchase that
        // has since been refunded / revoked.
        const ok = await this.validateReceipt(iap);
        if (ok) purchases.push(iap);
      }
      return purchases;
    } catch (error) {
      logger.error("Failed to restore purchases:", error);
      return [];
    }
  }

  private async validateReceipt(purchase: IAPPurchase): Promise<boolean> {
    try {
      const deviceId = await storage.getDeviceId();

      const validatePromise = fetch(
        new URL("/api/iap/validate", getApiUrl()).toString(),
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...getAuthHeaders(),
          },
          body: JSON.stringify({
            deviceId,
            platform: Platform.OS,
            productId: purchase.productId,
            transactionId: purchase.transactionId,
            receipt: purchase.transactionReceipt,
            purchaseTime: purchase.purchaseTime,
          }),
        },
      );

      const timeoutPromise = new Promise<Response>((_, reject) =>
        setTimeout(
          () => reject(new Error("Validation timeout")),
          IAP_VALIDATE_TIMEOUT_MS,
        ),
      );

      const response = await Promise.race([validatePromise, timeoutPromise]);
      if (!response.ok) {
        logger.error("Receipt validation server error:", response.status);
        return false;
      }
      const data = await response.json();
      return data.valid === true;
    } catch (error) {
      logger.error("Receipt validation error:", error);
      return false;
    }
  }

  getPlanFromProductId(productId: string): "monthly" | "yearly" {
    if (
      productId === PRODUCT_IDS.YEARLY ||
      productId.toLowerCase().includes("yearly") ||
      productId.toLowerCase().includes("year") ||
      productId.toLowerCase().includes("annual")
    ) {
      return "yearly";
    }
    return "monthly";
  }
}

export const iapService = new IAPService();
