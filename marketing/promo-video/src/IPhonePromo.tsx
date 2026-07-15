import React from "react";
import {
  AbsoluteFill,
  Img,
  OffthreadVideo,
  Sequence,
  interpolate,
  spring,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { BG, CTA, CYAN, FONT, GRADIENT, Glows, TEXT_DIM } from "./shared";
import {
  Chapter,
  IPHONE_CHAPTERS,
  IPHONE_MASTER_SECONDS,
  IPHONE_SHORT_CHAPTERS,
  IPHONE_SHORT_SECONDS,
} from "./iphone-chapters";

// Real-device promo: Brett's four iPhone screen recordings, stitched and
// speed-ramped by marketing/demo-video/build-iphone*.sh, framed here.
// AI responses in the footage are deliberately kept slow enough to read.
// Four cuts: vertical master + social, and landscape (side-caption) master +
// social — the "features alongside the phone" layout.
export const FPS = 30;

const MASTER_SCREEN = "iphone-screen.mp4";
const SHORT_SCREEN = "iphone-screen-short.mp4";
const SCREEN_ASPECT = 1080 / 2190; // the cropped capture's ratio (status bar removed)

const FADE = 16; // crossfade length, frames
const TITLE_FRAMES = Math.round(2.0 * FPS);
const CARD_FRAMES = Math.round(3.5 * FPS);

const frames = (sec: number) => Math.round(sec * FPS);

// ── Durations, exported for Root.tsx ───────────────────────────────────────
// Vertical: title -> phone -> CTA. Wide: phone+caption -> CTA (no title, like DemoMaster).
export const IPHONE_DURATION = TITLE_FRAMES - FADE + frames(IPHONE_MASTER_SECONDS) + CARD_FRAMES;
export const IPHONE_SHORT_DURATION = TITLE_FRAMES - FADE + frames(IPHONE_SHORT_SECONDS) + CARD_FRAMES;
export const IPHONE_WIDE_DURATION = frames(IPHONE_MASTER_SECONDS) + CARD_FRAMES;
export const IPHONE_WIDE_SHORT_DURATION = frames(IPHONE_SHORT_SECONDS) + CARD_FRAMES;

/** The phone. The capture is the device screen only, so we add the bezel. */
const Phone: React.FC<{ height: number; src: string }> = ({ height, src }) => {
  const w = height * SCREEN_ASPECT;
  const pad = height * 0.011;
  return (
    <div
      style={{
        width: w + pad * 2,
        height: height + pad * 2,
        padding: pad,
        borderRadius: height * 0.056,
        background: "#08080e",
        border: "2px solid rgba(130,130,170,0.5)",
        boxShadow: "0 50px 110px rgba(0,0,0,0.65), 0 0 90px rgba(0,217,255,0.10)",
        flex: "none",
      }}
    >
      <OffthreadVideo
        src={staticFile(src)}
        style={{ width: "100%", height: "100%", objectFit: "cover", borderRadius: height * 0.046, display: "block" }}
      />
    </div>
  );
};

const Wordmark: React.FC<{ scale?: number }> = ({ scale = 1 }) => (
  <div style={{ display: "flex", alignItems: "center", gap: 18 * scale, fontFamily: FONT }}>
    <Img src={staticFile("app-logo.png")} style={{ width: 56 * scale, borderRadius: 13 * scale }} />
    <div>
      <div style={{ fontSize: 28 * scale, fontWeight: 700, color: "white" }}>Resolution Companion</div>
      <div style={{ fontSize: 21 * scale, color: TEXT_DIM }}>Free on the App Store</div>
    </div>
  </div>
);

// ── Vertical cut (title -> phone -> CTA) ───────────────────────────────────
const TitleCard: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const enter = spring({ frame, fps, config: { damping: 200, stiffness: 90 } });
  const out = interpolate(frame, [TITLE_FRAMES - FADE, TITLE_FRAMES], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  return (
    <AbsoluteFill
      style={{
        justifyContent: "center",
        alignItems: "center",
        fontFamily: FONT,
        padding: 90,
        opacity: enter * out,
        transform: `translateY(${(1 - enter) * 40}px)`,
      }}
    >
      <div style={{ fontSize: 92, fontWeight: 800, color: "white", textAlign: "center", lineHeight: 1.1 }}>
        Don't set a goal.
      </div>
      <div style={{ fontSize: 92, fontWeight: 800, textAlign: "center", lineHeight: 1.1, marginTop: 14, ...GRADIENT }}>
        Become someone.
      </div>
      <div style={{ fontSize: 40, color: TEXT_DIM, marginTop: 40, textAlign: "center" }}>
        A real look at Resolution Companion.
      </div>
    </AbsoluteFill>
  );
};

const PhoneScene: React.FC<{ src: string }> = ({ src }) => {
  const frame = useCurrentFrame();
  const { height } = useVideoConfig();
  const rise = spring({ frame, fps: FPS, config: { damping: 200, stiffness: 80 } });
  const fadeIn = interpolate(frame, [0, FADE], [0, 1], { extrapolateRight: "clamp" });
  return (
    <AbsoluteFill style={{ opacity: fadeIn }}>
      <AbsoluteFill style={{ alignItems: "center", justifyContent: "center" }}>
        <div style={{ transform: `translateY(${(1 - rise) * 120}px)` }}>
          <Phone height={height * 0.8} src={src} />
        </div>
      </AbsoluteFill>
      <div style={{ position: "absolute", left: 60, bottom: 54 }}>
        <Wordmark />
      </div>
    </AbsoluteFill>
  );
};

const CardScene: React.FC = () => {
  const frame = useCurrentFrame();
  const opacity = interpolate(frame, [0, FADE], [0, 1], { extrapolateRight: "clamp" });
  return (
    <AbsoluteFill style={{ opacity, backgroundColor: BG }}>
      <Glows />
      <CTA />
    </AbsoluteFill>
  );
};

const VerticalPromo: React.FC<{ src: string; screenSeconds: number }> = ({ src, screenSeconds }) => {
  const phoneStart = TITLE_FRAMES - FADE;
  const ctaStart = phoneStart + frames(screenSeconds) - FADE;
  return (
    <AbsoluteFill style={{ backgroundColor: BG }}>
      <Glows />
      <Sequence durationInFrames={TITLE_FRAMES} name="Title">
        <TitleCard />
      </Sequence>
      <Sequence from={phoneStart} name="Phone">
        <PhoneScene src={src} />
      </Sequence>
      <Sequence from={ctaStart} name="CTA">
        <CardScene />
      </Sequence>
    </AbsoluteFill>
  );
};

// ── Landscape cut (phone left, feature caption right — the DemoMaster layout) ─
const chapterAt = (sec: number, list: Chapter[]) => {
  let cur = list[0];
  for (const c of list) if (sec >= c.at) cur = c;
  return cur;
};

const SideCaption: React.FC<{ list: Chapter[] }> = ({ list }) => {
  const frame = useCurrentFrame();
  const sec = frame / FPS;
  const c = chapterAt(sec, list);
  const since = (sec - c.at) * FPS;
  const enter = spring({ frame: since, fps: FPS, config: { damping: 200, stiffness: 90 } });
  const next = list.find((x) => x.at > c.at);
  const out = next
    ? interpolate(sec, [next.at - 0.5, next.at], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" })
    : 1;
  return (
    <div style={{ fontFamily: FONT, opacity: enter * out, transform: `translateY(${(1 - enter) * 26}px)`, maxWidth: 760 }}>
      <div
        style={{
          color: CYAN,
          fontSize: 26,
          fontWeight: 700,
          letterSpacing: 6,
          textTransform: "uppercase",
          marginBottom: 20,
        }}
      >
        {c.kicker}
      </div>
      <div style={{ fontSize: 66, fontWeight: 800, color: "white", lineHeight: 1.14, letterSpacing: -0.5 }}>
        {c.line} {c.accent ? <span style={GRADIENT}>{c.accent}</span> : null}
      </div>
    </div>
  );
};

const WidePromo: React.FC<{ src: string; screenSeconds: number; chapters: Chapter[] }> = ({
  src,
  screenSeconds,
  chapters,
}) => {
  const { height } = useVideoConfig();
  const ctaStart = frames(screenSeconds) - FADE;
  return (
    <AbsoluteFill style={{ backgroundColor: BG }}>
      <Glows />
      <AbsoluteFill
        style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 96, padding: "0 90px" }}
      >
        <Phone height={height * 0.86} src={src} />
        <div style={{ flex: 1, maxWidth: 780 }}>
          <SideCaption list={chapters} />
        </div>
      </AbsoluteFill>
      <div style={{ position: "absolute", left: 90, bottom: 46 }}>
        <Wordmark />
      </div>
      <Sequence from={ctaStart} name="CTA">
        <CardScene />
      </Sequence>
    </AbsoluteFill>
  );
};

// ── Exported compositions ──────────────────────────────────────────────────
export const IPhonePromo: React.FC = () => <VerticalPromo src={MASTER_SCREEN} screenSeconds={IPHONE_MASTER_SECONDS} />;
export const IPhonePromoShort: React.FC = () => (
  <VerticalPromo src={SHORT_SCREEN} screenSeconds={IPHONE_SHORT_SECONDS} />
);
export const IPhoneWideMaster: React.FC = () => (
  <WidePromo src={MASTER_SCREEN} screenSeconds={IPHONE_MASTER_SECONDS} chapters={IPHONE_CHAPTERS} />
);
export const IPhoneWideShort: React.FC = () => (
  <WidePromo src={SHORT_SCREEN} screenSeconds={IPHONE_SHORT_SECONDS} chapters={IPHONE_SHORT_CHAPTERS} />
);
