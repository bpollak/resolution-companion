import React from "react";
import {
  AbsoluteFill,
  Img,
  OffthreadVideo,
  interpolate,
  spring,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { BG, CYAN, FONT, GRADIENT, Glows, TEXT_DIM } from "./shared";

export const FPS = 30;
export const DEMO_SECONDS = 100.77;
export const DEMO_DURATION = Math.floor(DEMO_SECONDS * FPS);
export const SHORT_SECONDS = 37.33;
export const SHORT_DURATION = Math.floor(SHORT_SECONDS * FPS);

/**
 * Chapter captions, timed to out/segments.json in marketing/demo-video.
 * They label what the viewer is looking at — they are NOT the voiceover.
 * The VO script (VO-SCRIPT.md) is written to be read *over* these.
 */
interface Chapter {
  at: number; // seconds
  kicker: string;
  line: string;
  accent?: string; // the word that gets the gradient
}

const CHAPTERS: Chapter[] = [
  { at: 0, kicker: "The premise", line: "Don't set a goal.", accent: "Become someone." },
  { at: 12.1, kicker: "Two minutes", line: "An AI coach asks who you're", accent: "becoming." },
  { at: 30.6, kicker: "Your plan, built", line: "Milestones and small daily", accent: "actions." },
  { at: 43.8, kicker: "The daily loop", line: "Every action is a", accent: "vote." },
  { at: 55.6, kicker: "21 days", line: "Not a plan anymore. A", accent: "habit." },
  { at: 63.2, kicker: "The payoff", line: "Finish the day, and it", accent: "says so." },
  { at: 77.8, kicker: "No guilt", line: "A missed day never", accent: "erases you." },
  { at: 89.8, kicker: "It remembers", line: "A coach that reads your", accent: "notes." },
];

/** The short is a different edit, so it needs its own beat map. */
const SHORT_CHAPTERS: Chapter[] = [
  { at: 0, kicker: "The premise", line: "Don't set a goal.", accent: "Become someone." },
  { at: 3.5, kicker: "Two minutes", line: "Tell an AI coach who you want to", accent: "be." },
  { at: 11, kicker: "Your plan, built", line: "It writes the", accent: "milestones." },
  { at: 17.5, kicker: "The daily loop", line: "Every action is a", accent: "vote." },
  { at: 21.5, kicker: "21 days", line: "Not a plan. A", accent: "habit." },
  { at: 25.5, kicker: "The payoff", line: "Finish the day, and it", accent: "says so." },
  { at: 30.5, kicker: "No guilt", line: "A missed day never", accent: "erases you." },
  { at: 34.5, kicker: "It remembers", line: "A coach in your", accent: "corner." },
];

const chapterAt = (sec: number, list: Chapter[] = CHAPTERS) => {
  let cur = list[0];
  for (const c of list) if (sec >= c.at) cur = c;
  return cur;
};

/** The phone. The raw capture is the device screen only, so we add the bezel. */
const Phone: React.FC<{ height: number; src?: string }> = ({ height, src = "demo-screen.mp4" }) => {
  const w = height * (720 / 1566); // the recorded screen's aspect
  const pad = height * 0.012;
  return (
    <div
      style={{
        width: w + pad * 2,
        height: height + pad * 2,
        padding: pad,
        borderRadius: height * 0.058,
        background: "#08080e",
        border: "2px solid rgba(130,130,170,0.5)",
        boxShadow: "0 50px 110px rgba(0,0,0,0.65), 0 0 90px rgba(0,217,255,0.10)",
        flex: "none",
      }}
    >
      <OffthreadVideo
        src={staticFile(src)}
        style={{
          width: "100%",
          height: "100%",
          objectFit: "cover",
          borderRadius: height * 0.048,
          display: "block",
        }}
      />
    </div>
  );
};

/** Chapter text — crossfades on each change instead of hard-cutting. */
const Caption: React.FC<{ align?: "left" | "center"; scale?: number; list?: Chapter[] }> = ({
  align = "left",
  scale = 1,
  list = CHAPTERS,
}) => {
  const frame = useCurrentFrame();
  const sec = frame / FPS;
  const c = chapterAt(sec, list);
  const since = (sec - c.at) * FPS;
  const enter = spring({ frame: since, fps: FPS, config: { damping: 200, stiffness: 90 } });
  // fade out just before the next chapter lands
  const next = list.find((x) => x.at > c.at);
  const out = next
    ? interpolate(sec, [next.at - 0.5, next.at], [1, 0], {
        extrapolateLeft: "clamp",
        extrapolateRight: "clamp",
      })
    : 1;

  return (
    <div
      style={{
        fontFamily: FONT,
        opacity: enter * out,
        transform: `translateY(${(1 - enter) * 26}px)`,
        textAlign: align,
        maxWidth: 720 * scale,
      }}
    >
      <div
        style={{
          color: CYAN,
          fontSize: 24 * scale,
          fontWeight: 700,
          letterSpacing: 6 * scale,
          textTransform: "uppercase",
          marginBottom: 18 * scale,
        }}
      >
        {c.kicker}
      </div>
      <div
        style={{
          fontSize: 60 * scale,
          fontWeight: 800,
          color: "white",
          lineHeight: 1.15,
          letterSpacing: -0.5,
        }}
      >
        {c.line} {c.accent ? <span style={GRADIENT}>{c.accent}</span> : null}
      </div>
    </div>
  );
};

const Wordmark: React.FC<{ scale?: number }> = ({ scale = 1 }) => (
  <div style={{ display: "flex", alignItems: "center", gap: 14 * scale, fontFamily: FONT }}>
    <Img
      src={staticFile("app-logo.png")}
      style={{ width: 44 * scale, borderRadius: 10 * scale }}
    />
    <div>
      <div style={{ fontSize: 20 * scale, fontWeight: 700, color: "white" }}>
        Resolution Companion
      </div>
      <div style={{ fontSize: 15 * scale, color: TEXT_DIM }}>Free on the App Store</div>
    </div>
  </div>
);

/** 16:9 master — phone left, chapter text right. For the website and YouTube. */
export const DemoMaster: React.FC = () => {
  const { height } = useVideoConfig();
  return (
    <AbsoluteFill style={{ backgroundColor: BG }}>
      <Glows />
      <AbsoluteFill
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "center",
          gap: 96,
          padding: "0 90px",
        }}
      >
        <Phone height={height * 0.86} />
        <div style={{ flex: 1, maxWidth: 760 }}>
          <Caption />
        </div>
      </AbsoluteFill>
      <div style={{ position: "absolute", left: 90, bottom: 46 }}>
        <Wordmark />
      </div>
    </AbsoluteFill>
  );
};

/** 9:16 short — full-bleed phone, caption over the top. For Reels/TikTok/Shorts. */
export const DemoShort: React.FC = () => {
  const { height } = useVideoConfig();
  return (
    <AbsoluteFill style={{ backgroundColor: BG }}>
      <Glows />
      <AbsoluteFill style={{ alignItems: "center", justifyContent: "flex-end", paddingBottom: 96 }}>
        <Phone height={height * 0.7} src="demo-screen-short.mp4" />
      </AbsoluteFill>
      <div
        style={{
          position: "absolute",
          top: 110,
          left: 60,
          right: 60,
          display: "flex",
          justifyContent: "center",
        }}
      >
        <Caption align="center" scale={0.92} list={SHORT_CHAPTERS} />
      </div>
    </AbsoluteFill>
  );
};
