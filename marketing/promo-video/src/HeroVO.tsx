import React from "react";
import { AbsoluteFill, Audio, Sequence, staticFile } from "remotion";
import { BG, CTA, FadeInOut, FeatureScene, Glows, Hook } from "./shared";

// Voiceover cut of the half-time hero. Scene boundaries sit on the
// narration's detected pauses (silencedetect on public/vo/hero.m4a),
// so every cut lands between the speaker's phrases:
//   0.0–7.9s  "Your resolution isn't dead… you just haven't started again yet."
//   7.9–12.7s "So I built an app… tell it who you want to become"
//  12.7–15.1s "…a few tiny daily actions"
//  15.1–19.5s "…score starts clean. Bad June? July opens at day one."
//  19.5s–end "It's July. Not too late. Half-time."
const CUTS = [236, 381, 451, 586];
export const HERO_VO_DURATION = 750; // audio ends ~23.8s; short logo tail

export const HeroVO: React.FC = () => (
  <AbsoluteFill style={{ backgroundColor: BG }}>
    <Glows />
    <Audio src={staticFile("vo/hero.m4a")} />
    <Sequence durationInFrames={CUTS[0]}>
      <FadeInOut>
        <Hook
          line1="Your resolution isn't dead."
          line2="It's half-time."
          fontSize={96}
        />
      </FadeInOut>
    </Sequence>
    <Sequence from={CUTS[0]} durationInFrames={CUTS[1] - CUTS[0]}>
      <FadeInOut>
        <FeatureScene
          src="06-chat.png"
          kicker="Restart smarter"
          title="An AI coach rebuilds"
          gradientWord="your plan"
          sub="Say who you want to become."
          tilt={-2}
        />
      </FadeInOut>
    </Sequence>
    <Sequence from={CUTS[1]} durationInFrames={CUTS[2] - CUTS[1]}>
      <FadeInOut>
        <FeatureScene
          src="01-today.png"
          kicker="Built for bad days"
          title="Actions too small to"
          gradientWord="skip"
          sub="3–5 tiny actions. No zero days."
          tilt={2}
        />
      </FadeInOut>
    </Sequence>
    <Sequence from={CUTS[2]} durationInFrames={CUTS[3] - CUTS[2]}>
      <FadeInOut>
        <FeatureScene
          src="02-journey.png"
          kicker="Fresh start, monthly"
          title="Every month opens at"
          gradientWord="day one"
          sub="Bad June? July starts clean."
          tilt={-2}
        />
      </FadeInOut>
    </Sequence>
    <Sequence from={CUTS[3]} durationInFrames={HERO_VO_DURATION - CUTS[3]}>
      <FadeInOut>
        <CTA />
      </FadeInOut>
    </Sequence>
  </AbsoluteFill>
);
