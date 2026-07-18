import { buildWitnessCelebration } from "@/lib/witness";

jest.mock("@react-native-async-storage/async-storage", () =>
  jest.requireActual(
    "@react-native-async-storage/async-storage/jest/async-storage-mock",
  ),
);

describe("one-person witness accountability", () => {
  it("builds celebration-only copy with no request or consequence", () => {
    const message = buildWitnessCelebration(
      "Maya",
      {
        id: "p1",
        name: "Consistent Runner",
        description: "",
        createdAt: "2026-01-01T00:00:00.000Z",
      },
      5,
      71,
    );
    expect(message).toContain("Hi Maya");
    expect(message).toContain("5 votes for Consistent Runner");
    expect(message).toContain("No fixing needed");
    expect(message).not.toMatch(/owe|failed|disappoint|must/i);
  });
});
