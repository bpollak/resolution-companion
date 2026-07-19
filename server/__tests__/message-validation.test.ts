import { validateMessages } from "../message-validation";

describe("validateMessages", () => {
  it("accepts a fully personalized Coach system prompt", () => {
    expect(
      validateMessages([
        { role: "system", content: "context ".repeat(1000) },
        { role: "assistant", content: "What was one win this week?" },
        { role: "user", content: "I completed my weekend run." },
      ]),
    ).toBeNull();
  });

  it("keeps user-authored and assistant turns capped at 4,000 characters", () => {
    expect(
      validateMessages([{ role: "user", content: "x".repeat(4001) }]),
    ).toBe("user messages must be at most 4000 characters");
    expect(
      validateMessages([{ role: "assistant", content: "x".repeat(4001) }]),
    ).toBe("assistant messages must be at most 4000 characters");
  });

  it("still bounds individual system prompts and the total request", () => {
    expect(
      validateMessages([{ role: "system", content: "x".repeat(16001) }]),
    ).toBe("system messages must be at most 16000 characters");
    expect(
      validateMessages(
        Array.from({ length: 4 }, () => ({
          role: "system",
          content: "x".repeat(12501),
        })),
      ),
    ).toBe("messages must total at most 50000 characters");
  });

  it("rejects malformed and empty message collections", () => {
    expect(validateMessages([])).toBe("messages must be a non-empty array");
    expect(validateMessages([{ role: "invalid", content: "hello" }])).toBe(
      "each message must have a valid role and string content",
    );
  });
});
