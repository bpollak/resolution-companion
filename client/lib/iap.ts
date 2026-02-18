import { Platform, NativeModules } from "react-native";
import { storage } from "./storage";
import { getApiUrl } from "./query-client";

let InAppPurchases: typeof import("expo-in-app-purchases") | null = null;

async function loadIAPModule(): Promise<boolean> {
  if (Platform.OS === "web") {
    return false;
  }
  
  // Check if the native module exists before attempting to import
  // This prevents the "Cannot find native module" error in Expo Go
  if (!NativeModules.ExpoInAppPurchases) {
    console.log("ExpoInAppPurchases native module not available (expected in Expo Go)");
    return false;
  }
  
  try {
    InAppPurchases = await import("expo-in-app-purchases");
    return true;
  } catch (error) {
    console.log("expo-in-app-purchases not available:", error);
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

class IAPService {
  private isConnected = false;
  private products: IAPProduct[] = [];
  private moduleLoaded = false;

  async isAvailable(): Promise<boolean> {
    if (Platform.OS === "web") {
      return false;
    }
    
    if (!this.moduleLoaded) {
      this.moduleLoaded = await loadIAPModule();
    }
    
    return this.moduleLoaded && InAppPurchases !== null;
  }

  async connect(): Promise<boolean> {
    if (Platform.OS === "web" || !InAppPurchases) {
      return false;
    }

    if (this.isConnected) {
      return true;
    }

    // Check if connectAsync is actually available (may not be in some environments)
    if (typeof InAppPurchases.connectAsync !== "function") {
      console.log("IAP connectAsync not available in this environment");
      return false;
    }

    try {
      // Add timeout to prevent hanging
      const connectPromise = InAppPurchases.connectAsync();
      const timeoutPromise = new Promise<never>((_, reject) => 
        setTimeout(() => reject(new Error("IAP connect timeout")), 8000)
      );
      
      await Promise.race([connectPromise, timeoutPromise]);
      this.isConnected = true;
      return true;
    } catch (error) {
      console.error("Failed to connect to IAP:", error);
      return false;
    }
  }

  async disconnect(): Promise<void> {
    if (this.isConnected && InAppPurchases && typeof InAppPurchases.disconnectAsync === "function") {
      try {
        await InAppPurchases.disconnectAsync();
        this.isConnected = false;
      } catch (error) {
        console.error("Failed to disconnect from IAP:", error);
      }
    }
  }

  async getProducts(): Promise<IAPProduct[]> {
    const available = await this.isAvailable();
    if (!available || !InAppPurchases) {
      console.log("IAP not available, returning empty products");
      return [];
    }

    try {
      const connected = await this.connect();
      if (!connected) {
        console.log("Failed to connect to store, returning empty products");
        return [];
      }

      const productIds = [PRODUCT_IDS.MONTHLY, PRODUCT_IDS.YEARLY].filter(
        Boolean
      ) as string[];

      if (typeof InAppPurchases.getProductsAsync !== "function") {
        console.log("IAP getProductsAsync not available");
        return [];
      }

      console.log("Fetching IAP products:", productIds);
      
      // Add timeout to prevent hanging
      const getProductsPromise = InAppPurchases.getProductsAsync(productIds);
      const timeoutPromise = new Promise<never>((_, reject) => 
        setTimeout(() => reject(new Error("IAP getProducts timeout")), 8000)
      );
      
      const { results } = await Promise.race([getProductsPromise, timeoutPromise]) as { results: any[] };

      if (!results || results.length === 0) {
        console.log("No IAP products returned from store");
        return [];
      }

      console.log("IAP products fetched successfully:", results.length);
      
      this.products = results.map((product) => ({
        productId: product.productId,
        title: product.title,
        description: product.description,
        price: product.price,
        priceAmountMicros: product.priceAmountMicros,
        priceCurrencyCode: product.priceCurrencyCode,
        subscriptionPeriod:
          product.subscriptionPeriod ||
          (product.productId.includes("yearly") ? "year" : "month"),
      }));

      return this.products;
    } catch (error: any) {
      console.error("Failed to get products:", error);
      
      const errorMessage = error?.message || String(error);
      if (errorMessage.includes("BILLING_UNAVAILABLE")) {
        console.log("Billing unavailable - App Store/Play Store not configured");
      }
      
      return [];
    }
  }

  setPurchaseListener(
    onPurchase: (purchase: IAPPurchase) => void,
    onError: (error: Error) => void
  ): void {
    if (Platform.OS === "web" || !InAppPurchases) {
      return;
    }

    // Check if setPurchaseListener is available
    if (typeof InAppPurchases.setPurchaseListener !== "function") {
      console.log("IAP setPurchaseListener not available");
      return;
    }

    const IAP = InAppPurchases;
    IAP.setPurchaseListener(async (result: { responseCode: number; results?: any[] }) => {
      const { responseCode, results } = result;
      if (responseCode === IAP.IAPResponseCode.OK && results) {
        for (const purchase of results) {
          if (purchase.acknowledged) {
            continue;
          }

          const iapPurchase: IAPPurchase = {
            productId: purchase.productId,
            transactionId: purchase.orderId || "",
            transactionReceipt: purchase.transactionReceipt || "",
            purchaseTime: purchase.purchaseTime || Date.now(),
          };

          try {
            const validated = await this.validateReceipt(iapPurchase);
            if (validated) {
              if (typeof IAP.finishTransactionAsync === "function") {
                await IAP.finishTransactionAsync(purchase, true);
              }
              onPurchase(iapPurchase);
            } else {
              onError(new Error("Receipt validation failed"));
            }
          } catch (error) {
            onError(error as Error);
          }
        }
      } else if (responseCode === IAP.IAPResponseCode.USER_CANCELED) {
        console.log("User cancelled the purchase");
      } else if (responseCode === IAP.IAPResponseCode.DEFERRED) {
        console.log("Purchase deferred - awaiting approval");
      } else {
        onError(new Error(`Purchase failed with code: ${responseCode}`));
      }
    });
  }

  async purchaseProduct(productId: string): Promise<void> {
    const available = await this.isAvailable();
    if (!available || !InAppPurchases) {
      throw new Error("In-app purchases are not available on this device. Please try again or contact support.");
    }

    try {
      const connected = await this.connect();
      if (!connected) {
        throw new Error("Unable to connect to the App Store. Please check your connection and try again.");
      }

      if (typeof InAppPurchases.purchaseItemAsync !== "function") {
        throw new Error("In-app purchases are not supported in this environment.");
      }

      await InAppPurchases.purchaseItemAsync(productId);
    } catch (error: any) {
      console.error("Purchase failed:", error);
      
      const errorMessage = error?.message || String(error);
      
      if (errorMessage.includes("E_USER_CANCELLED") || 
          errorMessage.includes("USER_CANCELED") ||
          errorMessage.includes("cancel")) {
        throw new Error("USER_CANCELED");
      }
      
      if (errorMessage.includes("NETWORK") || errorMessage.includes("network")) {
        throw new Error("Network error. Please check your connection and try again.");
      }
      
      if (errorMessage.includes("ITEM_UNAVAILABLE") || errorMessage.includes("not found")) {
        throw new Error("This subscription is temporarily unavailable. Please try again later.");
      }
      
      throw error;
    }
  }

  async restorePurchases(): Promise<IAPPurchase[]> {
    const available = await this.isAvailable();
    if (!available || !InAppPurchases) {
      return [];
    }

    try {
      const connected = await this.connect();
      if (!connected) {
        return [];
      }

      if (typeof InAppPurchases.getPurchaseHistoryAsync !== "function") {
        console.log("IAP getPurchaseHistoryAsync not available");
        return [];
      }

      const { results } = await InAppPurchases.getPurchaseHistoryAsync();

      if (!results || results.length === 0) {
        return [];
      }

      const purchases: IAPPurchase[] = [];

      for (const purchase of results) {
        const iapPurchase: IAPPurchase = {
          productId: purchase.productId,
          transactionId: purchase.orderId || "",
          transactionReceipt: purchase.transactionReceipt || "",
          purchaseTime: purchase.purchaseTime || Date.now(),
        };

        const validated = await this.validateReceipt(iapPurchase);
        if (validated) {
          purchases.push(iapPurchase);
        }
      }

      return purchases;
    } catch (error) {
      console.error("Failed to restore purchases:", error);
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
          },
          body: JSON.stringify({
            deviceId,
            platform: Platform.OS,
            productId: purchase.productId,
            transactionId: purchase.transactionId,
            receipt: purchase.transactionReceipt,
            purchaseTime: purchase.purchaseTime,
          }),
        }
      );

      const timeoutPromise = new Promise<Response>((_, reject) =>
        setTimeout(() => reject(new Error("Validation timeout")), 15000)
      );

      const response = await Promise.race([validatePromise, timeoutPromise]);
      if (!response.ok) {
        console.error("Receipt validation server error:", response.status);
        return false;
      }
      const data = await response.json();
      return data.valid === true;
    } catch (error) {
      console.error("Receipt validation error:", error);
      // Fail closed — do not grant access when validation cannot be confirmed
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
