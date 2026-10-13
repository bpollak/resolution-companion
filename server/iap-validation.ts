// Store receipt validation that separates "the store says no" from "we could
// not find out". Only the first may downgrade a paying user; the second must
// surface as a retryable failure so the client keeps its prior entitlement.

export const LIFETIME_PRODUCT_ID = "com.resolutioncompanion.lifetime";

export function isLifetimeProduct(productId: string): boolean {
  return productId === LIFETIME_PRODUCT_ID || productId.includes("lifetime");
}

// Agreed contract with the client: any non-2xx keeps the prior entitlement,
// and this body lets it tell an outage apart from a malformed request.
export const VERIFICATION_UNAVAILABLE_BODY = {
  valid: false,
  retryable: true,
  error: "verification_unavailable",
} as const;

export class VerificationUnavailableError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "VerificationUnavailableError";
  }
}

export interface AppleValidationResult {
  valid: boolean;
  expiresDate: Date | null;
  originalTransactionId: string | null;
}

const INVALID: AppleValidationResult = {
  valid: false,
  expiresDate: null,
  originalTransactionId: null,
};

export type AppleEnvironment = "production" | "sandbox";

// The decoded fields we rely on from Apple's JWSTransactionDecodedPayload.
export interface AppleTransactionInfo {
  productId?: string;
  expiresDate?: number | null;
  revocationDate?: number | null;
  originalTransactionId?: string | null;
}

// Non-consumables (lifetime) carry no expiresDate; new Date(undefined) is an
// Invalid Date that Postgres rejects, so absence must map to null.
export function appleExpiryDate(
  expiresDateMs: number | null | undefined,
): Date | null {
  if (typeof expiresDateMs !== "number" || !Number.isFinite(expiresDateMs)) {
    return null;
  }
  return new Date(expiresDateMs);
}

export function evaluateAppleTransaction(
  txInfo: AppleTransactionInfo,
  productId: string,
  now: number = Date.now(),
): AppleValidationResult {
  const expiresDate = appleExpiryDate(txInfo.expiresDate);
  const entitled =
    txInfo.productId === productId &&
    !txInfo.revocationDate &&
    ((expiresDate !== null && expiresDate.getTime() > now) ||
      (isLifetimeProduct(productId) && expiresDate === null));
  if (!entitled) return INVALID;
  return {
    valid: true,
    expiresDate,
    originalTransactionId: txInfo.originalTransactionId || null,
  };
}

// App Store Server API: 400 (malformed id) and 404 (no such transaction) are
// Apple's answer about the purchase. 401/403 mean our JWT or key is wrong,
// and 429/5xx are Apple being unavailable; none of those say anything about
// the user, so they must not downgrade them.
export function isAppleLookupRejection(status: number): boolean {
  return status === 400 || status === 404;
}

const APPLE_API_BASE: Record<AppleEnvironment, string> = {
  production: "https://api.storekit.itunes.apple.com",
  sandbox: "https://api.storekit-sandbox.itunes.apple.com",
};

// Two sequential lookups (production then sandbox) must still finish inside
// the client's 15 s validation timeout.
const APPLE_FETCH_TIMEOUT_MS = 6_000;

export interface AppleV2Deps {
  createJWT: () => Promise<string>;
  verifyTransaction: (
    jws: string,
    environment: AppleEnvironment,
  ) => Promise<AppleTransactionInfo>;
  sandboxOnly: boolean;
  fetchImpl?: typeof fetch;
  now?: () => number;
}

async function unavailableOnThrow<T>(
  what: string,
  fn: () => Promise<T>,
): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    if (error instanceof VerificationUnavailableError) throw error;
    throw new VerificationUnavailableError(`${what} failed`, { cause: error });
  }
}

export async function validateAppleTransactionV2(
  transactionId: string,
  productId: string,
  deps: AppleV2Deps,
): Promise<AppleValidationResult> {
  const fetchImpl = deps.fetchImpl ?? fetch;
  const now = deps.now ?? Date.now;
  const jwt = await unavailableOnThrow("App Store JWT signing", deps.createJWT);

  const lookup = async (environment: AppleEnvironment) => {
    const response = await unavailableOnThrow("App Store lookup", () =>
      fetchImpl(
        `${APPLE_API_BASE[environment]}/inApps/v1/transactions/${encodeURIComponent(transactionId)}`,
        {
          headers: { Authorization: `Bearer ${jwt}` },
          signal: AbortSignal.timeout(APPLE_FETCH_TIMEOUT_MS),
        },
      ),
    );
    if (response.ok) return { environment, response };
    if (isAppleLookupRejection(response.status)) {
      return { environment, response: null };
    }
    throw new VerificationUnavailableError(
      `App Store ${environment} lookup returned ${response.status}`,
    );
  };

  let found = await lookup(deps.sandboxOnly ? "sandbox" : "production");
  // TestFlight and review purchases live in the sandbox, which production
  // reports as not found.
  if (!found.response && !deps.sandboxOnly) {
    found = await lookup("sandbox");
  }
  if (!found.response) {
    console.error("App Store Server API v2: transaction not found");
    return INVALID;
  }

  const ok = found.response;
  // A successful HTTPS response alone is not the entitlement. Verify the
  // Apple-signed transaction before trusting its product or expiry fields.
  // The JWS came straight from Apple, so a verification failure points at our
  // verifier setup (or an online revocation check), not at the user.
  const txInfo = await unavailableOnThrow(
    "App Store JWS verification",
    async () => {
      const data = (await ok.json()) as { signedTransactionInfo?: string };
      if (typeof data.signedTransactionInfo !== "string") {
        throw new Error("App Store response is missing signedTransactionInfo");
      }
      return deps.verifyTransaction(
        data.signedTransactionInfo,
        found.environment,
      );
    },
  );
  return evaluateAppleTransaction(txInfo, productId, now());
}

