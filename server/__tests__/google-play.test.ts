import { parseGoogleSubscription } from "../google-play";

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
