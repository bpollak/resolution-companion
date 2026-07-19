import { getLocalDateString, startOfWeek } from "@/lib/progress";

/**
 * Identity-science micro-notes: a 60-second daily read drip (the Atoms
 * lesson — a content moat costs no API tokens and gives rest days a reason
 * to open the app). Premium gets a fresh note daily; free gets one per week.
 * All notes are bundled — no network, no AI cost.
 */

export interface MicroNote {
  id: string;
  title: string;
  body: string;
}

export const MICRO_NOTES: MicroNote[] = [
  {
    id: "identity-votes",
    title: "Every action is a ballot",
    body: 'Identity-based habit research reframes the question from "what do I want to achieve?" to "who do I want to become?" Each completed action is one vote for that person. No single vote decides an election — and no single miss loses one. What matters is which way most ballots lean.',
  },
  {
    id: "two-minute-rule",
    title: "Why 2 minutes beats 30",
    body: "A habit must exist before it can grow. Scaling an action down to its 2-minute version — put on the shoes, open the doc — keeps the neural groove alive on days when motivation is gone. Consistency of showing up matters more than size of effort, because you can only improve a habit that still exists.",
  },
  {
    id: "missing-once",
    title: "The math of missing once",
    body: 'Habit-formation studies found that missing a single day had no measurable effect on long-term habit strength. The danger isn\'t the miss — it\'s the story you tell about it. "I\'m off track" starts a spiral; "that was one vote the other way" ends it. Never miss twice is the whole rule.',
  },
  {
    id: "fresh-start",
    title: "The fresh-start effect",
    body: "Behavioral scientists call it the fresh-start effect: people are measurably more likely to begin (and restart) after a temporal landmark — a new month, a Monday, a birthday. That's why your consistency resets monthly here. The calendar hands you a clean slate twelve times a year. Any day can be day one, but some days make it easier.",
  },
  {
    id: "anchors",
    title: "Habits don't float",
    body: "A habit without a cue is a wish. Attaching a new action to an existing routine — after I pour coffee, after I park the car — borrows the reliability of something you already do without thinking. The strongest anchor is one that happens at the same point every day, no willpower required.",
  },
  {
    id: "celebration",
    title: "Emotions build habits",
    body: "BJ Fogg's lab work at Stanford points to a simple mechanism: behaviors wired in by positive emotion stick. The instant you finish an action, let it land — the checkmark, the haptic, even a quiet \"that's who I am.\" Feeling successful in the moment is not indulgence; it's the wiring step.",
  },
  {
    id: "self-compassion",
    title: "Self-compassion outperforms self-criticism",
    body: "Research on self-compassion consistently finds that people who respond to their own lapses with warmth get back on track faster than those who scold themselves. Harshness feels rigorous but predicts giving up. Talking to yourself like you'd talk to a friend is a performance strategy, not a soft one.",
  },
  {
    id: "environment",
    title: "Design beats discipline",
    body: "The people who look the most disciplined usually rely on it the least — they arrange their environment so the right action is the easy one. Shoes by the door, book on the pillow, phone in the drawer. Every choice you remove from the moment of decision is willpower you don't have to spend.",
  },
  {
    id: "motivation-follows",
    title: "Motivation follows action",
    body: "Waiting to feel like it gets the order backwards. Motivation is usually the result of starting, not the cause — the first two minutes generate the momentum the next twenty run on. That's the quiet job of the kickstart version: it doesn't finish the work, it manufactures the wanting-to.",
  },
  {
    id: "goal-gradient",
    title: "The closer you get, the harder you pull",
    body: "The goal-gradient effect: effort accelerates as a target gets closer — even for pigeons, even with fake progress. It's why a milestone that's 80% full feels magnetic. Use it deliberately: when energy is low, look at the fullest milestone, not the emptiest.",
  },
  {
    id: "what-the-hell",
    title: "Beating the what-the-hell effect",
    body: "Researchers call it the what-the-hell effect: break a rule once and the day feels ruined, so you abandon it entirely. The antidote is shrinking the unit of failure. A missed morning is not a missed day; a missed day is not a lost week. The smaller the unit, the sooner the comeback.",
  },
  {
    id: "identity-evidence",
    title: "You believe evidence, not affirmations",
    body: "Telling yourself \"I'm a runner\" changes little. Watching yourself lace up for the fourth Tuesday in a row changes everything — your brain updates identity from evidence. This is why tiny completed actions outperform grand plans: they're admissible in the court where it counts.",
  },
  {
    id: "streak-truth",
    title: "What a streak is actually for",
    body: "A streak is a mirror, not a master. Its job is to show you the person you're becoming — not to become a fragile treasure you're afraid to drop. That's why shields exist and why milestones only fill. If losing a number can end the habit, the number was carrying the wrong weight.",
  },
  {
    id: "temptation-bundling",
    title: "Bundle want with should",
    body: "Katherine Milkman's temptation-bundling studies pair a pleasure with a duty — the podcast you love only while walking, the fancy coffee only while reviewing your plan. The indulgence stops competing with the habit and starts funding it.",
  },
  {
    id: "plans-bend",
    title: "Plans that bend don't break",
    body: "Rigid plans shatter on contact with a bad week. The resilient move is pre-deciding the bend: which action shrinks, which day moves, what the 2-minute floor is. A plan with joints survives storms that snap a stiff one. Bending is not failing — it's how the plan stays alive.",
  },
  {
    id: "implementation-intentions",
    title: '"When X, I will Y"',
    body: 'Implementation intentions — deciding in advance when and where you\'ll act — roughly double follow-through in study after study. "I\'ll write tomorrow" is a hope. "After breakfast, at the kitchen table, I\'ll write one paragraph" is a program your brain can run without a debate.',
  },
  {
    id: "rest-days",
    title: "Rest is part of the program",
    body: "Unscheduled days aren't gaps in your becoming — they're the recovery interval that makes the scheduled days sustainable. Athletes don't apologize for rest days; they plan them. A day with nothing scheduled bridges your streak here for exactly that reason.",
  },
  {
    id: "comeback-skill",
    title: "The only skill that matters",
    body: "Everyone's streak eventually breaks — travel, illness, life. Long-term change belongs to the people who are good at coming back, not the people who never leave. Every return after a gap is a repetition of the master skill. Practice it without shame; it's the one you'll use forever.",
  },
];

/** Weekly note key for free users, daily for premium. */
export function getTodaysMicroNote(
  isPremium: boolean,
  today: Date = new Date(),
): MicroNote {
  const key = isPremium
    ? getLocalDateString(today)
    : getLocalDateString(startOfWeek(today));
  let hash = 0;
  for (let i = 0; i < key.length; i++) {
    hash = (hash * 31 + key.charCodeAt(i)) >>> 0;
  }
  return MICRO_NOTES[hash % MICRO_NOTES.length];
}
