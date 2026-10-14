import { getModalSheetTopInset } from "../modal-layout";

describe("modal sheet top inset", () => {
  test("ignores the window inset inside an iOS page sheet", () => {
    expect(getModalSheetTopInset("ios", 59)).toBe(0);
  });

  test("keeps the status-bar inset for Android's full-screen modal", () => {
    expect(getModalSheetTopInset("android", 32)).toBe(32);
  });

  test("guards against an invalid inset", () => {
    expect(getModalSheetTopInset("android", -1)).toBe(0);
    expect(getModalSheetTopInset("android", Number.NaN)).toBe(0);
    expect(getModalSheetTopInset("web", 0)).toBe(0);
  });
});
