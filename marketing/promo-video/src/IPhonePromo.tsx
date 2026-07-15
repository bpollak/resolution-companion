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
import { BG, CTA, FONT, GRADIENT, Glows, TEXT_DIM } from "./shared";

// Real-device promo: Brett's four iPhone screen recordings, stitched and
// speed-ramped by marketing/demo-video/build-iphone.sh into one screen video,
// framed here in the brand phone bezel with a title in and a CTA card out.
// AI responses in the footage are deliberately kept slow enough to read.
export const FPS = 30;

const SCREEN = "iphone-screen.mp4";
const SCREEN_ASPECT = 1080 / 2190; // the cropped capture's ratio (status bar removed)
const SCREEN_SECONDS = 67.77;

const FADE = 16; // crossfade length, frames
const TITLE_FRAMES = Math.round(2.0 * FPS);
const SCREEN_FRAMES = Math.round(SCREEN_SECONDS * FPS);
const CARD_FRAMES = Math.round(3.5 * FPS);

// The footage starts as the title fades out (a short overlap), so none of the
// onboarding is wasted behind the title. The CTA fades in over the footage tail.
const PHONE_START = TITLE_FRAMES - FADE;
const CTA_START = PHONE_START + SCREEN_FRAMES - FADE;
export const IPHONE_DURATION = CTA_START + CARD_FRAMES;

/** The phone. The capture is the device screen only, so we add the bezel. */
const Phone: React.FC<{ height: number }> = ({ height }) => {
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
        src={staticFile(SCREEN)}
        style={{
          width: "100%",
          height: "100%",
          objectFit: "cover",
          borderRadius: height * 0.046,
          display: "block",
        }}
      />
    </div>
  );
};

/** Opening title (own Sequence), fades out as the phone rises. */
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

const Wordmark: React.FC = () => (
  <div style={{ display: "flex", alignItems: "center", gap: 20, fontFamily: FONT }}>
    <Img src={staticFile("app-logo.png")} style={{ width: 62, borderRadius: 14 }} />
    <div>
      <div style={{ fontSize: 30, fontWeight: 700, color: "white" }}>Resolution Companion</div>
      <div style={{ fontSize: 23, color: TEXT_DIM }}>Free on the App Store</div>
    </div>
  </div>
);

/** The phone section: bezel + footage, rises in and holds. */
const PhoneScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { height } = useVideoConfig();
  const rise = spring({ frame, fps: FPS, config: { damping: 200, stiffness: 80 } });
  const fadeIn = interpolate(frame, [0, FADE], [0, 1], { extrapolateRight: "clamp" });
  return (
    <AbsoluteFill style={{ opacity: fadeIn }}>
      <AbsoluteFill style={{ alignItems: "center", justifyContent: "center" }}>
        <div style={{ transform: `translateY(${(1 - rise) * 120}px)` }}>
          <Phone height={height * 0.8} />
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

export const IPhonePromo: React.FC = () => {
  return (
    <AbsoluteFill style={{ backgroundColor: BG }}>
      <Glows />
      <Sequence durationInFrames={TITLE_FRAMES} name="Title">
        <TitleCard />
      </Sequence>
      <Sequence from={PHONE_START} name="Phone">
        <PhoneScene />
      </Sequence>
      <Sequence from={CTA_START} name="CTA">
        <CardScene />
      </Sequence>
    </AbsoluteFill>
  );
};
