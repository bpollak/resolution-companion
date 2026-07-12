import React from "react";
import {
  AbsoluteFill,
  Img,
  interpolate,
  spring,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";

// ─── Brand ───────────────────────────────────────────────────────────────
export const BG = "#0f0f1a";
export const CYAN = "#00D9FF";
export const PURPLE = "#8B5CF6";
export const PINK = "#F472B6";
export const TEXT_DIM = "#c8c8d4";
export const FONT = "Helvetica, Arial, sans-serif";

export const GRADIENT: React.CSSProperties = {
  backgroundImage: `linear-gradient(90deg, ${CYAN}, ${PURPLE}, ${PINK})`,
  WebkitBackgroundClip: "text",
  backgroundClip: "text",
  color: "transparent",
};

// Responsive scaling so the same scenes work at 9:16, 4:5, and 1:1.
// ts scales type/chrome; captionTop clears the platform top-overlay zone;
// phoneTop sits below the caption block in every format.
export const useScale = () => {
  const { height } = useVideoConfig();
  const ts = interpolate(height, [1080, 1920], [0.74, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const captionTop = height * 0.095;
  const phoneTopFrac = interpolate(height, [1080, 1920], [0.33, 0.3], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  return { ts, captionTop, phoneTop: height * phoneTopFrac };
};

// Ambient corner glows matching the website/social card
export const Glows: React.FC = () => (
  <>
    <div
      style={{
        position: "absolute",
        width: 900,
        height: 900,
        borderRadius: "50%",
        background: PURPLE,
        opacity: 0.16,
        filter: "blur(180px)",
        top: -300,
        right: -300,
      }}
    />
    <div
      style={{
        position: "absolute",
        width: 800,
        height: 800,
        borderRadius: "50%",
        background: CYAN,
        opacity: 0.12,
        filter: "blur(180px)",
        bottom: -250,
        left: -250,
      }}
    />
  </>
);

// ─── Reusable pieces ─────────────────────────────────────────────────────
export const PhoneShot: React.FC<{
  src: string;
  enterFrame?: number;
  tilt?: number;
  panFrom?: number;
  panTo?: number;
}> = ({ src, enterFrame = 0, tilt = 0, panFrom = 0, panTo = -40 }) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const { ts } = useScale();
  const enter = spring({
    frame: frame - enterFrame,
    fps,
    config: { damping: 200, stiffness: 80 },
  });
  const pan = interpolate(frame, [0, durationInFrames], [panFrom, panTo]);
  return (
    <div
      style={{
        transform: `translateY(${(1 - enter) * 400 + pan}px) rotate(${tilt}deg)`,
        opacity: enter,
        borderRadius: 64 * ts,
        border: "3px solid rgba(120,120,160,0.55)",
        background: "#08080e",
        padding: 14 * ts,
        boxShadow: "0 60px 120px rgba(0,0,0,0.65)",
      }}
    >
      <Img
        src={staticFile(src)}
        style={{
          width: 640 * ts,
          borderRadius: 50 * ts,
          display: "block",
        }}
      />
    </div>
  );
};

export const Caption: React.FC<{
  kicker?: string;
  title: string;
  gradientWord?: string;
  sub?: string;
  enterFrame?: number;
}> = ({ kicker, title, gradientWord, sub, enterFrame = 8 }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const { ts, captionTop } = useScale();
  const enter = spring({
    frame: frame - enterFrame,
    fps,
    config: { damping: 200, stiffness: 90 },
  });
  return (
    <div
      style={{
        position: "absolute",
        top: captionTop,
        left: 70,
        right: 70,
        textAlign: "center",
        transform: `translateY(${(1 - enter) * -60}px)`,
        opacity: enter,
        fontFamily: FONT,
      }}
    >
      {kicker ? (
        <div
          style={{
            color: CYAN,
            fontSize: 34 * ts,
            fontWeight: 700,
            letterSpacing: 8 * ts,
            textTransform: "uppercase",
            marginBottom: 24 * ts,
          }}
        >
          {kicker}
        </div>
      ) : null}
      <div
        style={{
          fontSize: 76 * ts,
          fontWeight: 800,
          color: "white",
          lineHeight: 1.12,
        }}
      >
        {title}{" "}
        {gradientWord ? <span style={GRADIENT}>{gradientWord}</span> : null}
      </div>
      {sub ? (
        <div
          style={{
            marginTop: 26 * ts,
            fontSize: 40 * ts,
            color: TEXT_DIM,
            lineHeight: 1.35,
          }}
        >
          {sub}
        </div>
      ) : null}
    </div>
  );
};

export const FadeInOut: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const opacity = interpolate(
    frame,
    [0, 12, durationInFrames - 12, durationInFrames],
    [0, 1, 1, 0],
  );
  return <AbsoluteFill style={{ opacity }}>{children}</AbsoluteFill>;
};

// ─── Scenes ──────────────────────────────────────────────────────────────
export const Hook: React.FC<{
  line1: string;
  line2: string;
  fontSize?: number;
}> = ({ line1, line2, fontSize = 108 }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const { ts } = useScale();
  const l1 = spring({ frame, fps, config: { damping: 200, stiffness: 90 } });
  const l2 = spring({
    frame: frame - 32,
    fps,
    config: { damping: 200, stiffness: 90 },
  });
  return (
    <AbsoluteFill
      style={{
        justifyContent: "center",
        alignItems: "center",
        fontFamily: FONT,
        padding: 90 * ts,
      }}
    >
      <div
        style={{
          fontSize: fontSize * ts,
          fontWeight: 800,
          color: "white",
          textAlign: "center",
          lineHeight: 1.15,
          opacity: l1,
          transform: `translateY(${(1 - l1) * 60}px)`,
        }}
      >
        {line1}
      </div>
      <div
        style={{
          fontSize: fontSize * ts,
          fontWeight: 800,
          textAlign: "center",
          lineHeight: 1.15,
          marginTop: 20 * ts,
          opacity: l2,
          transform: `translateY(${(1 - l2) * 60}px)`,
          ...GRADIENT,
        }}
      >
        {line2}
      </div>
    </AbsoluteFill>
  );
};

export const FeatureScene: React.FC<{
  src: string;
  kicker: string;
  title: string;
  gradientWord?: string;
  sub: string;
  tilt?: number;
}> = ({ src, kicker, title, gradientWord, sub, tilt = 0 }) => {
  const { phoneTop } = useScale();
  return (
    <AbsoluteFill style={{ alignItems: "center" }}>
      <Caption kicker={kicker} title={title} gradientWord={gradientWord} sub={sub} />
      <div
        style={{
          position: "absolute",
          top: phoneTop,
          display: "flex",
          justifyContent: "center",
          width: "100%",
        }}
      >
        <PhoneShot src={src} enterFrame={4} tilt={tilt} />
      </div>
    </AbsoluteFill>
  );
};

export const CTA: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const { ts } = useScale();
  const logo = spring({ frame, fps, config: { damping: 14, stiffness: 120 } });
  const text = spring({ frame: frame - 15, fps, config: { damping: 200, stiffness: 90 } });
  const badge = spring({ frame: frame - 30, fps, config: { damping: 200, stiffness: 90 } });
  return (
    <AbsoluteFill
      style={{ justifyContent: "center", alignItems: "center", fontFamily: FONT }}
    >
      <Img
        src={staticFile("app-logo.png")}
        style={{
          width: 300 * ts,
          borderRadius: 70 * ts,
          transform: `scale(${logo})`,
          boxShadow: `0 0 140px rgba(0,217,255,0.45)`,
        }}
      />
      <div
        style={{
          marginTop: 70 * ts,
          fontSize: 74 * ts,
          fontWeight: 800,
          color: "white",
          opacity: text,
          transform: `translateY(${(1 - text) * 40}px)`,
        }}
      >
        Resolution Companion
      </div>
      <div
        style={{
          marginTop: 22 * ts,
          fontSize: 42 * ts,
          color: TEXT_DIM,
          opacity: text,
          transform: `translateY(${(1 - text) * 40}px)`,
        }}
      >
        Any day can be day one.
      </div>
      <div
        style={{
          marginTop: 80 * ts,
          opacity: badge,
          transform: `translateY(${(1 - badge) * 40}px)`,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 30 * ts,
        }}
      >
        <Img src={staticFile("appstore-badge.svg")} style={{ width: 420 * ts }} />
        <div style={{ fontSize: 36 * ts, color: TEXT_DIM }}>
          Free forever. No credit card required.
        </div>
      </div>
    </AbsoluteFill>
  );
};
