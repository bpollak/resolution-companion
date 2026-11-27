/** @jest-environment node */
import { createFakeDb, type FakeQuery } from "./fixtures/fake-db";
import { startRouteServer } from "./fixtures/route-server";

// Apple's signature checks are replaced by these three functions: a test
// decides what each signed blob "decodes" to, or that verification fails.
const mockVerifyNotification = jest.fn();
const mockVerifyTransaction = jest.fn();
const mockVerifyRenewalInfo = jest.fn();
jest.mock("@apple/app-store-server-library", () => ({
  Environment: { PRODUCTION: "Production", SANDBOX: "Sandbox" },
  SignedDataVerifier: jest.fn(() => ({
    verifyAndDecodeNotification: mockVerifyNotification,
    verifyAndDecodeTransaction: mockVerifyTransaction,
    verifyAndDecodeRenewalInfo: mockVerifyRenewalInfo,
  })),
}));

interface Row {
  id: number;
  deviceId: string;
  providerTransactionId: string;
  plan: string;
  status: string;
  currentPeriodEnd: Date | null;
}

const mockStore = {
  available: true,
  rows: [] as Row[],
  failUpdates: false,
};
const mockFake = createFakeDb((query: FakeQuery) => {
  if (query.op === "insert" && query.table === "rate_limit_windows") {
    return [{ count: 1 }];
  }
  if (query.table !== "device_subscriptions") return [];
  const [param] = query.where?.params ?? [];
  if (query.op === "select") {
    return / like /i.test(query.where!.sql)
      ? mockStore.rows.filter((row) =>
          row.providerTransactionId.endsWith(String(param).slice(5)),
        )
      : mockStore.rows.filter((row) => row.providerTransactionId === param);
  }
  if (query.op === "update") {
    if (mockStore.failUpdates) throw new Error("db down");
    expect(query.where!.sql).toBe('"device_subscriptions"."id" = $1');
    const row = mockStore.rows.find((candidate) => candidate.id === param)!;
    const { updatedAt: _updatedAt, ...changes } = query.set!;
    Object.assign(row, changes);
  }
  return [];
});
jest.mock("../db", () => ({
  get db() {
    return mockStore.available ? mockFake.db : null;
  },
}));

const ORIGINAL_ID = "2000000123456789";
const DEC_31 = new Date("2026-12-31T12:00:00.000Z");
const JAN_31 = new Date("2027-01-31T12:00:00.000Z");
const FEB_28 = new Date("2027-02-28T12:00:00.000Z");

let routes: Awaited<ReturnType<typeof startRouteServer>>;

beforeAll(async () => {
  routes = await startRouteServer(
    jest.requireActual<typeof import("../routes")>("../routes").registerRoutes,
  );
});

afterAll(async () => {
  await routes?.close();
});

beforeEach(() => {
  mockVerifyNotification.mockReset();
  mockVerifyTransaction.mockReset();
  mockVerifyRenewalInfo.mockReset();
  mockFake.reset();
  mockStore.available = true;
  mockStore.failUpdates = false;
  mockStore.rows = [];
  jest.spyOn(console, "error").mockImplementation(() => {});
  jest.spyOn(console, "log").mockImplementation(() => {});
});

afterEach(() => jest.restoreAllMocks());

function row(overrides: Partial<Row> = {}): Row {
  const created: Row = {
    id: mockStore.rows.length + 1,
    deviceId: `device-${mockStore.rows.length + 1}-aaaa`,
    providerTransactionId: `iap_${ORIGINAL_ID}`,
    plan: "monthly",
    status: "active",
    currentPeriodEnd: JAN_31,
    ...overrides,
  };
  mockStore.rows.push(created);
  return created;
}

// Plays one notification: the outer payload verifies, and the nested
// transaction decodes to the given expiry.
function notify(
  notificationType: string,
  expiresDate: Date | null,
  options: { subtype?: string; renewalInfo?: boolean } = {},
) {
  mockVerifyNotification.mockResolvedValue({
    notificationType,
    subtype: options.subtype,
    data: {
      signedTransactionInfo: "signed-transaction",
      ...(options.renewalInfo ? { signedRenewalInfo: "signed-renewal" } : {}),
    },
  });
  mockVerifyTransaction.mockResolvedValue({
    originalTransactionId: ORIGINAL_ID,
    transactionId: "2000000999999999",
    productId: "com.resolutioncompanion.monthly",
    ...(expiresDate ? { expiresDate: expiresDate.getTime() } : {}),
  });
  return routes.send("POST", "/api/webhooks/apple", {
    signedPayload: "signed-notification",
  });
}

