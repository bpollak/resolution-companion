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
      source.indexOf("const sendMessage"),
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
});
