import React from "react";
import { AbsoluteFill, Sequence } from "remotion";
import { BG, CTA, FadeInOut, FeatureScene, Glows, Hook } from "./shared";

// Scene timing: generous read time per screen (30fps)
// hook 4.5s → features 5.3s each → CTA 3.5s
const HOOK_LEN = 135;
const FEAT_LEN = 160;
const CTA_LEN = 105;

export const variantDuration = (featureCount: number) =>
  HOOK_LEN + featureCount * FEAT_LEN + CTA_LEN;

interface FeatSpec {
  src: string;
  kicker: string;
  title: string;
  gradientWord?: string;
  sub: string;
}

export interface VariantSpec {
  id: string;
  file: string;
  hook: { line1: string; line2: string; fontSize?: number };
  feats: FeatSpec[];
}

const VariantPromo: React.FC<{ spec: VariantSpec }> = ({ spec }) => (
  <AbsoluteFill style={{ backgroundColor: BG }}>
    <Glows />
    <Sequence durationInFrames={HOOK_LEN}>
      <FadeInOut>
        <Hook {...spec.hook} />
      </FadeInOut>
    </Sequence>
    {spec.feats.map((f, i) => (
      <Sequence
        key={`${f.src}-${i}`}
        from={HOOK_LEN + i * FEAT_LEN}
        durationInFrames={FEAT_LEN}
      >
        <FadeInOut>
          <FeatureScene {...f} tilt={i % 2 === 0 ? -2 : 2} />
        </FadeInOut>
      </Sequence>
    ))}
    <Sequence
      from={HOOK_LEN + spec.feats.length * FEAT_LEN}
      durationInFrames={CTA_LEN}
    >
      <FadeInOut>
        <CTA />
      </FadeInOut>
    </Sequence>
  </AbsoluteFill>
);

// Mid-Year Reset campaign (marketing/mid-year-reset/) — video versions of
// the five campaign scripts plus a half-time hero cut. App is live, so all
// CTAs point at the App Store.
export const VARIANTS: VariantSpec[] = [
  {
    // Hero: the half-time reframe (campaign thesis)
    id: "Promo",
    file: "halftime-hero.mp4",
    hook: {
      line1: "Your resolution isn't dead.",
      line2: "It's half-time.",
      fontSize: 96,
    },
    feats: [
      {
        src: "06-chat.png",
        kicker: "Restart smarter",
        title: "An AI coach rebuilds",
        gradientWord: "your plan",
        sub: "Say who you want to become.",
      },
      {
        src: "01-today.png",
        kicker: "Built for bad days",
        title: "Actions too small to",
        gradientWord: "skip",
        sub: "3–5 tiny actions. No zero days.",
      },
      {
        src: "02-journey.png",
        kicker: "Fresh start, monthly",
        title: "Every month opens at",
        gradientWord: "day one",
        sub: "Bad June? July starts clean.",
      },
      {
        src: "04-coach.png",
        kicker: "In your corner",
        title: "A coach that",
        gradientWord: "adjusts",
        sub: "Shrink the action. Keep the ambition.",
      },
    ],
  },
  {
    // Campaign script #1: "Why your resolution failed" (myth-buster)
    id: "PromoSetup",
    file: "why-it-failed.mp4",
    hook: {
      line1: "Your resolution didn't fail because you're lazy.",
      line2: "It failed because of the setup.",
      fontSize: 80,
    },
    feats: [
      {
        src: "06-chat.png",
        kicker: "The fix",
        title: "A plan, not a",
        gradientWord: "wish",
        sub: "An AI coach maps the daily steps.",
      },
      {
        src: "01-today.png",
        kicker: "No willpower needed",
        title: "Too small to",
        gradientWord: "skip",
        sub: "Motivation fades. Tiny actions don't.",
      },
      {
        src: "02-journey.png",
        kicker: "Survives bad weeks",
        title: "Missing a day isn't",
        gradientWord: "failing",
        sub: "Streak shields. Progress that never drains.",
      },
    ],
  },
  {
    // Campaign script #2: "Become someone" (identity angle)
    id: "PromoIdentity",
    file: "become-someone.mp4",
    hook: {
      line1: "Stop setting goals.",
      line2: "Decide who you're becoming.",
      fontSize: 92,
    },
    feats: [
      {
        src: "01-today.png",
        kicker: "Identity in action",
        title: "Every check-in is a",
        gradientWord: "vote",
        sub: "Small wins prove who you are.",
      },
      {
        src: "02-journey.png",
        kicker: "No finish line",
        title: "Goals end. Identity",
        gradientWord: "doesn't.",
        sub: "Watch yourself become that person.",
      },
    ],
  },
  {
    // Campaign script #3: "The 2-minute version" (zero days)
    id: "PromoZeroDays",
    file: "zero-days.mp4",
    hook: {
      line1: "Streaks don't die from bad days.",
      line2: "They die from zero days.",
      fontSize: 88,
    },
    feats: [
      {
        src: "01-today.png",
        kicker: "Shrink it, don't skip it",
        title: "Bad day? Do the tiny",
        gradientWord: "version",
        sub: "Six squats still count. No zeros.",
      },
      {
        src: "02-journey.png",
        kicker: "Protected progress",
        title: "Your streak carries a",
        gradientWord: "shield",
        sub: "One miss never erases you.",
      },
    ],
  },
  {
    // Campaign script #4: "The AI coach" (skeptic story)
    id: "PromoCoach",
    file: "ai-coach-skeptic.mp4",
    hook: {
      line1: "I gave an AI coach my goals for a month.",
      line2: "I went in a skeptic.",
      fontSize: 84,
    },
    feats: [
      {
        src: "06-chat.png",
        kicker: "Not a checklist",
        title: "It coaches, it doesn't",
        gradientWord: "lecture",
        sub: "Bad week? It adjusts the plan.",
      },
      {
        src: "04-coach.png",
        kicker: "It remembers",
        title: "A coach in your",
        gradientWord: "corner",
        sub: "It follows up on what you said.",
      },
    ],
  },
  {
    // Campaign script #5: "Any day can be day one" (mid-year payoff)
    id: "PromoDayOne",
    file: "any-day-day-one.mp4",
    hook: {
      line1: "Nothing is special about January 1st.",
      line2: "Any day can be day one.",
      fontSize: 88,
    },
    feats: [
      {
        src: "02-journey.png",
        kicker: "Fresh start built in",
        title: "Every month opens at",
        gradientWord: "zero",
        sub: "Bad June? July starts clean.",
      },
      {
        src: "01-today.png",
        kicker: "Start today",
        title: "Day one is three tiny",
        gradientWord: "actions",
        sub: "Check them off. You're back.",
      },
    ],
  },
];

export const variantComponent = (spec: VariantSpec): React.FC => {
  const Comp: React.FC = () => <VariantPromo spec={spec} />;
  return Comp;
};