const updates = () => mockFake.find("update", "device_subscriptions");

describe("Apple webhook responses", () => {
  it("rejects a payload whose signature does not verify", async () => {
    mockVerifyNotification.mockRejectedValue(new Error("bad signature"));
    const response = await routes.send("POST", "/api/webhooks/apple", {
      signedPayload: "forged",
    });
    expect(response.status).toBe(403);
    expect(mockVerifyTransaction).not.toHaveBeenCalled();
  });

  it("answers 503 when no database is configured, so Apple retries", async () => {
    row();
    mockStore.available = false;
    const response = await notify("DID_RENEW", FEB_28);
    expect(response.status).toBe(503);
    expect(mockStore.rows[0].currentPeriodEnd).toEqual(JAN_31);
  });

  it("answers 500 when the nested transaction cannot be verified", async () => {
    row();
    mockVerifyNotification.mockResolvedValue({
      notificationType: "DID_RENEW",
      data: { signedTransactionInfo: "signed-transaction" },
    });
    mockVerifyTransaction.mockRejectedValue(new Error("chain check failed"));
    const response = await routes.send("POST", "/api/webhooks/apple", {
      signedPayload: "signed-notification",
    });
    expect(response.status).toBe(500);
    expect(updates()).toHaveLength(0);
  });

  it("answers 500 when the subscription lookup fails", async () => {
    jest.spyOn(mockFake.db, "select").mockImplementationOnce(() => {
      throw new Error("db down");
    });
    expect((await notify("DID_RENEW", FEB_28)).status).toBe(500);
  });

  it("answers 500 when the update cannot be written", async () => {
    row();
    mockStore.failUpdates = true;
    expect((await notify("DID_RENEW", FEB_28)).status).toBe(500);
  });

  it("answers 500 when the grace period renewal info cannot be verified", async () => {
    row();
    mockVerifyRenewalInfo.mockRejectedValue(new Error("chain check failed"));
    const response = await notify("DID_FAIL_TO_RENEW", JAN_31, {
      subtype: "GRACE_PERIOD",
      renewalInfo: true,
    });
    expect(response.status).toBe(500);
    expect(mockStore.rows[0].currentPeriodEnd).toEqual(JAN_31);
  });

  it("acknowledges a notification with no transaction, even with no database", async () => {
    mockStore.available = false;
    mockVerifyNotification.mockResolvedValue({ notificationType: "TEST" });
    const response = await routes.send("POST", "/api/webhooks/apple", {
      signedPayload: "signed-notification",
    });
    expect(response.status).toBe(200);
  });

  it("acknowledges a notification for a subscription it has never stored", async () => {
    expect((await notify("DID_RENEW", FEB_28)).status).toBe(200);
    expect(updates()).toHaveLength(0);
  });
});

describe("Apple webhook stale notifications", () => {
  it("keeps a payer Premium when EXPIRED arrives for a period before the stored renewal", async () => {
    // /api/iap/validate (or DID_RENEW) already stored the January period.
    row({ status: "active", currentPeriodEnd: JAN_31 });
    const response = await notify("EXPIRED", DEC_31);
    expect(response.status).toBe(200);
    expect(mockStore.rows[0]).toMatchObject({
      status: "active",
      currentPeriodEnd: JAN_31,
    });
    expect(updates()).toHaveLength(0);
  });

  it("ignores a GRACE_PERIOD_EXPIRED for an earlier period", async () => {
    row({ status: "active", currentPeriodEnd: JAN_31 });
    expect((await notify("GRACE_PERIOD_EXPIRED", DEC_31)).status).toBe(200);
    expect(mockStore.rows[0].status).toBe("active");
    expect(updates()).toHaveLength(0);
  });

  it("does not let a late DID_RENEW move the period end back", async () => {
    row({ status: "active", currentPeriodEnd: FEB_28 });
    expect((await notify("DID_RENEW", JAN_31)).status).toBe(200);
    expect(mockStore.rows[0].currentPeriodEnd).toEqual(FEB_28);
    expect(updates()).toHaveLength(0);
  });

  it("does not let a late SUBSCRIBED move the period end back", async () => {
    row({ status: "active", currentPeriodEnd: FEB_28 });
    expect((await notify("SUBSCRIBED", DEC_31)).status).toBe(200);
    expect(mockStore.rows[0].currentPeriodEnd).toEqual(FEB_28);
  });

  it.each(["EXPIRED", "GRACE_PERIOD_EXPIRED"])(
    "applies %s for the period that is stored",
    async (type) => {
      row({ status: "active", currentPeriodEnd: JAN_31 });
      expect((await notify(type, JAN_31)).status).toBe(200);
      expect(mockStore.rows[0].status).toBe("inactive");
    },
  );

  it("applies DID_RENEW for a later period", async () => {
    row({ status: "inactive", currentPeriodEnd: JAN_31 });
    expect((await notify("DID_RENEW", FEB_28)).status).toBe(200);
    expect(mockStore.rows[0]).toMatchObject({
      status: "active",
      currentPeriodEnd: FEB_28,
    });
  });

  it.each(["REFUND", "REVOKE"])(
    "still removes access on %s whatever period it names",
    async (type) => {
      row({ status: "active", currentPeriodEnd: JAN_31 });
      expect((await notify(type, DEC_31)).status).toBe(200);
      expect(mockStore.rows[0].status).toBe("inactive");
    },
  );
});

