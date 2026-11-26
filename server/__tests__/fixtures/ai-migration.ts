import {
  PLAN_TUNE_UP_FACTORS,
  PLAN_TUNE_UP_WEEKDAYS,
} from "../../../shared/plan-tune-up";

export const personaPlan = {
  personaName: "Curious Reader",
  personaDescription: "Someone who makes a little room for reading each day.",
  benchmarks: Array.from({ length: 3 }, (_, index) => ({
    title: `Reading milestone ${index + 1}`,
    elementalAction: {
      title: "Read a page",
      frequency: ["Monday", "Wednesday"],
      kickstartVersion: "Open the book",
      anchorLink: "After breakfast",
    },
  })),
};

export const legacyTuneUpRequest = {
  consent: true,
  action: {
    title: "Read a page",
    frequency: ["Monday", "Wednesday"],
    anchorLink: "After breakfast",
    kickstartVersion: "Open the book",
  },
  evidence: {
    windowDays: 28,
    scheduled: 8,
    completed: 2,
    full: 1,
    kickstart: 1,
    weekdays: PLAN_TUNE_UP_WEEKDAYS.map((day) => ({
      day,
      scheduled: ["Monday", "Wednesday"].includes(day) ? 4 : 0,
      completed: day === "Monday" ? 2 : 0,
    })),
    factors: PLAN_TUNE_UP_FACTORS.map((factor) => ({
      factor,
      helped: 0,
      hindered: factor === "time" ? 4 : 0,
    })),
  },
};

export const ambientTuneUpRequest = {
  daysActive: 30,
  monthlyConsistency: 25,
  actions: [
    {
      slot: 0,
      frequency: ["Monday", "Wednesday"],
      anchorLink: "After breakfast",
      kickstartVersion: "Open the book",
      scheduled: 8,
      completed: 2,
      kickstarts: 1,
      factors: Object.fromEntries(
        ["energy", "time", "support", "environment", "planFit"].map(
          (factor) => [
            factor,
            { helped: 0, hindered: factor === "time" ? 4 : 0 },
          ],
        ),
      ),
    },
  ],
};

const messages = [
  {
    role: "system",
    content:
      "You are a supportive identity-based habit coach. Be brief and concrete. Never diagnose or prescribe treatment.",
  },
  {
    role: "user",
    content:
      "I want to become a curious reader. I read a page on Monday, but missed Wednesday because I ran out of time. Help me take one small next step.",
  },
];

export const aiMigrationCases = [
  {
    name: "onboarding-chat",
    path: "/api/chat",
    body: { messages },
    stream: true,
    content: "Opening the book can be your next small step. When would it fit?",
  },
  {
    name: "persona-extraction",
    path: "/api/extract-persona",
    body: {
      messages,
      extractionPrompt:
        "Extract the user's identity and create exactly three concise milestones with concrete actions. Use the required JSON schema. Include title, weekday frequency, an under-two-minute kickstartVersion and an anchorLink for every action.",
    },
    stream: false,
    content: JSON.stringify(personaPlan),
  },
  {
    name: "reflection-stream",
    path: "/api/reflection",
    body: { messages, stream: true },
    stream: true,
    content:
      "Monday shows that a small start fits. Try opening the book again.",
  },
  {
    name: "reflection-legacy-json",
    path: "/api/reflection",
    body: { messages },
    stream: false,
    content: "Try opening the book after breakfast and see how that feels.",
  },
  {
    name: "milestone-proposal",
    path: "/api/milestone-proposal",
    body: { completedMilestone: "Read a page", personaName: "Curious Reader" },
    stream: false,
    content: JSON.stringify({ title: "Explore a new author" }),
  },
  {
    name: "tune-up-ambient",
    path: "/api/plan-tune-up",
    body: ambientTuneUpRequest,
    stream: false,
    content: JSON.stringify({
      slot: 0,
      changes: { frequency: ["Monday"] },
      rationale: "A smaller schedule may fit the time you have available.",
    }),
  },
  {
    name: "tune-up-legacy",
    path: "/api/plan-tune-up",
    body: legacyTuneUpRequest,
    stream: false,
    content: JSON.stringify({
      summary: "A smaller schedule may give you more room to start.",
      changes: { frequency: ["Monday"] },
    }),
  },
];
