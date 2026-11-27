/**
 * Restore Purchases. The paywall used to decide whether to ask the store
 * from state captured when it mounted, so a restore started from the
 * "already owned" branch, or after a validation that timed out, skipped
 * StoreKit and told a paying person there was nothing to restore.
 */

import {
  restoreOutcomeMessage,
  runRestore,
  type RestoreDeps,
} from "@/lib/restore-flow";

const NOW = new Date("2026-12-01T12:00:00.000Z").getTime();

const annual = {
  productId: "com.resolutioncompanion.annual",
  transactionId: "t-annual",
  transactionReceipt: "jws",
  purchaseTime: new Date("2026-11-01T00:00:00.000Z").getTime(),
  expirationDate: "2027-11-01T00:00:00.000Z",
};
const lifetime = {
  productId: "com.resolutioncompanion.lifetime",
  transactionId: "t-life",
  transactionReceipt: "jws",
  purchaseTime: new Date("2026-06-01T00:00:00.000Z").getTime(),
};

function deps(overrides: Partial<RestoreDeps> = {}): RestoreDeps {
  return {
    isStoreAvailable: jest.fn().mockResolvedValue(true),
    restoreFromStore: jest.fn().mockResolvedValue({
      storeAvailable: true,
      verificationCompleted: true,
      purchases: [],
    }),
    restoreFromServer: jest
      .fn()
      .mockResolvedValue({ ok: true, isPremium: false }),
    planForProduct: (productId: string) =>
      productId.includes("lifetime")
        ? "lifetime"
        : productId.includes("annual")
          ? "yearly"
          : "monthly",
    estimateExpiry: () => "2099-01-01T00:00:00.000Z",
    nowMs: () => NOW,
    ...overrides,
  };
}

describe("runRestore", () => {
  it("asks the store every time it is available", async () => {
    const d = deps();
    await runRestore(d);
    expect(d.isStoreAvailable).toHaveBeenCalledTimes(1);
    expect(d.restoreFromStore).toHaveBeenCalledTimes(1);
  });

  it("restores a validated store purchase without needing the server record", async () => {
    const d = deps({
      restoreFromStore: jest.fn().mockResolvedValue({
        storeAvailable: true,
        verificationCompleted: true,
        purchases: [annual],
      }),
    });
    await expect(runRestore(d)).resolves.toEqual({
      kind: "restored",
      subscription: {
        isPremium: true,
        plan: "yearly",
        expiresAt: "2027-11-01T00:00:00.000Z",
        purchasedAt: "2026-11-01T00:00:00.000Z",
      },
    });
    expect(d.restoreFromServer).not.toHaveBeenCalled();
  });

  it("prefers lifetime over a newer subscription", async () => {
    const d = deps({
      restoreFromStore: jest.fn().mockResolvedValue({
        storeAvailable: true,
        verificationCompleted: true,
        purchases: [annual, lifetime],
      }),
    });
    const outcome = await runRestore(d);
    expect(outcome).toMatchObject({
      kind: "restored",
      subscription: { plan: "lifetime", expiresAt: null },
    });
  });

  it("falls back to the server record when the store has nothing", async () => {
    const d = deps({
      restoreFromServer: jest.fn().mockResolvedValue({
        ok: true,
        isPremium: true,
        plan: "monthly",
        currentPeriodEnd: "2026-12-20T00:00:00.000Z",
      }),
    });
    await expect(runRestore(d)).resolves.toEqual({
      kind: "restored",
      subscription: {
        isPremium: true,
        plan: "monthly",
        expiresAt: "2026-12-20T00:00:00.000Z",
        purchasedAt: new Date(NOW).toISOString(),
      },
    });
  });

  it("says nothing was found only after a completed store check and a server no", async () => {
    await expect(runRestore(deps())).resolves.toEqual({ kind: "none" });
  });

  it("never says nothing was found when validation timed out", async () => {
    // StoreKit holds the purchase; our server could not confirm it in time
    const d = deps({
      restoreFromStore: jest.fn().mockResolvedValue({
        storeAvailable: true,
        verificationCompleted: false,
        purchases: [],
      }),
    });
    await expect(runRestore(d)).resolves.toEqual({ kind: "unconfirmed" });
  });

  it("never says nothing was found when the store could not be reached", async () => {
    const d = deps({
      restoreFromStore: jest.fn().mockResolvedValue({
        storeAvailable: false,
        verificationCompleted: false,
        purchases: [],
      }),
    });
    await expect(runRestore(d)).resolves.toEqual({ kind: "unconfirmed" });
  });

  it("treats a store query that throws as unconfirmed, and still tries the server", async () => {
    const d = deps({
      restoreFromStore: jest.fn().mockRejectedValue(new Error("boom")),
    });
    await expect(runRestore(d)).resolves.toEqual({ kind: "unconfirmed" });
    expect(d.restoreFromServer).toHaveBeenCalledTimes(1);
  });

  it("lets the server record restore even when the store is unconfirmed", async () => {
    const d = deps({
      restoreFromStore: jest.fn().mockResolvedValue({
        storeAvailable: true,
        verificationCompleted: false,
        purchases: [],
      }),
      restoreFromServer: jest.fn().mockResolvedValue({
        ok: true,
        isPremium: true,
        plan: "yearly",
        currentPeriodEnd: "2027-11-01T00:00:00.000Z",
      }),
    });
    await expect(runRestore(d)).resolves.toMatchObject({ kind: "restored" });
  });

  it("reports a server failure as a failure, not as no purchases", async () => {
    const d = deps({
      restoreFromServer: jest.fn().mockResolvedValue({ ok: false }),
    });
    await expect(runRestore(d)).resolves.toEqual({ kind: "error" });
  });

  it("uses only the server record where there is no store module", async () => {
    const d = deps({ isStoreAvailable: jest.fn().mockResolvedValue(false) });
    await expect(runRestore(d)).resolves.toEqual({ kind: "none" });
    expect(d.restoreFromStore).not.toHaveBeenCalled();
  });

  it("an availability check that throws does not skip the server", async () => {
    const d = deps({
      isStoreAvailable: jest.fn().mockRejectedValue(new Error("no module")),
    });
    await expect(runRestore(d)).resolves.toEqual({ kind: "none" });
  });
});

describe("restoreOutcomeMessage", () => {
  it("keeps the existing success and not-found wording", () => {
    expect(restoreOutcomeMessage({ kind: "none" }, "App Store").title).toBe(
      "No Purchases Found",
    );
    expect(
      restoreOutcomeMessage(
        {
          kind: "restored",
          subscription: {
            isPremium: true,
            plan: "yearly",
            expiresAt: null,
            purchasedAt: null,
          },
        },
        "App Store",
      ),
    ).toEqual({
      title: "Success",
      message: "Your subscription has been restored!",
    });
  });

  it("tells an unconfirmed payer their purchase is safe and to try again", () => {
    const copy = restoreOutcomeMessage({ kind: "unconfirmed" }, "App Store");
    expect(copy.title).not.toBe("No Purchases Found");
    expect(copy.message).toContain("App Store");
    expect(copy.message).toContain("try again");
    expect(`${copy.title} ${copy.message}`).not.toMatch(/—/);
  });
});
