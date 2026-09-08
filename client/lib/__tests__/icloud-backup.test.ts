import {
  parsePrivateBackup,
  summarizePrivateBackup,
} from "@/lib/icloud-backup";

jest.mock("@react-native-async-storage/async-storage", () =>
  jest.requireActual(
    "@react-native-async-storage/async-storage/jest/async-storage-mock",
  ),
);

describe("private iCloud backup format", () => {
  it("round-trips a versioned local-data payload", () => {
    const raw = JSON.stringify({
      schemaVersion: 1,
      createdAt: "2026-07-18T12:00:00.000Z",
      values: {
        personas: '[{"id":"p1"}]',
        dailyLogs: "[]",
      },
    });
    const backup = parsePrivateBackup(raw);
    expect(backup.values.personas).toContain("p1");
    expect(summarizePrivateBackup(backup)).toMatchObject({
      itemCount: 2,
      createdAt: "2026-07-18T12:00:00.000Z",
    });
  });

  it("rejects entitlement and anonymous identity data", () => {
    expect(() =>
      parsePrivateBackup(
        JSON.stringify({
          schemaVersion: 1,
          createdAt: "2026-07-18T12:00:00.000Z",
          values: { subscription: "{}" },
        }),
      ),
    ).toThrow("unsupported data");
    expect(() =>
      parsePrivateBackup(
        JSON.stringify({
          schemaVersion: 1,
          createdAt: "2026-07-18T12:00:00.000Z",
          values: { deviceId: "secret" },
        }),
      ),
    ).toThrow("unsupported data");
  });

  it("rejects unknown schema versions", () => {
    expect(() =>
      parsePrivateBackup(
        JSON.stringify({ schemaVersion: 2, createdAt: "now", values: {} }),
      ),
    ).toThrow("supported format");
  });
});
