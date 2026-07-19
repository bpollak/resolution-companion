import {
  formatIntroOfferDuration,
  iapService,
  type IAPProduct,
} from "@/lib/iap";

jest.mock("react-native", () => ({
  Platform: {
    OS: "ios",
    select: (options: Record<string, string>) => options.ios ?? options.default,
  },
}));

jest.mock("@/lib/storage", () => ({
  storage: {
    getSubscription: jest.fn(),
    setSubscription: jest.fn(),
  },
}));

jest.mock("@/lib/pricing", () => ({
  getYearlyPricingConfig: jest.fn(() => ({
    alternateProductId: null,
    newCohortStartsAt: null,
  })),
}));

function product(offer?: IAPProduct["introductoryOffer"]): IAPProduct {
  return {
    productId: "com.resolutioncompanion.annual",
    title: "Annual",
    description: "",
    price: "$24.99",
    priceAmountMicros: 24_990_000,
    priceCurrencyCode: "USD",
    introductoryOffer: offer,
  };
}

describe("introductory offer presentation", () => {
  it("formats a one-month free trial from live StoreKit metadata", () => {
    expect(
      formatIntroOfferDuration(
        product({
          paymentMode: "free-trial",
          periodUnit: "month",
          periodCount: 1,
          displayPrice: "$0.00",
        }),
      ),
    ).toBe("1 month");
  });

  it("pluralizes multi-period trials", () => {
    expect(
      formatIntroOfferDuration(
        product({
          paymentMode: "free-trial",
          periodUnit: "week",
          periodCount: 2,
          displayPrice: "$0.00",
        }),
      ),
    ).toBe("2 weeks");
  });

  it("never advertises a paid introductory offer as free", () => {
    expect(
      formatIntroOfferDuration(
        product({
          paymentMode: "pay-as-you-go",
          periodUnit: "month",
          periodCount: 1,
          displayPrice: "$0.99",
        }),
      ),
    ).toBeNull();
  });
});

describe("lifetime entitlement", () => {
  it("maps the non-consumable SKU to lifetime", () => {
    expect(
      iapService.getPlanFromProductId("com.resolutioncompanion.lifetime"),
    ).toBe("lifetime");
  });
});

describe("subscription plan mapping", () => {
  it("maps the production monthly SKU to Monthly", () => {
    expect(
      iapService.getPlanFromProductId("com.resolutioncompanion.monthly"),
    ).toBe("monthly");
  });

  it("maps the production annual SKU to Yearly", () => {
    expect(
      iapService.getPlanFromProductId("com.resolutioncompanion.annual"),
    ).toBe("yearly");
  });
});
