import fs from "fs";
import path from "path";

const read = (relative: string) =>
  fs.readFileSync(path.resolve(__dirname, "../..", relative), "utf8");

// The look-back is free in full (1.7.0). These pin the three places a
// Premium gate on it used to live, which no pure-logic test can see.
describe("the year look-back is free", () => {
  test("the story screen shows every card and never opens the paywall", () => {
    const screen = read("screens/YearRecapScreen.tsx");
    expect(screen).not.toMatch(/isPremium\s*\?\s*cards/);
    expect(screen).not.toContain('navigate("Subscription"');
    expect(screen).not.toMatch(/with Premium/i);
    expect(screen).toContain("const visibleCards = cards;");
  });

  test("the Today card is not limited to Premium", () => {
    const today = read("screens/TodayScreen.tsx");
    const start = today.indexOf("const yearRecapEligible =");
    const eligibility = today.slice(start, today.indexOf(";", start));
    expect(start).toBeGreaterThan(-1);
    expect(eligibility).not.toContain("isPremium");
    expect(read("components/YearRecapCard.tsx")).not.toMatch(/premium/i);
  });

  test("the paywall no longer lists the year story as a Premium benefit", () => {
    const paywall = read("screens/SubscriptionScreen.tsx");
    expect(paywall).not.toMatch(/Year You Became/i);
    expect(paywall).not.toMatch(/year-recap/);
    expect(paywall).not.toMatch(/Full story/i);
    // The rows Premium keeps
    expect(paywall).toContain('title="Coach memory"');
    expect(paywall).toContain('title="Insights"');
    expect(paywall).toContain('title="Earned rest days"');
  });
});
