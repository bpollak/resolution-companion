# Promo videos — Mid-Year Reset campaign

Remotion project that renders the social videos for the Mid-Year Reset
campaign (`../mid-year-reset/`). Six scripts — a half-time hero plus video
versions of the five campaign short-video scripts — over the brand look
(dark #0f0f1a, cyan→purple→pink gradient, real app screenshots in a phone
bezel), closing on the App Store badge and the "Any day can be day one."
tagline.

## Render

```bash
npm install
# one video
npx remotion render src/index.ts Promo out/halftime-hero-916.mp4 --codec=h264
# everything (6 scripts @ 9:16 + hero @ 4:5 and 1:1)
for pair in "Promo:halftime-hero-916" "PromoSetup:why-it-failed-916" \
  "PromoIdentity:become-someone-916" "PromoZeroDays:zero-days-916" \
  "PromoCoach:ai-coach-skeptic-916" "PromoDayOne:any-day-day-one-916" \
  "Promo-45:halftime-hero-45" "Promo-11:halftime-hero-11"; do
  npx remotion render src/index.ts "${pair%%:*}" "out/${pair##*:}.mp4" --codec=h264
done
# live preview / tweak copy
npx remotion studio src/index.ts
```

## Structure

- `src/shared.tsx` — brand constants + scene components (Hook, FeatureScene,
  PhoneShot, Caption, CTA). Layout scales off composition height via
  `useScale()`, so the same scenes render at 9:16, 4:5, and 1:1; captions sit
  inside the cross-platform safe zone (~900×1400 centered in 1080×1920).
- `src/variants.tsx` — the six scripts as data (`VARIANTS`): hook lines +
  per-scene kicker/title/sub copy. Edit copy here; timing constants
  (hook 4.5s, feature 5.3s, CTA 3.5s @30fps) at the top.
- `src/Root.tsx` — registers each script at 1080×1920 plus the hero at
  1080×1350 (`Promo-45`) and 1080×1080 (`Promo-11`).
- `public/` — app screenshots (from the App Store set), logo, badge.

## Posting notes

Videos are intentionally silent — add a trending sound in each platform's
editor at post time (better distribution than baked-in audio). 1080×1920
9:16 H.264 MP4 @30fps is the recommended spec for TikTok, IG Reels, FB
Reels, and YouTube Shorts; 4:5 and 1:1 are for IG/FB feed placements.
Captions per script live in `../mid-year-reset/video-scripts.md` (swap
"link in bio" for the App Store link: apps.apple.com/app/id6757996708).
