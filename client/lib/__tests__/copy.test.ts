import { repeatsText } from "@/lib/copy";

describe("repeatsText", () => {
  it("flags a milestone label that restates the habit", () => {
    expect(
      repeatsText(
        "20-minute walk after dinner (weekdays)",
        "Do a 20-minute walk after dinner, Monday-Friday",
      ),
    ).toBe(true);
  });

  it("keeps a label that adds the real goal", () => {
    expect(repeatsText("Lose 15 lb", "Do a 20-minute walk after dinner")).toBe(
      false,
    );
  });
});
