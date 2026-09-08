/* eslint-disable @typescript-eslint/no-require-imports -- reset the module-scoped queue between isolation tests */
jest.mock("@react-native-async-storage/async-storage", () =>
  jest.requireActual(
    "@react-native-async-storage/async-storage/jest/async-storage-mock",
  ),
);

jest.mock("@/lib/progress", () => ({
  getLocalDateString: jest.fn(() => "2026-07-18"),
}));

jest.mock("@/lib/query-client", () => ({
  getApiUrl: jest.fn(() => "https://api.example.test"),
  getAuthHeaders: jest.fn(() => ({ "X-API-Key": "test-key" })),
}));

jest.mock("@/lib/storage", () => ({
  storage: {
    getDeviceId: jest.fn(async () => "device-test-1234"),
  },
}));

jest.mock("@/lib/logger", () => ({
  logger: { error: jest.fn() },
}));

async function settleStorage(): Promise<void> {
  for (let i = 0; i < 5; i++) {
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
  }
}

function getAsyncStorage(): typeof import("@react-native-async-storage/async-storage").default {
  const module = require("@react-native-async-storage/async-storage");
  return module.default ?? module;
}

describe("privacy-respecting telemetry", () => {
  beforeEach(async () => {
    jest.resetModules();
    await getAsyncStorage().clear();
    global.fetch = jest.fn();
  });

  it("stores only a daily counter for each event", async () => {
    const { track } =
      require("@/lib/telemetry") as typeof import("@/lib/telemetry");

    track("app_open");
    track("app_open");
    track("day_complete");
    await settleStorage();

    const AsyncStorage = getAsyncStorage();
    const queue = JSON.parse(
      (await AsyncStorage.getItem("telemetryQueue")) ?? "{}",
    );
    expect(queue).toEqual({
      "2026-07-18|app_open": 2,
      "2026-07-18|day_complete": 1,
    });
  });

  it("flushes counts with the anonymous device id and clears accepted rows", async () => {
    const AsyncStorage = getAsyncStorage();
    await AsyncStorage.setItem(
      "telemetryQueue",
      JSON.stringify({ "2026-07-18|recap_viewed": 3 }),
    );
    (global.fetch as jest.Mock).mockResolvedValue({ ok: true });
    const { flushTelemetry } =
      require("@/lib/telemetry") as typeof import("@/lib/telemetry");

    await flushTelemetry(true);
    await settleStorage();

    expect(global.fetch).toHaveBeenCalledWith(
      "https://api.example.test/api/telemetry",
      expect.objectContaining({
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-API-Key": "test-key",
        },
      }),
    );
    const request = (global.fetch as jest.Mock).mock.calls[0][1];
    expect(JSON.parse(request.body)).toEqual({
      deviceId: "device-test-1234",
      events: [{ day: "2026-07-18", event: "recap_viewed", count: 3 }],
    });
    expect(await AsyncStorage.getItem("telemetryQueue")).toBe("{}");
  });

  it("keeps counts queued when the server does not accept them", async () => {
    const AsyncStorage = getAsyncStorage();
    const queued = { "2026-07-18|widget_action_logged": 1 };
    await AsyncStorage.setItem("telemetryQueue", JSON.stringify(queued));
    (global.fetch as jest.Mock).mockResolvedValue({ ok: false });
    const { flushTelemetry } =
      require("@/lib/telemetry") as typeof import("@/lib/telemetry");

    await flushTelemetry(true);
    await settleStorage();

    expect(JSON.parse((await AsyncStorage.getItem("telemetryQueue"))!)).toEqual(
      queued,
    );
  });
});
