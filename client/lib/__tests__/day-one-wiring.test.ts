import fs from "fs";
import path from "path";

const read = (relative: string) =>
  fs.readFileSync(path.resolve(__dirname, "../..", relative), "utf8");

// The day-one notification's scheduling decision is unit-tested in
// notifications.test.ts. These pin where the screens call it, which only a
// device run would otherwise show.
describe("day-one notification wiring", () => {
  test("the ask follows a saved plan, and only for a later start", () => {
    const onboarding = read("screens/OnboardingScreen.tsx");
    const saved = onboarding.indexOf(
      "await storage.commitOnboardingPlan(draft)",
    );
    const asked = onboarding.indexOf(
      "if (laterStart) await offerDayOneNotification(laterStart);",
    );
    expect(saved).toBeGreaterThan(-1);
    expect(asked).toBeGreaterThan(saved);
    expect(onboarding).toContain("const laterStart = planStartInstant(draft);");
    // The plain reason is shown before the system prompt
    expect(onboarding).toContain('"Hear from us on day one?"');
    // The answer is recorded against this plan's start
    expect(onboarding).toMatch(/askForDayOnePermission\(\s*start,/);
  });

  test("the countdown card says one quiet line when notifications are denied", () => {
    const card = read("components/PlanCountdownCard.tsx");
    expect(card).toContain(
      '"Turn on notifications in Settings to hear from us on day one."',
    );
    expect(card).toMatch(/\{notificationsDenied \? \(/);
    expect(card).not.toMatch(/warm-?up/i);
  });

  test("turning reminders on in Profile schedules it right away", () => {
    const profile = read("screens/ProfileScreen.tsx");
    const scheduled = profile.indexOf("await scheduleDailyReminder({");
    const synced = profile.indexOf(
      "await syncDayOneNotification(persona?.createdAt);",
    );
    expect(scheduled).toBeGreaterThan(-1);
    expect(synced).toBeGreaterThan(scheduled);
  });

  test("Today keeps the notification matched to the active plan", () => {
    const today = read("screens/TodayScreen.tsx");
    expect(today).toMatch(
      /useDayOneNotification\(\s*personaCreatedAt,\s*!isLoading,\s*todayDateStr,\s*\)/,
    );
    expect(today).toContain("notificationsDenied={dayOneNotificationsDenied}");
  });
});
