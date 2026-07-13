# Meta Ads Launch Pack — Mid-Year Reset

*Everything copy-paste ready for Ads Manager. You launch (ad account, payment,
identity are yours); this doc + the rendered creatives do the rest.*

**GATE: launch only after (1) v1.0.4 is live on the App Store and (2) the
7-day free trial intro offer on yearly is active in ASC.** Paid traffic
converting into a free-trial paywall is the whole economics of this campaign.

---

## Campaign structure

One campaign → one ad set → three ads. Don't split audiences at this budget;
let the creatives compete.

| Setting | Value |
|---|---|
| Objective | **App promotion** |
| App | Resolution Companion AI — iOS (App Store id 6757996708) |
| Performance goal | Maximize app installs (switch to app-events/trials later if SKAN data supports it) |
| Budget | **$15/day** (Advantage+ campaign budget) |
| Schedule | Continuous; judge nothing before day 5–7 (learning phase) |
| Placements | **Advantage+ placements** (leave on) |
| Locations | United States |
| Age | 22–55 |
| Detailed targeting | **None — go broad.** The hooks self-select; broad beats interest stacks for app installs |
| Attribution | SKAdNetwork (iOS). Expect modeled/delayed numbers; judge weekly, not daily |

Pre-launch checklist:
- [ ] v1.0.4 live + intro offer active (the gate above)
- [ ] Business Manager + ad account + payment method
- [ ] App registered in Meta Events Manager (SKAdNetwork setup for iOS)
- [ ] Creatives uploaded (files below)

---

## Ad 1 — "Half-time" (hero)

**Video:** `ad-halftime-hero-916.mp4` (~9 s) — add `-11` / `-45` renders for
feed placements if Ads Manager asks for square. Fallback: the 25 s
`halftime-hero-916.mp4` as a second variant to A/B length.

- **Primary text (A):** That resolution you dropped in February isn't dead. It's half-time. An AI coach rebuilds your plan around who you're becoming — tiny daily actions, and every month starts clean.
- **Primary text (B):** Half-time for your 2026 goals. A habit system that survives bad days.
- **Headline (≤40 char):** Restart your resolution today
- **Description:** Free on the App Store.
- **CTA button:** Download

## Ad 2 — "Why it failed" (myth-buster)

**Video:** `ad-why-it-failed-916.mp4` (~9 s)

- **Primary text (A):** Your resolution didn't fail because you're lazy. "Get in shape" is a wish, not a plan — and motivation is gone by week three. Resolution Companion turns who you want to become into small daily actions an AI coach adjusts with you.
- **Primary text (B):** The resolution you dropped in Feb? Restart it. Identity-based habits + an AI coach.
- **Headline:** It wasn't you. It was the setup.
- **Description:** AI habit coach. Free to start.
- **CTA button:** Download

## Ad 3 — "Any day is day one" (fresh start)

**Video:** `ad-any-day-day-one-916.mp4` (~9 s)

- **Primary text (A):** There's nothing special about January 1st. Resolution Companion wipes your consistency score clean every month — bad June, fresh July. Name who you're becoming, do 3 tiny actions a day, and let the streak shield handle bad days.
- **Primary text (B):** Stop chasing goals. Become someone. Any day can be Day One.
- **Headline:** Any day can be day one
- **Description:** Free forever. No credit card.
- **CTA button:** Download

---

## Operating notes

- **Judging:** kill nothing before ~$75 spent per ad. Metrics that matter, in
  order: install rate → trial starts (SKAN) → cost per trial. Thumb-stop rate
  (3-sec views / impressions) tells you if a hook works even before installs.
- **Iterating:** when a winner emerges, spin variants of the WINNING HOOK
  (new first 3 seconds, same body) rather than new concepts. Losing hooks die;
  winning hooks get remixes.
- **Scaling:** raise budget ~20% every 3–4 days, never double overnight
  (resets learning).
- **Refreshing:** expect creative fatigue at 2–4 weeks at this budget; the
  Remotion project renders new variants in minutes (`marketing/promo-video/`,
  copy lives in `src/ads.tsx`).
- **Seasonality:** "half-time" copy expires ~end of August. The any-day-day-one
  angle is evergreen; re-skin the hero for "new year" in December (that's the
  Super Bowl for this app).
