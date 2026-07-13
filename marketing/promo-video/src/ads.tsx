import React from "react";
import { AbsoluteFill, Sequence } from "remotion";
import { BG, CTA, FadeInOut, FeatureScene, Glows, Hook } from "./shared";

// Paid-creative cuts: Meta rewards sub-15s video, so these run one hook,
// one or two features, and the CTA at a tighter clip than organic.
const HOOK_LEN = 90;
const FEAT_LEN = 110;
const CTA_LEN = 80;

export const adDuration = (featureCount: number) =>
  HOOK_LEN + featureCount * FEAT_LEN + CTA_LEN;

interface AdFeat {
  src: string;
  kicker: string;
  title: string;
  gradientWord?: string;
  sub: string;
}

export interface AdSpec {
  id: string;
  file: string;
  hook: { line1: string; line2: string; fontSize?: number };
  feats: AdFeat[];
}

const AdCut: React.FC<{ spec: AdSpec }> = ({ spec }) => (
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

export const AD_CUTS: AdSpec[] = [
  {
    // Half-time hero, tightened for paid
    id: "AdHero",
    file: "ad-halftime-hero.mp4",
    hook: {
      line1: "Your resolution isn't dead.",
      line2: "It's half-time.",
      fontSize: 96,
    },
    feats: [
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
    ],
  },
  {
    // Myth-buster, single-feature punch
    id: "AdSetup",
    file: "ad-why-it-failed.mp4",
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
    ],
  },
  {
    // Mid-year payoff, single-feature punch
    id: "AdDayOne",
    file: "ad-any-day-day-one.mp4",
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
    ],
  },
];

export const adComponent = (spec: AdSpec): React.FC => {
  const Comp: React.FC = () => <AdCut spec={spec} />;
  return Comp;
};
