import fs from "fs";
import path from "path";
import { resolvePaywallSource } from "@/lib/paywall-source";

const contexts = {
  "coach-limit": { text: "" },
  insights: { text: "Insights" },
};

describe("resolvePaywallSource", () => {
  it("returns a source the paywall has a context for", () => {
    expect(resolvePaywallSource(contexts, "insights")).toBe("insights");
    expect(resolvePaywallSource(contexts, "coach-limit")).toBe("coach-limit");
  });

  it("falls back to the default paywall for a retired source", () => {
    // 1.7.0 retired "year-recap"; a stale navigation state or deep link
    // may still carry it.
    expect(resolvePaywallSource(contexts, "year-recap")).toBeNull();
  });

  it("falls back for missing, unknown, or malformed sources", () => {
    expect(resolvePaywallSource(contexts, undefined)).toBeNull();
    expect(resolvePaywallSource(contexts, null)).toBeNull();
    expect(resolvePaywallSource(contexts, "")).toBeNull();
    expect(resolvePaywallSource(contexts, 7)).toBeNull();
    // Inherited object keys are not sources
    expect(resolvePaywallSource(contexts, "toString")).toBeNull();
    expect(resolvePaywallSource(contexts, "__proto__")).toBeNull();
  });

  it("is what the paywall screen reads its context through", () => {
    const screen = fs.readFileSync(
      path.resolve(__dirname, "../../screens/SubscriptionScreen.tsx"),
      "utf8",
    );
    expect(screen).toContain(
      "resolvePaywallSource(SOURCE_CONTEXT, route.params?.source)",
    );
    expect(screen).not.toContain("SOURCE_CONTEXT[route.params.source]");
  });
});
