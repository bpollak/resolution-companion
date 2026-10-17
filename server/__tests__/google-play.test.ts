import {
  isGoogleAffirmativeRejection,
  parseGoogleSubscription,
  processGoogleSubscriptionNotification,
  type GoogleSubscriptionValidation,
} from "../google-play";
import { VerificationUnavailableError } from "../iap-validation";

const now = new Date("2026-07-21T12:00:00.000Z");

describe("Google Play subscription validation", () => {
  it("derives yearly Premium from verified v2 line items", () => {
    expect(
      parseGoogleSubscription(
        {
          subscriptionState: "SUBSCRIPTION_STATE_ACTIVE",
          acknowledgementState: "ACKNOWLEDGEMENT_STATE_PENDING",
          lineItems: [
            {
              productId: "premium",
              expiryTime: "2027-07-21T12:00:00.000Z",
              latestSuccessfulOrderId: "GPA.1234-5678",
              offerDetails: { basePlanId: "yearly" },
            },
          ],
        },
        now,
      ),
    ).toEqual(
      expect.objectContaining({
        valid: true,
        plan: "yearly",
        productId: "premium",
        basePlanId: "yearly",
        acknowledgementPending: true,
      }),
    );
  });

  it("keeps canceled access only through its verified paid period", () => {
    const activeCanceled = {
      subscriptionState: "SUBSCRIPTION_STATE_CANCELED",
      lineItems: [
        {
          productId: "premium",
          expiryTime: "2026-08-21T12:00:00.000Z",
          offerDetails: { basePlanId: "monthly" },
        },
      ],
    };
    expect(parseGoogleSubscription(activeCanceled, now).valid).toBe(true);
    expect(
      parseGoogleSubscription(activeCanceled, new Date("2026-09-01")).valid,
    ).toBe(false);
  });

  it("rejects pending, held, expired, and unknown products", () => {
    for (const subscriptionState of [
      "SUBSCRIPTION_STATE_PENDING",
      "SUBSCRIPTION_STATE_ON_HOLD",
      "SUBSCRIPTION_STATE_EXPIRED",
    ]) {
      expect(
        parseGoogleSubscription(
          {
            subscriptionState,
            lineItems: [
              {
                productId: "premium",
                expiryTime: "2027-07-21T12:00:00.000Z",
                offerDetails: { basePlanId: "monthly" },
              },
            ],
          },
          now,
        ).valid,
      ).toBe(false);
    }
    expect(
      parseGoogleSubscription(
        {
          subscriptionState: "SUBSCRIPTION_STATE_ACTIVE",
          lineItems: [
            {
              productId: "attacker_product",
              expiryTime: "2027-07-21T12:00:00.000Z",
            },
          ],
        },
        now,
      ).valid,
    ).toBe(false);
  });
});

describe("Google Play lookup failure classification", () => {
  it("treats Google's answer about the token as an affirmative rejection", () => {
    for (const status of [400, 404, 410]) {
      expect(isGoogleAffirmativeRejection({ response: { status } })).toBe(true);
    }
  });

  it("treats outages, our credentials, and network errors as unknown", () => {
    for (const status of [401, 403, 429, 500, 503]) {
      expect(isGoogleAffirmativeRejection({ response: { status } })).toBe(
        false,
      );
    }
    expect(isGoogleAffirmativeRejection(new Error("ECONNRESET"))).toBe(false);
    expect(
      isGoogleAffirmativeRejection(
        new Error("GOOGLE_SERVICE_ACCOUNT_KEY is not configured"),
      ),
    ).toBe(false);
    expect(isGoogleAffirmativeRejection(null)).toBe(false);
  });
});

describe("Google Play notification processing", () => {
  const validation: GoogleSubscriptionValidation = {
    valid: true,
    plan: "monthly",
    productId: "premium",
    basePlanId: "monthly",
    expiresDate: new Date("2026-11-13T12:00:00.000Z"),
    orderId: "GPA.1",
    acknowledgementPending: false,
    subscriptionState: "SUBSCRIPTION_STATE_ACTIVE",
  };

  it("acknowledges an unknown token without validating it", async () => {
    const validate = jest.fn(async () => {
      throw new VerificationUnavailableError("no credentials");
    });
    const update = jest.fn(async () => {});
    await expect(
      processGoogleSubscriptionNotification({
        findRows: async () => [],
        validate,
        update,
      }),
    ).resolves.toBe("no_match");
    expect(validate).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
  });

  it("asks for a retry when a stored token cannot be verified", async () => {
    const update = jest.fn(async () => {});
    await expect(
      processGoogleSubscriptionNotification({
        findRows: async () => [{ plan: "monthly" }],
        validate: async () => {
          throw new VerificationUnavailableError("Google Play lookup failed");
        },
        update,
      }),
    ).resolves.toBe("retry");
    expect(update).not.toHaveBeenCalled();
  });

  it("updates a stored token with the verified state", async () => {
    const row = { plan: "monthly" };
    const update = jest.fn(async () => {});
    await expect(
      processGoogleSubscriptionNotification({
        findRows: async () => [row],
        validate: async () => validation,
        update,
      }),
    ).resolves.toBe("updated");
    expect(update).toHaveBeenCalledWith(row, validation);
  });

  it("propagates unexpected errors", async () => {
    await expect(
      processGoogleSubscriptionNotification({
        findRows: async () => [{ plan: "monthly" }],
        validate: async () => {
          throw new Error("bug");
        },
        update: async () => {},
      }),
    ).rejects.toThrow("bug");
  });
});
