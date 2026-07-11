# Enhancement Roadmap (approved 2026-07-11)

Source: enhancement brainstorm approved by Brett on 2026-07-11 — sticky
(brings users back), useful (real utility), and value-first premium pull
(never salesy). Status marks track what's shipped; evolving detail lives in
the persistent-memory pickup notes (`enhancement-sprint-v1-0-4`).

**Design principles (from ux-redesign-proposal.md):** Today is the loop; no
streak guilt; ≤2 notifications/day; jargon budget ~2 concepts; milestones
only fill, never drain; identity framing ("votes for who you're becoming").

Legend: ✅ built (v1.0.4 candidate, commits 9f54168 / 85c60b5 / 8345490) ·
▢ not started

## Tier 1 — Highest leverage

- ✅ **1. Sunday Weekly Review ritual** — free 3-minute coach conversation
  (`"weekly"` periodType); never counts against the 10 free check-ins, so the
  coach habit itself is never gated. Entry: Coach-tab card + link on Today's
  weekly recap card.
- ✅ **2. Coach memory** (premium) — digest of the last 2 saved sessions
  injected into the reflection prompt; the feature that makes "unlimited
  check-ins" mean something ("a coach that knows you").
- ▢ **3. Home-screen + lock-screen widget** — today ring + next action;
  interactive logging via App Intents. Biggest remaining stickiness lever;
  needs an iOS widget extension (expo-apple-targets + local builds).
- ▢ **4. Monthly "Identity Wrapped" share card** — "47 votes for Consistent
  Morning Mover · 87%"; native share sheet; December year-in-review premium
  version. Recap math exists; render via styled view + react-native-view-shot.
- ✅ **5. Milestone deadline countdown** — optional target date (preset
  chips 3w/1m/2m/3m) + gentle countdown chip; no red urgency states.

## Tier 2 — Utility moat

- ✅ **6. One-line "how it went" completion note** — optional, skippable;
  shows on Today + Journey day detail; last 7 days feed the coach so it can
  quote the user's own words.
- ▢ **7. Insights panel** (premium) — day-of-week heatmap (bestDay), 7-day
  momentum sparkline, per-milestone trend (revive computeBenchmarkProgress).
  Free tier sees one insight; premium sees all.
- ✅ **8. "Mark all done ✓" on the daily reminder** — notification action,
  no app open needed; credits the notification's fire date.
- ▢ **9. Siri / App Intents voice logging** — build together with #3.
- ▢ **10. Apple Health auto-complete** — park until widgets prove out the
  native-extension workflow.

## Tier 3 — Natural premium pull (endow first, gate second)

- ▢ **11. Post-milestone "next milestone" proposal** — coach generates the
  actual next milestone, fully visible; "Add" is the paywall moment.
- ▢ **12. Second-persona invitation** — one quiet card after ~30 days of
  sustained consistency; never more than once a month.
- ▢ **13. 7-day free trial on yearly** — StoreKit intro offer; ASC config
  only, can be set up as soon as the subscriptions are Approved.
- ✅ **14. Streak shield visibility** — "shield ready" marker on the Today
  streak chip before it's needed (partial: premium 2-shield variant not
  built).

## Tier 4 — Streamlining

- ✅ Persist onboarding chat (interruption-proof interview)
- ✅ Benchmark → Milestone rename (editor + paywall table + profile stats)
- ✅ App Store ratings prompt at the 3rd day-complete (expo-store-review)
- ✅ Completed rows stay visible under the day-complete card (bug found in
  live sim testing)
- ▢ Real SSE for `/api/reflection` (client currently simulates streaming)
- ▢ Contextual paywall card at the 10/10 coach gate (from
  ux-optimization-plan next wave)
- ▢ Website social-proof strip + aggregateRating schema once App Store
  ratings accumulate

## Suggested sequence from here

1. Ship the ✅ set as **v1.0.4** once the v1.0.2 subscriptions are Approved
   and the paywall is verified live (never submit a binary while they are
   still in review).
2. Same day as approval: configure **#13 intro offer** in ASC.
3. Next build cycle: **#3 widget + #9 App Intents** together.
4. Then growth: **#4 Wrapped card**, **#11 next-milestone proposal**,
   **#7 insights panel**.
