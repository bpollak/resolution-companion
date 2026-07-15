# Speaking script — real-device promo

One narration for all four cuts (same footage). Read it conversationally, like
you're showing a friend the app you built. Timestamps are **footage-relative**
(the vertical cuts play a ~1.5s title card first; the generated `.srt` files
already account for that).

Subtitle files are generated alongside this script:
`marketing/promo-video/subtitles/*.srt` — one per cut, correctly timed. Most
social tools (Instagram, TikTok, YouTube, CapCut) import `.srt` directly, or
burn them in with ffmpeg (`-vf subtitles=NAME.srt`).

Regenerate with `node marketing/demo-video/gen-iphone-vo.mjs`.

## Master (68s of footage)

| Time | Line |
|---|---|
|   0.0s | Most habit apps ask what you want to do. |
|   3.6s | This one asks who you want to become. |
|   6.9s | It's a two-minute chat with an AI coach. |
|   9.4s | You tell it your goal — mine was running my first 5K. |
|  14.1s | And it writes you a real plan. |
|  24.5s | Milestones, and a few small daily actions. |
|  29.4s | Each day, you check off a couple of small things. |
|  32.2s | Finish the day, and it says so. |
|  34.2s | Your progress fills in — and never resets. |
|  36.2s | Shape it your way: milestones, dates, how often. |
|  42.4s | Every week, your coach checks in, |
|  47.3s | and remembers what you did. |
|  53.4s | Then it actually coaches you — |
|  56.5s | adjusting the plan so you don't burn out. |
|  60.7s | Specific, personal, every single week. |
|  65.5s | Not a tracker. Someone in your corner. |
|  end | Resolution Companion — free on the App Store. |

## Social / short (27s of footage)

| Time | Line |
|---|---|
|   0.0s | This app doesn't ask what you want to do. |
|   2.5s | It asks who you want to become. |
|   4.3s | Tell an AI coach your goal, and it builds a real plan. |
|   9.8s | Milestones and small daily actions. |
|  13.5s | Check off your day — |
|  15.4s | and it says so. |
|  17.7s | Each week, your coach checks in. |
|  19.1s | Tell it what's hard, |
|  21.7s | and it adapts the plan to how you're doing. |
|  end | Resolution Companion — free on the App Store. |

## Notes
- The **landscape** cuts already show the feature captions on the right, so
  subtitles there are optional — use them only if a platform expects a caption
  track. The **vertical** cuts have no on-screen text, so subtitles (or your VO)
  carry the message.
- The coach's on-screen replies are live AI; the VO never quotes them verbatim,
  so re-recording against a new take won't break the script.
