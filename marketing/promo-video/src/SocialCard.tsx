import React from "react";
import { AbsoluteFill, Img, staticFile } from "remotion";
import { BG, FONT, GRADIENT, Glows, TEXT_DIM } from "./shared";

// Open Graph / social share card, 1200x630. Rendered to a still PNG:
//   npx remotion still SocialCard out/social-card.png
// then copied to public/assets/website/social-card.png.
export const SocialCard: React.FC = () => {
  return (
    <AbsoluteFill style={{ backgroundColor: BG, fontFamily: FONT }}>
      <Glows />
      <AbsoluteFill style={{ padding: 76, justifyContent: "space-between" }}>
        {/* Brand lockup */}
        <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
          <Img src={staticFile("app-logo.png")} style={{ width: 76, height: 76, borderRadius: 18 }} />
          <div style={{ fontSize: 34, fontWeight: 700, color: "white", letterSpacing: -0.3 }}>
            Resolution Companion
          </div>
        </div>

        {/* Headline */}
        <div style={{ maxWidth: 1000 }}>
          <div style={{ fontSize: 82, fontWeight: 800, color: "white", lineHeight: 1.06, letterSpacing: -1.5 }}>
            It's never too late to
          </div>
          <div style={{ fontSize: 82, fontWeight: 800, lineHeight: 1.06, letterSpacing: -1.5, ...GRADIENT }}>
            restart your resolution.
          </div>
          <div style={{ fontSize: 30, color: TEXT_DIM, marginTop: 26, lineHeight: 1.35, maxWidth: 880 }}>
            An AI coach, small daily actions, and a plan built around who you're becoming.
          </div>
        </div>

        {/* Footer */}
        <div style={{ display: "flex", alignItems: "baseline", gap: 16 }}>
          <div style={{ fontSize: 27, fontWeight: 700, ...GRADIENT }}>Any day can be day one.</div>
          <div style={{ fontSize: 24, color: TEXT_DIM }}>· Free on the App Store</div>
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
