import fs from "fs";
import path from "path";

describe("Coach session lifecycle", () => {
  const source = fs.readFileSync(
    path.resolve(__dirname, "../../screens/ReflectScreen.tsx"),
    "utf8",
  );

  it("opens with grounded local copy instead of waiting on the model", () => {
    const starter = source.slice(
      source.indexOf("const beginReflectionSession"),
      source.indexOf("const requestCoachReply"),
    );
    expect(starter).toContain("buildCoachOpening");
    expect(starter).not.toContain("getReflectionResponse(");
    expect(starter).toContain("setIsLoading(false)");
  });

  it("invalidates late responses before they can enter a newer session", () => {
    expect(source).toContain("coachRequestGenerationRef");
    expect(source).toContain(
      "requestGeneration !== coachRequestGenerationRef.current",
    );
  });

  it("cancels the active request when a session closes", () => {
    expect(source).toContain("coachAbortControllerRef.current?.abort()");
    expect(source).toContain("abortController.signal");
  });

  it("uses the same incremental SSE typewriter path as onboarding", () => {
    const aiSource = fs.readFileSync(
      path.resolve(__dirname, "../../lib/ai.ts"),
      "utf8",
    );
    const reflection = aiSource.slice(
      aiSource.indexOf("export async function getReflectionResponse"),
    );
    expect(reflection).toContain('streamSSERequest(\n    "/api/reflection"');
    expect(reflection).toContain("{ messages: allMessages, stream: true }");
    expect(reflection).toContain("STREAM_DELAY_MS");
  });
});
