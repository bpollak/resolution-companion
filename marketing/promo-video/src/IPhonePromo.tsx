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

// Real-device promo: Brett's four iPhone screen recordings, stitched and
// speed-ramped by marketing/demo-video/build-iphone.sh into one screen video,
// framed here in the brand phone bezel with a title in and a CTA card out.
export const FPS = 30;

const SCREEN = "iphone-screen.mp4";
const SCREEN_ASPECT = 1080 / 2190; // the cropped capture's ratio (status bar removed)
const SCREEN_SECONDS = 51.83;

const TITLE_SECONDS = 2.2; // hold on the title before the phone takes over
const CARD_SECONDS = 3.5; // the CTA outro
const FADE = 16;

export const IPHONE_DURATION = Math.floor((SCREEN_SECONDS + CARD_SECONDS) * FPS);

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

/** Opening title, fades out as the phone rises. */
const TitleCard: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const enter = spring({ frame, fps, config: { damping: 200, stiffness: 90 } });
  const out = interpolate(frame, [TITLE_SECONDS * FPS - FADE, TITLE_SECONDS * FPS], [1, 0], {
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

export const IPhonePromo: React.FC = () => {
  const { height } = useVideoConfig();
  const frame = useCurrentFrame();
  // Phone rises in after the title, cross-fades to the CTA at the end.
  const rise = spring({ frame: frame - TITLE_SECONDS * FPS + 10, fps: FPS, config: { damping: 200, stiffness: 80 } });
  const phoneOpacity = interpolate(frame, [0, TITLE_SECONDS * FPS - FADE, TITLE_SECONDS * FPS], [0, 0, 1], {
    extrapolateRight: "clamp",
  });
  return (
    <AbsoluteFill style={{ backgroundColor: BG }}>
      <Glows />
      <TitleCard />
      <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", opacity: phoneOpacity }}>
        <div style={{ transform: `translateY(${(1 - rise) * 120}px)` }}>
          <Phone height={height * 0.8} />
        </div>
      </AbsoluteFill>
      <div style={{ position: "absolute", left: 60, bottom: 54, opacity: phoneOpacity }}>
        <Wordmark />
      </div>
      {/* CTA outro fades in over the tail of the footage. */}
      <Sequence from={Math.floor(SCREEN_SECONDS * FPS) - FADE}>
        <CardFade />
      </Sequence>
    </AbsoluteFill>
  );
};

const CardFade: React.FC = () => {
  const frame = useCurrentFrame();
  const opacity = interpolate(frame, [0, FADE], [0, 1], { extrapolateRight: "clamp" });
  return (
    <AbsoluteFill style={{ opacity, backgroundColor: BG }}>
      <Glows />
      <CTA />
    </AbsoluteFill>
  );
};
