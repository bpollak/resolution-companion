import React from "react";
import {
  AbsoluteFill,
  Audio,
  Sequence,
  interpolate,
  staticFile,
  useCurrentFrame,
} from "remotion";
import { BG, CTA, FadeInOut, FeatureScene, FONT, Glows, Hook } from "./shared";

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

// Whisper transcript of Brett's actual read (small.en words, base.en
// word-level timings), frames @30fps. Each line holds until the next
// starts so the muted-feed viewer never loses the thread.
const CAPTIONS: Array<{ from: number; to: number; text: string }> = [
  { from: 14, to: 103, text: "Your New Year's resolution isn't dead — it's half-time." },
  { from: 107, to: 175, text: "You didn't fail some once-a-year test back in February." },
  { from: 179, to: 236, text: "You made your resolution for a reason." },
  { from: 240, to: 301, text: "Get the app that helps you get back on track." },
  { from: 305, to: 378, text: "Tell it your goals — an AI coach helps you along." },
  { from: 382, to: 471, text: "It gives you a few tiny daily actions that become habits." },
  { from: 475, to: 532, text: "And every month, your score starts clean." },
  { from: 536, to: 596, text: "Bad June? July opens at day one." },
  { from: 600, to: 656, text: "It's July. It's not too late." },
  { from: 660, to: 700, text: "That's half-time." },
];

// Big burned-in captions for muted-autoplay feeds (LinkedIn). Sits above
// the platform's bottom UI overlay zone (~260px).
const Captions: React.FC = () => {
  const frame = useCurrentFrame();
  const line = CAPTIONS.find((c) => frame >= c.from && frame < c.to);
  if (!line) return null;
  const opacity = interpolate(
    frame,
    [line.from, line.from + 4, line.to - 4, line.to],
    [0, 1, 1, 0],
  );
  return (
    <div
      style={{
        position: "absolute",
        left: 60,
        right: 60,
        bottom: 300,
        display: "flex",
        justifyContent: "center",
        opacity,
      }}
    >
      <div
        style={{
          fontFamily: FONT,
          fontSize: 46,
          fontWeight: 800,
          color: "white",
          textAlign: "center",
          lineHeight: 1.3,
          background: "rgba(8, 8, 14, 0.75)",
          borderRadius: 20,
          padding: "16px 30px",
          maxWidth: 900,
        }}
      >
        {line.text}
      </div>
    </div>
  );
};

export const HeroVO: React.FC<{ captions?: boolean }> = ({ captions }) => (
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
    {captions ? <Captions /> : null}
  </AbsoluteFill>
);

export const HeroVOCaptioned: React.FC = () => <HeroVO captions />;