// --- Legacy verifyReceipt (deprecated, used as fallback) ---

// verifyReceipt statuses that mean "try again": 21002 (malformed or a
// temporary service issue, per Apple), 21005 (server unavailable), 21009 and
// 21100-21199 (internal data access errors). 21004 is our shared secret being
// wrong, which is a configuration fault rather than a verdict on the user.
export function isRetryableLegacyStatus(
  status: number,
  isRetryableFlag?: unknown,
): boolean {
  return (
    isRetryableFlag === true ||
    isRetryableFlag === 1 ||
    status === 21002 ||
    status === 21004 ||
    status === 21005 ||
    status === 21009 ||
    (status >= 21100 && status <= 21199)
  );
}

const LEGACY_PRODUCTION_URL = "https://buy.itunes.apple.com/verifyReceipt";
const LEGACY_SANDBOX_URL = "https://sandbox.itunes.apple.com/verifyReceipt";

export interface AppleLegacyDeps {
  sharedSecret: string | undefined;
  fetchImpl?: typeof fetch;
  now?: () => number;
}

async function legacyLookup(
  receipt: string,
  productId: string,
  verifyUrl: string,
  deps: AppleLegacyDeps & { sharedSecret: string },
): Promise<{ valid: boolean; status: number; expiresDate: Date | null }> {
  const fetchImpl = deps.fetchImpl ?? fetch;
  const now = deps.now ?? Date.now;
  const data = await unavailableOnThrow("verifyReceipt", async () => {
    const response = await fetchImpl(verifyUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        "receipt-data": receipt,
        password: deps.sharedSecret,
        "exclude-old-transactions": true,
      }),
      signal: AbortSignal.timeout(APPLE_FETCH_TIMEOUT_MS),
    });
    if (!response.ok) {
      throw new Error(`verifyReceipt returned HTTP ${response.status}`);
    }
    return (await response.json()) as any;
  });

  if (data.status === 0 && data.receipt) {
    const inApp = data.receipt.in_app || [];
    const latestReceipt = data.latest_receipt_info || [];
    for (const transaction of [...inApp, ...latestReceipt]) {
      if (transaction.product_id !== productId) continue;
      const expiresMs = parseInt(transaction.expires_date_ms || "0", 10);
      if (expiresMs > now()) {
        return { valid: true, status: 0, expiresDate: new Date(expiresMs) };
      }
      if (isLifetimeProduct(productId) && !transaction.cancellation_date_ms) {
        return { valid: true, status: 0, expiresDate: null };
      }
    }
    return { valid: false, status: 0, expiresDate: null };
  }

  const status = typeof data.status === "number" ? data.status : -1;
  if (isRetryableLegacyStatus(status, data["is-retryable"])) {
    throw new VerificationUnavailableError(
      `verifyReceipt returned retryable status ${status}`,
    );
  }
  return { valid: false, status, expiresDate: null };
}

// A StoreKit 2 receipt is a compact JWS: three base64url segments joined by
// dots. Legacy base64 receipts never contain a dot.
const JWS_RE = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;

export function looksLikeStoreKit2Jws(receipt: string): boolean {
  return JWS_RE.test(receipt.trim());
}

export const STOREKIT2_CREDENTIALS_MISSING =
  "App Store Server API credentials missing; StoreKit 2 transactions cannot be validated";

export async function validateAppleReceiptLegacy(
  receipt: string,
  productId: string,
  deps: AppleLegacyDeps,
): Promise<AppleValidationResult> {
  // verifyReceipt cannot parse a JWS and answers 21002, which reads like an
  // Apple outage. Name the real cause (APPLE_ISSUER_ID, APPLE_KEY_ID,
  // APPLE_PRIVATE_KEY unset, or no transactionId sent) so the config fault is
  // visible, and stay retryable so paying users keep their entitlement.
  if (looksLikeStoreKit2Jws(receipt)) {
    console.error(`CONFIG ERROR: ${STOREKIT2_CREDENTIALS_MISSING}`);
    throw new VerificationUnavailableError(STOREKIT2_CREDENTIALS_MISSING);
  }
  const { sharedSecret } = deps;
  if (!sharedSecret) {
    throw new VerificationUnavailableError(
      "APPLE_SHARED_SECRET is not configured",
    );
  }
  const withSecret = { ...deps, sharedSecret };

  const prod = await legacyLookup(
    receipt,
    productId,
    LEGACY_PRODUCTION_URL,
    withSecret,
  );
  if (prod.valid) {
    return {
      valid: true,
      expiresDate: prod.expiresDate,
      originalTransactionId: null,
    };
  }
  if (prod.status === 21007) {
    const sandbox = await legacyLookup(
      receipt,
      productId,
      LEGACY_SANDBOX_URL,
      withSecret,
    );
    if (sandbox.valid) {
      return {
        valid: true,
        expiresDate: sandbox.expiresDate,
        originalTransactionId: null,
      };
    }
    console.log("Sandbox validation failed with status:", sandbox.status);
    return INVALID;
  }
  console.log("Apple receipt validation failed with status:", prod.status);
  return INVALID;
}
