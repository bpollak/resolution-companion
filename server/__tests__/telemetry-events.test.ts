import fs from "node:fs";
import path from "node:path";
import {
  TELEMETRY_EVENTS,
  acceptTelemetryEvents,
  isValidTelemetryDay,
} from "../telemetry-events";

const NOW = Date.UTC(2026, 8, 28, 12);

describe("telemetry allowlist", () => {
  it("covers every event the app can send", () => {
    const source = fs.readFileSync(
      path.resolve(__dirname, "../../client/lib/telemetry.ts"),
      "utf8",
    );
    const union = source.slice(
      source.indexOf("type TelemetryEvent"),
      source.indexOf(";", source.indexOf("type TelemetryEvent")),
    );
    const names = Array.from(union.matchAll(/"([a-z_]+)"/g), (m) => m[1]);
    expect(names.length).toBeGreaterThan(0);
    expect(names.filter((name) => !TELEMETRY_EVENTS.has(name))).toEqual([]);
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
