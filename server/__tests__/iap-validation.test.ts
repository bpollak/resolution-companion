import {
  LIFETIME_PRODUCT_ID,
  VerificationUnavailableError,
  appleExpiryDate,
  evaluateAppleTransaction,
  isAppleLookupRejection,
  STOREKIT2_CREDENTIALS_MISSING,
  isRetryableLegacyStatus,
  looksLikeStoreKit2Jws,
  validateAppleReceiptLegacy,
  validateAppleTransactionV2,
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
