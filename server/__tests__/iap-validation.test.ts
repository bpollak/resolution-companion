import {
  LIFETIME_PRODUCT_ID,
  VerificationUnavailableError,
  appleExpiryDate,
  appleGracePeriodEnd,
  extendedPeriodEnd,
  evaluateAppleTransaction,
  isAppleLookupRejection,
  STOREKIT2_CREDENTIALS_MISSING,
  isRetryableLegacyStatus,
  looksLikeStoreKit2Jws,
  validateAppleReceiptLegacy,
  validateAppleTransactionV2,
  type AppleRenewalInfo,
  type AppleTransactionInfo,
  type AppleV2Deps,
} from "../iap-validation";

const NOW = Date.parse("2026-10-13T12:00:00.000Z");
const MONTHLY = "com.resolutioncompanion.monthly";

function jsonResponse(status: number, body: unknown = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as unknown as Response;
}

function v2Deps(
  responses: (Response | Error)[],
  txInfo: AppleTransactionInfo | Error = {},
  overrides: Partial<AppleV2Deps> = {},
) {
  const urls: string[] = [];
  const fetchImpl = jest.fn(async (url: string) => {
    urls.push(url);
    const next = responses.shift();
    if (!next) throw new Error("unexpected fetch");
    if (next instanceof Error) throw next;
    return next;
  }) as unknown as typeof fetch;
  const verifyTransaction = jest.fn(async () => {
    if (txInfo instanceof Error) throw txInfo;
    return txInfo;
  });
  const deps: AppleV2Deps = {
    createJWT: async () => "jwt",
    verifyTransaction,
    sandboxOnly: false,
    fetchImpl,
    now: () => NOW,
    ...overrides,
  };
  return { deps, urls, verifyTransaction };
}

