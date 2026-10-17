import { aiUsageIdentity, isValidDeviceId } from "../device-id";

describe("X-Device-Id validation", () => {
  it("accepts the UUIDs the client mints", () => {
    const uuid = "3f2b8c1e-9d4a-4f6b-8e2a-1c5d7b9e0a12";
    expect(isValidDeviceId(uuid)).toBe(true);
    expect(aiUsageIdentity(uuid, "203.0.113.5")).toEqual({
      deviceId: uuid,
      usageKey: uuid,
    });
  });

  it("rejects missing, oversized, and malformed ids", () => {
    for (const value of [
      undefined,
      "",
      "short",
      "a".repeat(65),
      "ip:203.0.113.5",
      "abc def ghi",
      "../../etc/passwd",
      "id'; DROP TABLE x;--",
    ]) {
      expect(isValidDeviceId(value)).toBe(false);
    }
  });

  it("falls back to the IP bucket for an invalid header, like a missing one", () => {
    expect(aiUsageIdentity("x".repeat(500), "203.0.113.5")).toEqual({
      deviceId: null,
      usageKey: "ip:203.0.113.5",
    });
    expect(aiUsageIdentity(undefined, "203.0.113.5")).toEqual({
      deviceId: null,
      usageKey: "ip:203.0.113.5",
    });
  });

  it("cannot impersonate another caller's IP bucket", () => {
    expect(aiUsageIdentity("ip:198.51.100.7", "203.0.113.5").usageKey).toBe(
      "ip:203.0.113.5",
    );
  });
});
