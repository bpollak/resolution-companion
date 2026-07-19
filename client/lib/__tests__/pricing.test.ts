import AsyncStorage from "@react-native-async-storage/async-storage";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { chooseYearlyProductId } from "@/lib/pricing";
import { storage } from "@/lib/storage";

jest.mock("@react-native-async-storage/async-storage", () =>
  jest.requireActual(
    "@react-native-async-storage/async-storage/jest/async-storage-mock",
  ),
);

jest.mock("@/lib/storage", () => ({
  storage: {
    getSubscription: jest.fn(),
    getPersonas: jest.fn(),
    getDeviceId: jest.fn(),
  },
}));

const base = "com.resolutioncompanion.annual";
const alternate = "com.resolutioncompanion.annual.2026b";
const config = {
  alternateProductId: alternate,
  newCohortStartsAt: "2026-08-01T00:00:00.000Z",
};

describe("yearly price cohorts", () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
    jest.clearAllMocks();
    (storage.getSubscription as jest.Mock).mockResolvedValue({
      isPremium: false,
      plan: "free",
      expiresAt: null,
      purchasedAt: null,
    });
    (storage.getDeviceId as jest.Mock).mockResolvedValue("new-device-1");
  });

  it("grandfathers purchasers and existing installs onto the base price", async () => {
    (storage.getSubscription as jest.Mock).mockResolvedValue({
      purchasedAt: "2026-07-10T00:00:00.000Z",
    });
    expect(await chooseYearlyProductId(base, [base, alternate], config)).toBe(
      base,
    );

    (storage.getSubscription as jest.Mock).mockResolvedValue({
      purchasedAt: null,
    });
    (storage.getPersonas as jest.Mock).mockResolvedValue([
      { createdAt: "2026-07-10T00:00:00.000Z" },
    ]);
    expect(await chooseYearlyProductId(base, [base, alternate], config)).toBe(
      base,
    );
  });

  it("assigns only eligible new installs and keeps assignment stable", async () => {
    (storage.getPersonas as jest.Mock).mockResolvedValue([
      { createdAt: "2026-08-02T00:00:00.000Z" },
    ]);
    const first = await chooseYearlyProductId(base, [base, alternate], config);
    (storage.getDeviceId as jest.Mock).mockResolvedValue("different-device");
    const second = await chooseYearlyProductId(base, [base, alternate], config);
    expect([base, alternate]).toContain(first);
    expect(second).toBe(first);
  });

  it("does not test a product that StoreKit did not return", async () => {
    (storage.getPersonas as jest.Mock).mockResolvedValue([
      { createdAt: "2026-08-02T00:00:00.000Z" },
    ]);
    expect(await chooseYearlyProductId(base, [base], config)).toBe(base);
  });

  it("keeps the production app on the established annual product", () => {
    const appConfig = JSON.parse(
      readFileSync(resolve(__dirname, "../../../app.json"), "utf8"),
    ) as {
      expo: {
        extra?: {
          yearlyPriceTestProductId?: string;
          yearlyPriceTestStartsAt?: string;
        };
      };
    };

    expect(appConfig.expo.extra?.yearlyPriceTestProductId).toBeUndefined();
    expect(appConfig.expo.extra?.yearlyPriceTestStartsAt).toBeUndefined();
  });
});
