import { WEEKDAY_ORDER } from "@/lib/progress";

// The no-AI starter plan — also used to pad an AI plan that returns fewer than
// MIN_ACTIONS_PER_PERSONA actions (see OnboardingScreen).
//
// INVARIANT (enforced by starter-plan.test.ts): at least one action is
// scheduled on EVERY weekday, so a fresh install on any day — Sunday included —
// has something loggable on day one. Previously the anchor action was Mon–Fri
// only, which left Sunday empty (no reward loop to taste at activation). It is
// now daily; the 2-minute kickstart keeps that no-guilt.
export const STARTER_BENCHMARKS = [
  {
    title: "Build Daily Momentum",
    elementalAction: {
      title: "Complete one action toward your goal",
      frequency: [...WEEKDAY_ORDER], // every day — the daily-momentum anchor
      kickstartVersion: "Spend 2 minutes planning your next step",
      anchorLink: "After I check my phone in the morning",
    },
  },
  {
    title: "Develop Mindfulness Practice",
    elementalAction: {
      title: "Practice mindful breathing",
      frequency: ["Monday", "Wednesday", "Friday"],
      kickstartVersion: "Take 3 deep breaths",
      anchorLink: "After I sit down at my desk",
    },
  },
  {
    title: "Maintain Physical Wellness",
    elementalAction: {
      title: "Move your body intentionally",
      frequency: ["Tuesday", "Thursday", "Saturday"],
      kickstartVersion: "Do 10 jumping jacks",
      anchorLink: "After I wake up",
    },
  },
];