describe("Apple webhook activation", () => {
  it.each(["SUBSCRIBED", "REFUND_REVERSED"])(
    "%s sets the row active with the transaction's expiry",
    async (type) => {
      row({ status: "inactive", currentPeriodEnd: DEC_31 });
      expect((await notify(type, JAN_31)).status).toBe(200);
      expect(mockStore.rows[0]).toMatchObject({
        status: "active",
        currentPeriodEnd: JAN_31,
      });
    },
  );

  it("REFUND_REVERSED restores access without shortening a later stored period", async () => {
    row({ status: "inactive", currentPeriodEnd: FEB_28 });
    expect((await notify("REFUND_REVERSED", DEC_31)).status).toBe(200);
    expect(mockStore.rows[0]).toMatchObject({
      status: "active",
      currentPeriodEnd: FEB_28,
    });
  });

  it("never turns a subscription into a never-expiring one when Apple omits the expiry", async () => {
    row({ status: "inactive", currentPeriodEnd: DEC_31 });
    expect((await notify("DID_RENEW", null)).status).toBe(200);
    expect(mockStore.rows[0].currentPeriodEnd).toEqual(DEC_31);
  });
});

describe("Apple webhook with several devices on one purchase", () => {
  it("renews every row that shares the transaction id", async () => {
    row({ currentPeriodEnd: JAN_31 });
    row({ currentPeriodEnd: JAN_31 });
    row({
      providerTransactionId: "iap_someone_else",
      currentPeriodEnd: JAN_31,
    });
    expect((await notify("DID_RENEW", FEB_28)).status).toBe(200);
    expect(mockStore.rows.map((r) => r.currentPeriodEnd)).toEqual([
      FEB_28,
      FEB_28,
      JAN_31,
    ]);
  });

  it("expires every row that shares the transaction id", async () => {
    row();
    row();
    expect((await notify("EXPIRED", JAN_31)).status).toBe(200);
    expect(mockStore.rows.map((r) => r.status)).toEqual([
      "inactive",
      "inactive",
    ]);
  });

  it("judges staleness row by row", async () => {
    row({ currentPeriodEnd: JAN_31 });
    row({ currentPeriodEnd: FEB_28 });
    expect((await notify("EXPIRED", JAN_31)).status).toBe(200);
    expect(mockStore.rows.map((r) => r.status)).toEqual(["inactive", "active"]);
  });

  it("extends a billing grace period on every row", async () => {
    const graceEnd = new Date(Date.now() + 16 * 24 * 60 * 60 * 1000);
    const lapsed = new Date(Date.now() - 60_000);
    row({ currentPeriodEnd: lapsed });
    row({ currentPeriodEnd: lapsed });
    mockVerifyRenewalInfo.mockResolvedValue({
      gracePeriodExpiresDate: graceEnd.getTime(),
    });
    const response = await notify("DID_FAIL_TO_RENEW", lapsed, {
      subtype: "GRACE_PERIOD",
      renewalInfo: true,
    });
    expect(response.status).toBe(200);
    expect(mockStore.rows.map((r) => r.currentPeriodEnd)).toEqual([
      graceEnd,
      graceEnd,
    ]);
  });

  it("finds rows stored under the older prefixed id format", async () => {
    row({ providerTransactionId: `iap_ios_${ORIGINAL_ID}` });
    expect((await notify("DID_RENEW", FEB_28)).status).toBe(200);
    expect(mockStore.rows[0].currentPeriodEnd).toEqual(FEB_28);
  });
});
