import fs from "fs";
import path from "path";

// The live coach implementation is the CoachSheet; the Coach tab itself is a
// lobby that only routes into it. These source-level checks guard the
// lifecycle contracts that unit tests can't reach through the sheet UI.
describe("Coach session lifecycle (CoachSheet)", () => {
  const source = fs.readFileSync(
    path.resolve(__dirname, "../../screens/CoachSheetScreen.tsx"),
    "utf8",
  );

  it("aborts the in-flight request when the sheet unmounts", () => {
    expect(source).toContain("return () => abortRef.current?.abort()");
  });

  it("replaces any in-flight request before starting a new one", () => {
    expect(source).toContain("abortRef.current?.abort();");
    expect(source).toContain("controller.signal");
  });

  it("routes a quota-blocked request to the contextual paywall", () => {
    expect(source).toContain("coachRequestAllowed");
    expect(source).toContain('{ source: "coach-limit" }');
  });

  it("keeps the lobby free of its own chat session", () => {
    const lobby = fs.readFileSync(
      path.resolve(__dirname, "../../screens/ReflectScreen.tsx"),
      "utf8",
    );
    expect(lobby).not.toContain("getReflectionResponse");
    expect(lobby).not.toContain("startWeekly");
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
    expect(reflection).toContain("TYPEWRITER_DELAY_MS");
  });
});
