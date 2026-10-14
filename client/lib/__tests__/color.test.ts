import { withAlpha } from "../color";

describe("withAlpha", () => {
  it("converts six-digit hex to rgba", () => {
    expect(withAlpha("#00D9FF", 0.12)).toBe("rgba(0, 217, 255, 0.12)");
    expect(withAlpha("#00677A", 0.1)).toBe("rgba(0, 103, 122, 0.1)");
  });

  it("expands three-digit hex", () => {
    expect(withAlpha("#fff", 0.5)).toBe("rgba(255, 255, 255, 0.5)");
  });

  it("clamps alpha to 0-1", () => {
    expect(withAlpha("#000000", 2)).toBe("rgba(0, 0, 0, 1)");
    expect(withAlpha("#000000", -1)).toBe("rgba(0, 0, 0, 0)");
  });

  it("returns non-hex colors unchanged", () => {
    expect(withAlpha("rgba(1, 2, 3, 0.4)", 0.2)).toBe("rgba(1, 2, 3, 0.4)");
  });
});
