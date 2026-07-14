import React from "react";
import { Composition } from "remotion";
import { VARIANTS, variantComponent, variantDuration } from "./variants";
import { HERO_VO_DURATION, HeroVO, HeroVOCaptioned } from "./HeroVO";
import { AD_CUTS, adComponent, adDuration } from "./ads";
import { DEMO_DURATION, DemoMaster, DemoShort, SHORT_DURATION } from "./Demo";

// Feed-format sizes for the flagship script (Instagram/Facebook feed posts).
// All scripts render at 9:16 (1080×1920) — the master format for TikTok,
// IG Reels, FB Reels, and YouTube Shorts.
const FEED_FORMATS = [
  { suffix: "-45", width: 1080, height: 1350 },
  { suffix: "-11", width: 1080, height: 1080 },
];

export const RemotionRoot: React.FC = () => {
  return (
    <>
      {VARIANTS.map((spec) => (
        <Composition
          key={spec.id}
          id={spec.id}
          component={variantComponent(spec)}
          durationInFrames={variantDuration(spec.feats.length)}
          fps={30}
          width={1080}
          height={1920}
        />
      ))}
      <Composition
        id="PromoHeroVO"
        component={HeroVO}
        durationInFrames={HERO_VO_DURATION}
        fps={30}
        width={1080}
        height={1920}
      />
      <Composition
        id="PromoHeroVOCaptioned"
        component={HeroVOCaptioned}
        durationInFrames={HERO_VO_DURATION}
        fps={30}
        width={1080}
        height={1920}
      />
      {FEED_FORMATS.map((fmt) => (
        <Composition
          key={`Promo${fmt.suffix}`}
          id={`Promo${fmt.suffix}`}
          component={variantComponent(VARIANTS[0])}
          durationInFrames={variantDuration(VARIANTS[0].feats.length)}
          fps={30}
          width={fmt.width}
          height={fmt.height}
        />
      ))}
      {/* Product demo — real screen capture of the app, driven by Maestro.
          Source cut: marketing/demo-video/out/screen.mp4 */}
      <Composition
        id="DemoMaster"
        component={DemoMaster}
        durationInFrames={DEMO_DURATION}
        fps={30}
        width={1920}
        height={1080}
      />
      <Composition
        id="DemoShort"
        component={DemoShort}
        durationInFrames={SHORT_DURATION}
        fps={30}
        width={1080}
        height={1920}
      />
      {AD_CUTS.map((spec) => (
        <Composition
          key={spec.id}
          id={spec.id}
          component={adComponent(spec)}
          durationInFrames={adDuration(spec.feats.length)}
          fps={30}
          width={1080}
          height={1920}
        />
      ))}
      {FEED_FORMATS.map((fmt) => (
        <Composition
          key={`AdHero${fmt.suffix}`}
          id={`AdHero${fmt.suffix}`}
          component={adComponent(AD_CUTS[0])}
          durationInFrames={adDuration(AD_CUTS[0].feats.length)}
          fps={30}
          width={fmt.width}
          height={fmt.height}
        />
      ))}
    </>
  );
};
