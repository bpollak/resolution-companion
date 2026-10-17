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

describe("tidyCoachText", () => {
  const { tidyCoachText } =
    jest.requireActual<typeof import("@/lib/copy")>("@/lib/copy");

  it("replaces em dashes with commas", () => {
    expect(tidyCoachText("Great goal, thanks — what's next?")).toBe(
      "Great goal, thanks, what's next?",
    );
    expect(tidyCoachText("every scheduled action—that's a start")).toBe(
      "every scheduled action, that's a start",
    );
  });

  it("keeps hyphens and ranges", () => {
    expect(tidyCoachText("A 20-minute walk, Monday–Friday.")).toBe(
      "A 20-minute walk, Monday–Friday.",
    );
  });
});
