import { Platform } from "react-native";
import { storage } from "./storage";
import { getApiUrl, getAuthHeaders } from "./query-client";
import { logger } from "./logger";
import { getYearlyPricingConfig } from "./pricing";

type IAPModule = typeof import("react-native-iap");

let IAP: IAPModule | null = null;

async function loadIAPModule(): Promise<boolean> {
  if (Platform.OS === "web") {
    return false;
  }

  try {
    const mod = await import("react-native-iap");
    // The Nitro native module is unavailable in Expo Go — only enable IAP
    // when it's actually ready so the rest of the app degrades gracefully.
    if (!mod.isNitroReady()) {
      logger.log(
        "react-native-iap native module not available (expected in Expo Go)",
      );
      return false;
    }
    IAP = mod;
    return true;
  } catch (error) {
    logger.log("react-native-iap not available:", error);
    return false;
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
  // Lifetime is an App Store non-consumable. Do not surface an Android SKU
  // until Google Play one-time-product validation is implemented server-side.
  LIFETIME:
    Platform.OS === "ios" ? "com.resolutioncompanion.lifetime" : undefined,
};

export interface IAPProduct {
  productId: string;
  title: string;
  description: string;
  price: string;
  priceAmountMicros: number;
  priceCurrencyCode: string;
  subscriptionPeriod?: string;
  subscriptionGroupId?: string;
  introductoryOffer?: {
    paymentMode: "free-trial" | "pay-as-you-go" | "pay-up-front" | "unknown";
    periodUnit: "day" | "week" | "month" | "year" | "unknown";
    periodCount: number;
    displayPrice: string;
  };
}

export interface IAPPurchase {
  productId: string;
  transactionId: string;
  transactionReceipt: string;
  purchaseTime: number;
  /** Server-validated expiry (ISO string), when the backend returned one. */
  expirationDate?: string | null;
}

/** Human-readable StoreKit offer duration, derived only from live metadata. */
export function formatIntroOfferDuration(
  product: IAPProduct | undefined,
): string | null {
  const offer = product?.introductoryOffer;
  if (!offer || offer.paymentMode !== "free-trial") return null;
  const unit =
    offer.periodCount === 1 ? offer.periodUnit : `${offer.periodUnit}s`;
  return `${offer.periodCount} ${unit}`;
}

class IAPService {
  private isConnected = false;
  private products: IAPProduct[] = [];
  private moduleLoaded = false;
  private listenerSubscriptions: { remove: () => void }[] = [];

  async isAvailable(): Promise<boolean> {
    if (Platform.OS === "web") {
      return false;
    }

    if (!this.moduleLoaded) {
      this.moduleLoaded = await loadIAPModule();
    }

    return this.moduleLoaded && IAP !== null;
  }

  async connect(): Promise<boolean> {
    if (Platform.OS === "web" || !IAP) {
      return false;
    }

    if (this.isConnected) {
      return true;
    }

    try {
      const connectPromise = IAP.initConnection();
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("IAP connect timeout")), 8000),
      );

      await Promise.race([connectPromise, timeoutPromise]);
      this.isConnected = true;
      // Finish any transactions left unfinished by earlier sessions (e.g. a
      // purchase whose server validation failed). Unfinished transactions
      // block every future purchase attempt on this device with an
      // immediate StoreKit error, so sweep them before anything else.
      // getAvailablePurchases only covers CURRENT entitlements — an expired
      // subscription's unfinished transaction is invisible to it, so also
      // clear the pending-transaction queue directly on iOS.
      if (Platform.OS === "ios") {
        try {
          await IAP.clearTransactionIOS();
        } catch (error) {
          logger.log("clearTransactionIOS failed (non-fatal):", error);
        }
      }
      try {
        const stuck = await IAP.getAvailablePurchases();
        for (const purchase of stuck ?? []) {
          try {
            await IAP.finishTransaction({ purchase, isConsumable: false });
          } catch {}
        }
      } catch {}
      return true;
    } catch (error) {
      logger.error("Failed to connect to IAP:", error);
      return false;
    }
  }

  async disconnect(): Promise<void> {
    for (const sub of this.listenerSubscriptions) {
      try {
        sub.remove();
      } catch {}
    }
    this.listenerSubscriptions = [];

    if (this.isConnected && IAP) {
      try {
        await IAP.endConnection();
        this.isConnected = false;
      } catch (error) {
        logger.error("Failed to disconnect from IAP:", error);
      }
    }
  }

  async getProducts(): Promise<IAPProduct[]> {
    const available = await this.isAvailable();
    if (!available || !IAP) {
      logger.log("IAP not available, returning empty products");
      return [];
    }

    try {
      const connected = await this.connect();
      if (!connected) {
        logger.log("Failed to connect to store, returning empty products");
        return [];
      }

      const yearlyTestProductId =
        getYearlyPricingConfig().alternateProductId ??
        (typeof process.env.EXPO_PUBLIC_YEARLY_TEST_PRODUCT_ID === "string"
          ? process.env.EXPO_PUBLIC_YEARLY_TEST_PRODUCT_ID
          : undefined);
      const skus = [
        PRODUCT_IDS.MONTHLY,
        PRODUCT_IDS.YEARLY,
        PRODUCT_IDS.LIFETIME,
        yearlyTestProductId,
      ].filter(Boolean) as string[];

      logger.log("Fetching IAP products:", skus);

      const fetchPromise = IAP.fetchProducts({ skus, type: "all" });
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("IAP fetchProducts timeout")), 8000),
      );

      const results = await Promise.race([fetchPromise, timeoutPromise]);

      if (!results || results.length === 0) {
        logger.log("No IAP products returned from store");
        return [];
      }

      logger.log("IAP products fetched successfully:", results.length);

      this.products = results.map((product) => {
        const offers = product.subscriptionOffers ?? [];
        const intro = offers.find(
          (offer) =>
            offer.type === "introductory" || offer.paymentMode === "free-trial",
        );
        const subscriptionInfo =
          "subscriptionInfoIOS" in product
            ? product.subscriptionInfoIOS
            : undefined;
        return {
          productId: product.id,
          title: product.title,
          description: product.description,
          price: product.displayPrice,
          priceAmountMicros: Math.round((product.price ?? 0) * 1_000_000),
          priceCurrencyCode: product.currency,
          subscriptionPeriod:
            product.id === PRODUCT_IDS.LIFETIME
              ? undefined
              : product.id.toLowerCase().includes("year") ||
                  product.id.toLowerCase().includes("annual")
                ? "year"
                : "month",
          subscriptionGroupId: subscriptionInfo?.subscriptionGroupId,
          introductoryOffer: intro
            ? {
                paymentMode: intro.paymentMode ?? "unknown",
                periodUnit: intro.period?.unit ?? "unknown",
                periodCount:
                  (intro.period?.value ?? 1) * (intro.periodCount ?? 1),
                displayPrice: intro.displayPrice,
              }
            : undefined,
        };
      });

      return this.products;
    } catch (error: any) {
      logger.error("Failed to get products:", error);
      return [];
    }
  }

  /** StoreKit eligibility is per subscription group, not merely offer existence. */
  async isIntroOfferEligible(product: IAPProduct): Promise<boolean> {
    if (
      Platform.OS !== "ios" ||
      !product.subscriptionGroupId ||
      product.introductoryOffer?.paymentMode !== "free-trial"
    ) {
      return false;
    }
    const available = await this.isAvailable();
    if (!available || !IAP || !(await this.connect())) return false;
    try {
      return await IAP.isEligibleForIntroOfferIOS(product.subscriptionGroupId);
    } catch (error) {
      logger.log("Intro offer eligibility check failed:", error);
      return false;
    }
  }

  setPurchaseListener(
    onPurchase: (purchase: IAPPurchase) => void,
    onError: (error: Error) => void,
  ): void {
    if (Platform.OS === "web" || !IAP) {
      return;
    }

    const iap = IAP;

    // Clear any previously registered listeners so re-initialization
    // (e.g. reopening the paywall) doesn't double-fire callbacks.
    for (const sub of this.listenerSubscriptions) {
      try {
        sub.remove();
      } catch {}
    }
    this.listenerSubscriptions = [];

    this.listenerSubscriptions.push(
      iap.purchaseUpdatedListener(async (purchase) => {
        try {
          // e.g. Ask to Buy — the purchase is awaiting approval, not failed
          if (purchase.purchaseState === "pending") {
            logger.log("Purchase pending approval:", purchase.productId);
            onError(new Error("PURCHASE_DEFERRED"));
            return;
          }

          const iapPurchase: IAPPurchase = {
            productId: purchase.productId,
            transactionId: purchase.transactionId || purchase.id,
            // Unified token: JWS representation on iOS, purchase token on Android
            transactionReceipt: purchase.purchaseToken || "",
            purchaseTime: purchase.transactionDate || Date.now(),
          };

          const validation = await this.validateReceipt(iapPurchase);
          // Always finish the transaction — for subscriptions the
          // entitlement lives with Apple and can be re-validated via
          // Restore Purchases at any time. Leaving it unfinished blocks
          // every future purchase attempt on this device.
          try {
            await iap.finishTransaction({ purchase, isConsumable: false });
          } catch {}
          if (validation.valid) {
            iapPurchase.expirationDate = validation.expirationDate;
            onPurchase(iapPurchase);
          } else {
            onError(new Error("Receipt validation failed"));
          }
        } catch (error) {
          onError(error as Error);
        }
      }),
    );

    this.listenerSubscriptions.push(
      iap.purchaseErrorListener((error) => {
        if (error.code === iap.ErrorCode.UserCancelled) {
          logger.log("User cancelled the purchase");
          onError(new Error("USER_CANCELED"));
          return;
        }
        if (error.code === iap.ErrorCode.DeferredPayment) {
          logger.log("Purchase deferred - awaiting approval");
          onError(new Error("PURCHASE_DEFERRED"));
          return;
        }
        onError(new Error(error.message || `Purchase failed (${error.code})`));
      }),
    );
  }

  async purchaseProduct(
    productId: string,
    introductoryOfferEligibility = false,
  ): Promise<void> {
    const available = await this.isAvailable();
    if (!available || !IAP) {
      throw new Error(
        "In-app purchases are not available on this device. Please try again or contact support.",
      );
    }

    try {
      const connected = await this.connect();
      if (!connected) {
        throw new Error(
          "Unable to connect to the App Store. Please check your connection and try again.",
        );
      }

      // Result is delivered via purchaseUpdatedListener / purchaseErrorListener
      if (productId === PRODUCT_IDS.LIFETIME) {
        await IAP.requestPurchase({
          type: "in-app",
          request: {
            apple: { sku: productId },
            google: { skus: [productId] },
          },
        });
      } else {
        await IAP.requestPurchase({
          type: "subs",
          request: {
            apple: { sku: productId, introductoryOfferEligibility },
            google: { skus: [productId] },
          },
        });
      }
    } catch (error: any) {
      logger.error("Purchase failed:", error);

      const errorMessage = error?.message || String(error);
      const errorCode = error?.code || "";

      if (
        errorCode === "user-cancelled" ||
        errorMessage.includes("USER_CANCELED") ||
        errorMessage.toLowerCase().includes("cancel")
      ) {
        throw new Error("USER_CANCELED");
      }

      if (errorMessage.toLowerCase().includes("network")) {
        throw new Error(
          "Network error. Please check your connection and try again.",
        );
      }

      if (
        errorMessage.includes("sku") ||
        errorMessage.toLowerCase().includes("not found")
      ) {
        throw new Error(
          "This subscription is temporarily unavailable. Please try again later.",
        );
      }

      throw error;
    }
  }

  async restorePurchases(): Promise<IAPPurchase[]> {
    const available = await this.isAvailable();
    if (!available || !IAP) {
      return [];
    }

    try {
      const connected = await this.connect();
      if (!connected) {
        return [];
      }

      const results = await IAP.getAvailablePurchases();

      if (!results || results.length === 0) {
        return [];
      }

      const purchases: IAPPurchase[] = [];

      for (const purchase of results) {
        const iapPurchase: IAPPurchase = {
          productId: purchase.productId,
          transactionId:
            ("transactionId" in purchase && purchase.transactionId) ||
            purchase.id,
          transactionReceipt: purchase.purchaseToken || "",
          purchaseTime: purchase.transactionDate || Date.now(),
        };

        const validation = await this.validateReceipt(iapPurchase);
        if (validation.valid) {
          iapPurchase.expirationDate = validation.expirationDate;
          purchases.push(iapPurchase);
        }
        // Acknowledge regardless of validity so stale transactions can't
        // clog the queue (entitlements remain restorable from Apple).
        try {
          await IAP.finishTransaction({ purchase, isConsumable: false });
        } catch {}
      }

      return purchases;
    } catch (error) {
      logger.error("Failed to restore purchases:", error);
      return [];
    }
  }

  private async validateReceipt(
    purchase: IAPPurchase,
  ): Promise<{ valid: boolean; expirationDate: string | null }> {
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
        setTimeout(() => reject(new Error("Validation timeout")), 15000),
      );

      const response = await Promise.race([validatePromise, timeoutPromise]);
      if (!response.ok) {
        logger.error("Receipt validation server error:", response.status);
        return { valid: false, expirationDate: null };
      }
      const data = await response.json();
      return {
        valid: data.valid === true,
        expirationDate: data.expirationDate || null,
      };
    } catch (error) {
      logger.error("Receipt validation error:", error);
      return { valid: false, expirationDate: null };
    }
  }

  getPlanFromProductId(productId: string): "monthly" | "yearly" | "lifetime" {
    if (
      productId === PRODUCT_IDS.LIFETIME ||
      productId.toLowerCase().includes("lifetime")
    ) {
      return "lifetime";
    }
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
