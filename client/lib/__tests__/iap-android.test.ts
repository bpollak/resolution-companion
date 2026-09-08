const mockFetchProducts = jest.fn();
const mockRequestPurchase = jest.fn();

jest.mock("react-native", () => ({
  Platform: {
    OS: "android",
    select: (options: Record<string, string>) =>
      options.android ?? options.default,
  },
}));

jest.mock("react-native-iap", () => ({
  isNitroReady: () => true,
  initConnection: jest.fn().mockResolvedValue(true),
  endConnection: jest.fn().mockResolvedValue(true),
  fetchProducts: mockFetchProducts,
  requestPurchase: mockRequestPurchase,
  getAvailablePurchases: jest.fn().mockResolvedValue([]),
}));

jest.mock("@/lib/storage", () => ({
  storage: { getDeviceId: jest.fn().mockResolvedValue("device-android") },
}));

jest.mock("@/lib/query-client", () => ({
  getApiUrl: () => "https://example.com",
  getAuthHeaders: () => ({ Authorization: "Bearer test" }),
}));

jest.mock("@/lib/pricing", () => ({
  getYearlyPricingConfig: () => ({
    alternateProductId: null,
    newCohortStartsAt: null,
  }),
}));

// eslint-disable-next-line import/first
import { iapService, PRODUCT_IDS } from "@/lib/iap";

describe("Google Play base-plan purchases", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRequestPurchase.mockResolvedValue(undefined);
    mockFetchProducts.mockResolvedValue([
      {
        id: "premium",
        platform: "android",
        type: "subs",
        title: "Premium",
        description: "Premium access",
        displayPrice: "$2.99",
        currency: "USD",
        subscriptionOffers: [
          {
            id: "",
            basePlanIdAndroid: "monthly",
            offerTokenAndroid: "monthly-token",
            displayPrice: "$2.99",
            price: 2.99,
            currency: "USD",
          },
          {
            id: "",
            basePlanIdAndroid: "yearly",
            offerTokenAndroid: "yearly-token",
            displayPrice: "$24.99",
            price: 24.99,
            currency: "USD",
          },
        ],
      },
    ]);
  });

  afterAll(async () => {
    await iapService.disconnect();
  });

  it("loads one Play product as two normalized plans", async () => {
    const products = await iapService.getProducts();
    expect(PRODUCT_IDS.MONTHLY).toBe("premium");
    expect(PRODUCT_IDS.YEARLY).toBe("premium");
    expect(products).toEqual([
      expect.objectContaining({
        plan: "monthly",
        basePlanId: "monthly",
        offerToken: "monthly-token",
      }),
      expect.objectContaining({
        plan: "yearly",
        basePlanId: "yearly",
        offerToken: "yearly-token",
      }),
    ]);
  });

  it("passes the selected base-plan offer token to Play Billing", async () => {
    const products = await iapService.getProducts();
    await iapService.purchaseProduct(products[1]);
    expect(mockRequestPurchase).toHaveBeenCalledWith({
      type: "subs",
      request: expect.objectContaining({
        google: {
          skus: ["premium"],
          subscriptionOffers: [{ sku: "premium", offerToken: "yearly-token" }],
        },
      }),
    });
  });
});
