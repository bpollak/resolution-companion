const mockInitConnection = jest.fn();
const mockEndConnection = jest.fn();
const mockGetAvailablePurchases = jest.fn();
const mockSyncIOS = jest.fn();
const mockFinishTransaction = jest.fn();
const mockCurrentEntitlementIOS = jest.fn();

jest.mock("react-native", () => ({
  Platform: {
    OS: "ios",
    select: (options: Record<string, string>) => options.ios ?? options.default,
  },
}));

jest.mock("react-native-iap", () => ({
  isNitroReady: () => true,
  initConnection: mockInitConnection,
  endConnection: mockEndConnection,
  getAvailablePurchases: mockGetAvailablePurchases,
  syncIOS: mockSyncIOS,
  finishTransaction: mockFinishTransaction,
  currentEntitlementIOS: mockCurrentEntitlementIOS,
}));

jest.mock("@/lib/storage", () => ({
  storage: { getDeviceId: jest.fn().mockResolvedValue("device-1") },
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

// Jest must install the native-module mocks before the singleton is created.
// eslint-disable-next-line import/first
import { iapService } from "@/lib/iap";

const annualPurchase = {
  id: "transaction-1",
  productId: "com.resolutioncompanion.annual",
  transactionId: "transaction-1",
  purchaseToken: "signed-transaction",
  transactionDate: 1_784_400_000_000,
};

describe("current StoreKit entitlement verification", () => {
  let consoleErrorSpy: jest.SpyInstance;

  beforeAll(() => {
    consoleErrorSpy = jest.spyOn(console, "error").mockImplementation(() => {});
  });

  beforeEach(() => {
    jest.clearAllMocks();
    mockInitConnection.mockResolvedValue(true);
    mockEndConnection.mockResolvedValue(true);
    mockSyncIOS.mockResolvedValue(true);
    mockGetAvailablePurchases.mockResolvedValue([]);
    mockCurrentEntitlementIOS.mockResolvedValue(null);
  });

  afterAll(async () => {
    await iapService.disconnect();
    consoleErrorSpy.mockRestore();
  });

  it("returns only a server-validated current entitlement", async () => {
    mockGetAvailablePurchases.mockResolvedValue([annualPurchase]);
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        valid: true,
        expirationDate: "2027-07-19T00:00:00.000Z",
      }),
    }) as jest.Mock;

    const result = await iapService.checkCurrentEntitlements();

    expect(result).toEqual({
      storeAvailable: true,
      verificationCompleted: true,
      purchases: [
        expect.objectContaining({
          productId: "com.resolutioncompanion.annual",
          transactionId: "transaction-1",
          expirationDate: "2027-07-19T00:00:00.000Z",
        }),
      ],
    });
    expect(mockFinishTransaction).not.toHaveBeenCalled();
  });

  it("does not treat a server outage as proof that Premium expired", async () => {
    mockGetAvailablePurchases.mockResolvedValue([annualPurchase]);
    global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 503 });

    await expect(iapService.checkCurrentEntitlements()).resolves.toEqual({
      storeAvailable: true,
      verificationCompleted: false,
      purchases: [],
    });
  });

  it("treats the server's retryable 503 as unverified, not invalid", async () => {
    mockGetAvailablePurchases.mockResolvedValue([annualPurchase]);
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 503,
      json: async () => ({
        valid: false,
        retryable: true,
        error: "verification_unavailable",
      }),
    }) as jest.Mock;

    await expect(iapService.checkCurrentEntitlements()).resolves.toEqual({
      storeAvailable: true,
      verificationCompleted: false,
      purchases: [],
    });
  });

  it("treats a retryable body as unverified even with a 200", async () => {
    mockGetAvailablePurchases.mockResolvedValue([annualPurchase]);
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ valid: false, retryable: true }),
    }) as jest.Mock;

    const result = await iapService.checkCurrentEntitlements();
    expect(result.verificationCompleted).toBe(false);
  });

  it("treats a network failure as unverified", async () => {
    mockGetAvailablePurchases.mockResolvedValue([annualPurchase]);
    global.fetch = jest
      .fn()
      .mockRejectedValue(new TypeError("Network request failed"));

    const result = await iapService.checkCurrentEntitlements();
    expect(result).toEqual({
      storeAvailable: true,
      verificationCompleted: false,
      purchases: [],
    });
  });

  it("accepts Apple's affirmative invalid verdict as a completed check", async () => {
    mockGetAvailablePurchases.mockResolvedValue([annualPurchase]);
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ valid: false }),
    }) as jest.Mock;

    await expect(iapService.checkCurrentEntitlements()).resolves.toEqual({
      storeAvailable: true,
      verificationCompleted: true,
      purchases: [],
    });
  });

  it("treats an empty active-entitlements result as a completed check", async () => {
    await expect(iapService.checkCurrentEntitlements()).resolves.toEqual({
      storeAvailable: true,
      verificationCompleted: true,
      purchases: [],
    });
  });

  it("synchronizes StoreKit only for an explicit restore", async () => {
    await iapService.restorePurchases();
    expect(mockSyncIOS).toHaveBeenCalledTimes(1);
  });

  describe("billing grace period", () => {
    // The library's active list drops a subscription once its expiry date
    // passes, which is exactly the state of one in a billing grace period.
    const monthlyInGrace = {
      id: "transaction-grace",
      productId: "com.resolutioncompanion.monthly",
      transactionId: "transaction-grace",
      purchaseToken: "signed-grace",
      transactionDate: 1_784_400_000_000,
    };
    const PAST = { includePastExpiry: true };
    const answer = (body: unknown, ok = true, status = 200) =>
      jest.fn().mockResolvedValue({ ok, status, json: async () => body });

    it("keeps a subscription StoreKit still entitles after its expiry date", async () => {
      mockCurrentEntitlementIOS.mockImplementation(async (sku: string) =>
        sku === "com.resolutioncompanion.monthly" ? monthlyInGrace : null,
      );
      global.fetch = answer({
        valid: true,
        expirationDate: "2026-12-01T00:00:00.000Z",
      }) as jest.Mock;

      const result = await iapService.checkCurrentEntitlements(PAST);

      expect(result).toEqual({
        storeAvailable: true,
        verificationCompleted: true,
        purchases: [
          expect.objectContaining({
            productId: "com.resolutioncompanion.monthly",
            transactionId: "transaction-grace",
            expirationDate: "2026-12-01T00:00:00.000Z",
          }),
        ],
      });
      expect(mockCurrentEntitlementIOS).toHaveBeenCalledWith(
        "com.resolutioncompanion.monthly",
      );
      expect(mockCurrentEntitlementIOS).toHaveBeenCalledWith(
        "com.resolutioncompanion.annual",
      );
    });

    it("still ends Premium when the server says the entitlement is over", async () => {
      mockCurrentEntitlementIOS.mockResolvedValue(monthlyInGrace);
      global.fetch = answer({ valid: false }) as jest.Mock;

      await expect(iapService.checkCurrentEntitlements(PAST)).resolves.toEqual({
        storeAvailable: true,
        verificationCompleted: true,
        purchases: [],
      });
    });

    it("does not ask again for a subscription the active list already has", async () => {
      mockGetAvailablePurchases.mockResolvedValue([annualPurchase]);
      global.fetch = answer({
        valid: true,
        expirationDate: "2027-07-19T00:00:00.000Z",
      }) as jest.Mock;

      const result = await iapService.checkCurrentEntitlements(PAST);

      expect(result.purchases).toHaveLength(1);
      expect(mockCurrentEntitlementIOS).not.toHaveBeenCalled();
    });

    it("cannot rule out Premium when StoreKit fails to answer", async () => {
      mockCurrentEntitlementIOS.mockRejectedValue(new Error("store busy"));

      await expect(iapService.checkCurrentEntitlements(PAST)).resolves.toEqual({
        storeAvailable: true,
        verificationCompleted: false,
        purchases: [],
      });
    });

    it("validates one entitlement once when both lookups return it", async () => {
      mockCurrentEntitlementIOS.mockResolvedValue(monthlyInGrace);
      const fetchMock = answer({
        valid: true,
        expirationDate: "2026-12-01T00:00:00.000Z",
      });
      global.fetch = fetchMock as jest.Mock;

      const result = await iapService.checkCurrentEntitlements(PAST);

      expect(result.purchases).toHaveLength(1);
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it("still completes when only one product stops resolving", async () => {
      mockCurrentEntitlementIOS.mockImplementation(async (sku: string) => {
        if (sku === "com.resolutioncompanion.annual") throw new Error("gone");
        return null;
      });

      await expect(iapService.checkCurrentEntitlements(PAST)).resolves.toEqual({
        storeAvailable: true,
        verificationCompleted: true,
        purchases: [],
      });
    });

    it("keeps an entitlement one lookup returns while the other fails", async () => {
      mockCurrentEntitlementIOS.mockImplementation(async (sku: string) => {
        if (sku === "com.resolutioncompanion.annual") throw new Error("gone");
        return monthlyInGrace;
      });
      global.fetch = answer({
        valid: true,
        expirationDate: "2026-12-01T00:00:00.000Z",
      }) as jest.Mock;

      const result = await iapService.checkCurrentEntitlements(PAST);

      expect(result.verificationCompleted).toBe(true);
      expect(result.purchases).toHaveLength(1);
    });

    it("leaves the store alone for someone with no Premium to lose", async () => {
      await expect(iapService.checkCurrentEntitlements()).resolves.toEqual({
        storeAvailable: true,
        verificationCompleted: true,
        purchases: [],
      });
      expect(mockCurrentEntitlementIOS).not.toHaveBeenCalled();
    });

    it("looks past expiry on an explicit restore", async () => {
      mockCurrentEntitlementIOS.mockResolvedValue(monthlyInGrace);
      global.fetch = answer({
        valid: true,
        expirationDate: "2026-12-01T00:00:00.000Z",
      }) as jest.Mock;

      await expect(iapService.restorePurchases()).resolves.toHaveLength(1);
    });
  });
});