beforeEach(() => {
  jest.spyOn(console, "error").mockImplementation(() => {});
  jest.spyOn(console, "log").mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe("Apple expiry mapping", () => {
  it("maps a missing expiry to null instead of an Invalid Date", () => {
    expect(appleExpiryDate(undefined)).toBeNull();
    expect(appleExpiryDate(null)).toBeNull();
    expect(appleExpiryDate(Number.NaN)).toBeNull();
    expect(appleExpiryDate(NOW)?.toISOString()).toBe(
      "2026-10-13T12:00:00.000Z",
    );
  });

  it("grants lifetime with a null expiry", () => {
    expect(
      evaluateAppleTransaction(
        { productId: LIFETIME_PRODUCT_ID, originalTransactionId: "orig-1" },
        LIFETIME_PRODUCT_ID,
        NOW,
      ),
    ).toEqual({
      valid: true,
      expiresDate: null,
      originalTransactionId: "orig-1",
    });
  });

  it("rejects revoked, expired, and mismatched transactions", () => {
    expect(
      evaluateAppleTransaction(
        { productId: LIFETIME_PRODUCT_ID, revocationDate: NOW - 1 },
        LIFETIME_PRODUCT_ID,
        NOW,
      ).valid,
    ).toBe(false);
    expect(
      evaluateAppleTransaction(
        { productId: MONTHLY, expiresDate: NOW - 1 },
        MONTHLY,
        NOW,
      ).valid,
    ).toBe(false);
    // A subscription without an expiry is not a lifetime grant.
    expect(
      evaluateAppleTransaction({ productId: MONTHLY }, MONTHLY, NOW).valid,
    ).toBe(false);
    expect(
      evaluateAppleTransaction(
        { productId: MONTHLY, expiresDate: NOW + 1000 },
        LIFETIME_PRODUCT_ID,
        NOW,
      ).valid,
    ).toBe(false);
  });

  it("keeps a subscription's exact expiry", () => {
    const result = evaluateAppleTransaction(
      { productId: MONTHLY, expiresDate: NOW + 60_000 },
      MONTHLY,
      NOW,
    );
    expect(result.valid).toBe(true);
    expect(result.expiresDate?.getTime()).toBe(NOW + 60_000);
  });
});

describe("App Store Server API v2 validation", () => {
  it("validates a lifetime transaction end to end with a null expiry", async () => {
    const { deps, verifyTransaction } = v2Deps(
      [jsonResponse(200, { signedTransactionInfo: "jws" })],
      { productId: LIFETIME_PRODUCT_ID, originalTransactionId: "orig-life" },
    );
    const result = await validateAppleTransactionV2(
      "tx-1",
      LIFETIME_PRODUCT_ID,
      deps,
    );
    expect(result).toEqual({
      valid: true,
      expiresDate: null,
      originalTransactionId: "orig-life",
    });
    expect(verifyTransaction).toHaveBeenCalledWith("jws", "production");
    // Must be storable: no Invalid Date reaches the database layer.
    expect(result.expiresDate).not.toBeInstanceOf(Date);
  });

  it("falls back to sandbox when production says not found", async () => {
    const { deps, urls, verifyTransaction } = v2Deps(
      [jsonResponse(404), jsonResponse(200, { signedTransactionInfo: "jws" })],
      { productId: MONTHLY, expiresDate: NOW + 1000 },
    );
    const result = await validateAppleTransactionV2("tx-2", MONTHLY, deps);
    expect(result.valid).toBe(true);
    expect(urls[1]).toContain("storekit-sandbox");
    expect(verifyTransaction).toHaveBeenCalledWith("jws", "sandbox");
  });

  it("returns an affirmative invalid when neither environment knows the transaction", async () => {
    const { deps } = v2Deps([jsonResponse(404), jsonResponse(404)]);
    await expect(
      validateAppleTransactionV2("tx-3", MONTHLY, deps),
    ).resolves.toEqual({
      valid: false,
      expiresDate: null,
      originalTransactionId: null,
    });
  });

  it("returns an affirmative invalid for an expired subscription", async () => {
    const { deps } = v2Deps(
      [jsonResponse(200, { signedTransactionInfo: "jws" })],
      { productId: MONTHLY, expiresDate: NOW - 1000 },
    );
    await expect(
      validateAppleTransactionV2("tx-4", MONTHLY, deps),
    ).resolves.toMatchObject({ valid: false });
  });

  it.each([
    ["Apple 5xx", [jsonResponse(503)]],
    ["Apple rate limit", [jsonResponse(429)]],
    ["our JWT rejected", [jsonResponse(401)]],
    [
      "sandbox 5xx after production not found",
      [jsonResponse(404), jsonResponse(500)],
    ],
    ["network failure", [new TypeError("fetch failed")]],
  ])("treats %s as retryable", async (_label, responses) => {
    const { deps } = v2Deps(responses as (Response | Error)[]);
    await expect(
      validateAppleTransactionV2("tx-5", MONTHLY, deps),
    ).rejects.toBeInstanceOf(VerificationUnavailableError);
  });

  it("treats a signing failure as retryable", async () => {
    const { deps } = v2Deps(
      [],
      {},
      {
        createJWT: async () => {
          throw new Error("bad private key");
        },
      },
    );
    await expect(
      validateAppleTransactionV2("tx-6", MONTHLY, deps),
    ).rejects.toBeInstanceOf(VerificationUnavailableError);
  });

  it("treats a JWS verification failure as retryable", async () => {
    const { deps } = v2Deps(
      [jsonResponse(200, { signedTransactionInfo: "jws" })],
      new Error("OCSP unreachable"),
    );
    await expect(
      validateAppleTransactionV2("tx-7", MONTHLY, deps),
    ).rejects.toBeInstanceOf(VerificationUnavailableError);
  });

  it("classifies lookup statuses", () => {
    expect(isAppleLookupRejection(400)).toBe(true);
    expect(isAppleLookupRejection(404)).toBe(true);
    for (const status of [401, 403, 429, 500, 502, 503]) {
      expect(isAppleLookupRejection(status)).toBe(false);
    }
  });
});

describe("legacy verifyReceipt validation", () => {
  function legacyFetch(...bodies: unknown[]) {
    return jest.fn(async () => {
      const body = bodies.shift();
      if (body instanceof Error) throw body;
      return jsonResponse(200, body);
    }) as unknown as typeof fetch;
  }

  it("validates a lifetime purchase with a null expiry", async () => {
    const result = await validateAppleReceiptLegacy(
      "receipt",
      LIFETIME_PRODUCT_ID,
      {
        sharedSecret: "secret",
        now: () => NOW,
        fetchImpl: legacyFetch({
          status: 0,
          receipt: { in_app: [{ product_id: LIFETIME_PRODUCT_ID }] },
        }),
      },
    );
    expect(result).toEqual({
      valid: true,
      expiresDate: null,
      originalTransactionId: null,
    });
  });

  it("returns an affirmative invalid for Apple's expired-receipt status", async () => {
    await expect(
      validateAppleReceiptLegacy("receipt", MONTHLY, {
        sharedSecret: "secret",
        fetchImpl: legacyFetch({ status: 21006 }),
      }),
    ).resolves.toMatchObject({ valid: false });
  });

  it("treats a missing shared secret, retryable statuses, and network errors as unavailable", async () => {
    await expect(
      validateAppleReceiptLegacy("receipt", MONTHLY, {
        sharedSecret: undefined,
      }),
    ).rejects.toBeInstanceOf(VerificationUnavailableError);
    await expect(
      validateAppleReceiptLegacy("receipt", MONTHLY, {
        sharedSecret: "secret",
        fetchImpl: legacyFetch({ status: 21005 }),
      }),
    ).rejects.toBeInstanceOf(VerificationUnavailableError);
    await expect(
      validateAppleReceiptLegacy("receipt", MONTHLY, {
        sharedSecret: "secret",
        fetchImpl: legacyFetch(new TypeError("fetch failed")),
      }),
    ).rejects.toBeInstanceOf(VerificationUnavailableError);
  });

  it("names missing App Store Server API credentials for a StoreKit 2 JWS", async () => {
    const fetchImpl = legacyFetch({ status: 21002 });
    const error = await validateAppleReceiptLegacy(
      "eyJhbGciOiJFUzI1NiJ9.eyJwcm9kdWN0SWQiOiJ4In0.c2ln-_",
      MONTHLY,
      { sharedSecret: "secret", fetchImpl },
    ).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(VerificationUnavailableError);
    expect((error as Error).message).toBe(STOREKIT2_CREDENTIALS_MISSING);
    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining(STOREKIT2_CREDENTIALS_MISSING),
    );
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("recognizes only compact JWS strings as StoreKit 2 receipts", () => {
    expect(looksLikeStoreKit2Jws("aGVhZA.Ym9keQ.c2ln")).toBe(true);
    expect(looksLikeStoreKit2Jws("MIIT+wYJKoZIhvcNAQcCoIIT7DCCE+g=")).toBe(
      false,
    );
    expect(looksLikeStoreKit2Jws("a.b")).toBe(false);
  });

  it("classifies verifyReceipt statuses", () => {
    for (const status of [21002, 21004, 21005, 21009, 21100, 21199]) {
      expect(isRetryableLegacyStatus(status)).toBe(true);
    }
    for (const status of [21003, 21006, 21008, 21010]) {
      expect(isRetryableLegacyStatus(status)).toBe(false);
    }
    expect(isRetryableLegacyStatus(21003, true)).toBe(true);
  });
});

describe("Apple billing grace period", () => {
  const DAY = 24 * 60 * 60 * 1000;
  const expired: AppleTransactionInfo = {
    productId: MONTHLY,
    expiresDate: NOW - 1000,
    originalTransactionId: "orig-1",
  };
  const statusBody = (status: number) => ({
    data: [
      {
        lastTransactions: [
          {
            originalTransactionId: "orig-1",
            status,
            signedRenewalInfo: "renewal-jws",
          },
        ],
      },
    ],
  });
  const graceDeps = (
    responses: (Response | Error)[],
    renewal: AppleRenewalInfo | Error,
    txInfo: AppleTransactionInfo = expired,
  ) => {
    const verifyRenewalInfo = jest.fn(async () => {
      if (renewal instanceof Error) throw renewal;
      return renewal;
    });
    const built = v2Deps(responses, txInfo, { verifyRenewalInfo });
    return { ...built, verifyRenewalInfo };
  };

  it("reads a grace period end only while it is still ahead", () => {
    expect(
      appleGracePeriodEnd({ gracePeriodExpiresDate: NOW + DAY }, NOW),
    ).toEqual(new Date(NOW + DAY));
    expect(
      appleGracePeriodEnd({ gracePeriodExpiresDate: NOW - 1 }, NOW),
    ).toBeNull();
    expect(
      appleGracePeriodEnd({ gracePeriodExpiresDate: null }, NOW),
    ).toBeNull();
    expect(appleGracePeriodEnd({}, NOW)).toBeNull();
  });

  it("only ever moves a stored period end later", () => {
    const later = new Date(NOW + 16 * DAY);
    expect(extendedPeriodEnd(new Date(NOW - DAY), later)).toEqual(later);
    expect(extendedPeriodEnd(null, later)).toBeNull();
    expect(extendedPeriodEnd(new Date(NOW + 30 * DAY), later)).toBeNull();
  });

  it("keeps an expired subscription valid until its grace period ends", async () => {
    const { deps, urls, verifyRenewalInfo } = graceDeps(
      [
        jsonResponse(200, { signedTransactionInfo: "jws" }),
        jsonResponse(200, statusBody(4)),
      ],
      { gracePeriodExpiresDate: NOW + 16 * DAY },
    );
    await expect(
      validateAppleTransactionV2("tx-g1", MONTHLY, deps),
    ).resolves.toEqual({
      valid: true,
      expiresDate: new Date(NOW + 16 * DAY),
      originalTransactionId: "orig-1",
    });
    expect(urls[1]).toBe(
      "https://api.storekit.itunes.apple.com/inApps/v1/subscriptions/tx-g1",
    );
    expect(verifyRenewalInfo).toHaveBeenCalledWith("renewal-jws", "production");
  });

  it("asks the sandbox for status when the transaction lives there", async () => {
    const { deps, urls } = graceDeps(
      [
        jsonResponse(404),
        jsonResponse(200, { signedTransactionInfo: "jws" }),
        jsonResponse(200, statusBody(4)),
      ],
      { gracePeriodExpiresDate: NOW + DAY },
    );
    await expect(
      validateAppleTransactionV2("tx-g2", MONTHLY, deps),
    ).resolves.toMatchObject({ valid: true });
    expect(urls[2]).toContain("api.storekit-sandbox.itunes.apple.com");
  });

  it.each([
    ["expired", 2],
    ["in billing retry without grace", 3],
    ["revoked", 5],
  ])(
    "stays invalid when Apple says the subscription is %s",
    async (_l, status) => {
      const { deps, verifyRenewalInfo } = graceDeps(
        [
          jsonResponse(200, { signedTransactionInfo: "jws" }),
          jsonResponse(200, statusBody(status)),
        ],
        { gracePeriodExpiresDate: NOW + DAY },
      );
      await expect(
        validateAppleTransactionV2("tx-g3", MONTHLY, deps),
      ).resolves.toMatchObject({ valid: false });
      expect(verifyRenewalInfo).not.toHaveBeenCalled();
    },
  );

  it("stays invalid once the grace period has passed", async () => {
    const { deps } = graceDeps(
      [
        jsonResponse(200, { signedTransactionInfo: "jws" }),
        jsonResponse(200, statusBody(4)),
      ],
      { gracePeriodExpiresDate: NOW - 1 },
    );
    await expect(
      validateAppleTransactionV2("tx-g4", MONTHLY, deps),
    ).resolves.toMatchObject({ valid: false });
  });

  it("stays invalid when Apple has no status for the transaction", async () => {
    const { deps } = graceDeps(
      [jsonResponse(200, { signedTransactionInfo: "jws" }), jsonResponse(404)],
      { gracePeriodExpiresDate: NOW + DAY },
    );
    await expect(
      validateAppleTransactionV2("tx-g5", MONTHLY, deps),
    ).resolves.toMatchObject({ valid: false });
  });

  it("ignores another subscription's grace period in the same response", async () => {
    const body = statusBody(4);
    body.data[0].lastTransactions[0].originalTransactionId = "someone-else";
    const { deps } = graceDeps(
      [
        jsonResponse(200, { signedTransactionInfo: "jws" }),
        jsonResponse(200, body),
      ],
      { gracePeriodExpiresDate: NOW + DAY },
    );
    await expect(
      validateAppleTransactionV2("tx-g6", MONTHLY, deps),
    ).resolves.toMatchObject({ valid: false });
  });

  it.each([
    ["Apple 5xx", jsonResponse(503)],
    ["network failure", new TypeError("fetch failed")],
  ])("treats %s on the status lookup as retryable", async (_l, response) => {
    const { deps } = graceDeps(
      [jsonResponse(200, { signedTransactionInfo: "jws" }), response],
      { gracePeriodExpiresDate: NOW + DAY },
    );
    await expect(
      validateAppleTransactionV2("tx-g7", MONTHLY, deps),
    ).rejects.toBeInstanceOf(VerificationUnavailableError);
  });

  it("treats a renewal info verification failure as retryable", async () => {
    const { deps } = graceDeps(
      [
        jsonResponse(200, { signedTransactionInfo: "jws" }),
        jsonResponse(200, statusBody(4)),
      ],
      new Error("bad signature"),
    );
    await expect(
      validateAppleTransactionV2("tx-g8", MONTHLY, deps),
    ).rejects.toBeInstanceOf(VerificationUnavailableError);
  });

  it.each([
    ["revoked", { ...expired, revocationDate: NOW - 5 }],
    ["for another product", { ...expired, productId: "other" }],
  ])("never asks about grace for a transaction that is %s", async (_l, tx) => {
    const { deps, urls } = graceDeps(
      [jsonResponse(200, { signedTransactionInfo: "jws" })],
      { gracePeriodExpiresDate: NOW + DAY },
      tx,
    );
    await expect(
      validateAppleTransactionV2("tx-g9", MONTHLY, deps),
    ).resolves.toMatchObject({ valid: false });
    expect(urls).toHaveLength(1);
  });

  it("does not look up status for a subscription that is still active", async () => {
    const { deps, urls } = graceDeps(
      [jsonResponse(200, { signedTransactionInfo: "jws" })],
      { gracePeriodExpiresDate: NOW + DAY },
      { ...expired, expiresDate: NOW + DAY },
    );
    await expect(
      validateAppleTransactionV2("tx-g10", MONTHLY, deps),
    ).resolves.toMatchObject({ valid: true, expiresDate: new Date(NOW + DAY) });
    expect(urls).toHaveLength(1);
  });
});
