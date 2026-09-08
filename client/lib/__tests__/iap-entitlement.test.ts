const mockInitConnection = jest.fn();
const mockEndConnection = jest.fn();
const mockGetAvailablePurchases = jest.fn();
const mockSyncIOS = jest.fn();
const mockFinishTransaction = jest.fn();

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
});
