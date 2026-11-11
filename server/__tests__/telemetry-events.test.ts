import { TELEMETRY_EVENT_NAMES } from "../../client/lib/telemetry";
import {
  TELEMETRY_EVENTS,
  acceptTelemetryEvents,
  isValidTelemetryDay,
} from "../telemetry-events";

jest.mock("@react-native-async-storage/async-storage", () => ({}));
jest.mock("@/lib/query-client", () => ({}));
jest.mock("@/lib/progress", () => ({}));
jest.mock("@/lib/storage", () => ({}));
jest.mock("@/lib/logger", () => ({}));

const NOW = Date.UTC(2026, 8, 28, 12);

describe("telemetry allowlist", () => {
  it("every client event is allowlisted", () => {
    expect(TELEMETRY_EVENT_NAMES.length).toBeGreaterThan(0);
    expect(
      TELEMETRY_EVENT_NAMES.filter((name) => !TELEMETRY_EVENTS.has(name)),
    ).toEqual([]);
  });

  it("plain paywall_viewed stays allowlisted", () => {
    expect(TELEMETRY_EVENTS.has("paywall_viewed")).toBe(true);
  });

  it("keeps the events live 1.4.1 builds send", () => {
    for (const name of [
      "coach_sheet_opened",
      "today_signal_actioned",
      "coach_response_helpful",
      "plan_tuneup_previewed",
      "plan_tuneup_applied",
    ]) {
      expect(TELEMETRY_EVENTS.has(name)).toBe(true);
    }
  });
});

describe("acceptTelemetryEvents", () => {
  it("drops unknown event names without failing the batch", () => {
    expect(
      acceptTelemetryEvents(
        [
          { day: "2026-09-28", event: "app_open", count: 2 },
          { day: "2026-09-28", event: "some_future_event", count: 1 },
        ],
        NOW,
      ),
    ).toEqual([{ day: "2026-09-28", event: "app_open", count: 2 }]);
  });

  it("rejects malformed entries", () => {
    for (const bad of [
      null,
      { day: "2026-09-28", event: 5, count: 1 },
      { day: "9999-99-99", event: "app_open", count: 1 },
      { day: "2026-09-28", event: "app_open", count: 0 },
      { day: "2026-09-28", event: "app_open", count: 1.5 },
      { day: "2026-09-28", event: "app_open", count: 1001 },
    ]) {
      expect(acceptTelemetryEvents([bad], NOW)).toBeNull();
    }
  });
});

describe("isValidTelemetryDay", () => {
  it("bounds the day to a real, recent date", () => {
    expect(isValidTelemetryDay("2026-09-28", NOW)).toBe(true);
    expect(isValidTelemetryDay("2026-09-30", NOW)).toBe(true);
    expect(isValidTelemetryDay("2026-10-01", NOW)).toBe(false);
    expect(isValidTelemetryDay("2023-12-31", NOW)).toBe(false);
    expect(isValidTelemetryDay("2026-02-30", NOW)).toBe(false);
  });
});
