# Enhancement Roadmap (approved 2026-07-11)

Source: enhancement brainstorm approved by Brett on 2026-07-11 — sticky
(brings users back), useful (real utility), and value-first premium pull
(never salesy). Status marks track what's shipped; evolving detail lives in
the persistent-memory pickup notes (`enhancement-sprint-v1-0-4`).

**Design principles (from ux-redesign-proposal.md):** Today is the loop; no
streak guilt; ≤2 notifications/day; jargon budget ~2 concepts; milestones
only fill, never drain; identity framing ("votes for who you're becoming").

Legend: ✅ built before the ground-up sprint · 🆕 built in the ground-up
implementation branch · ⚠️ code-complete with an external release-console
action still open · ▢ not started

## Tier 1 — Highest leverage

- ✅ **1. Sunday Weekly Review ritual** — free 3-minute coach conversation
  (`"weekly"` periodType); never counts against the 10 free check-ins, so the
  coach habit itself is never gated. Entry: Coach-tab card + link on Today's
  weekly recap card.
- ✅ **2. Coach memory** (premium) — digest of the last 2 saved sessions
  injected into the reflection prompt; the feature that makes "unlimited
  check-ins" mean something ("a coach that knows you").
- 🆕 **3. Home-screen + lock-screen widget** — "Cast Your Vote": interactive
  home widget (Done + 2-min kickstart buttons via App Intents, iOS 17),
  lock-screen ring, rotating identity copy, rest-day face. Built with
  `@bacons/apple-targets` (`targets/widget/`), App Group
  `group.com.resolutioncompanion.app`, JS bridge `client/lib/widget.ts`,
  pending-vote reconciliation in AppContext. The JS↔App-Group bridge is the
  local module `modules/app-group-storage` — apple-targets' bundled
  ExtensionStorage pod requires iOS 16.4 and is silently SKIPPED by pod
  autolinking at our 15.1 deployment target (found in sim regression: the
  binary shipped without it and the bridge no-opped).
- 🆕 **4. Monthly "Identity Wrapped" share card** — "Month in Votes":
  swipeable no-guilt story (votes, portrait, comeback, shields, closing) on
  the 1st, share-as-image via react-native-view-shot; entry card on Today.
  `client/lib/recap.ts`, `MonthRecapScreen`. The premium December/January
  **The Year You Became** annual edition is also complete.
- ✅ **5. Milestone deadline countdown** — optional target date (preset
  chips 3w/1m/2m/3m) + gentle countdown chip; no red urgency states.

## Tier 2 — Utility moat

- ✅ **6. One-line "how it went" completion note** — optional, skippable;
  shows on Today + Journey day detail; last 7 days feed the coach so it can
  quote the user's own words.
- 🆕 **7. Insights panel** (premium) — day-of-week profile, 8-week momentum
  sparkline, and one narrative + recommendation (Oura pattern) on Journey;
  quiet locked state for free. `client/lib/insights.ts`, `InsightsPanel`.
- ✅ **8. "Mark all done ✓" on the daily reminder** — notification action,
  no app open needed; credits the notification's fire date.
- 🆕 **9. Siri / App Intents voice logging** — "Log my kickstart in
  Resolution Companion" (`targets/widget/AppShortcuts.swift`); logs the next
  pending action's floor version with a spoken reply.
- 🆕 **10. Apple Health auto-complete** — per-action opt-in
  (workout / 7,000+ steps / mindful session) in the Action editor;
  auto-votes on foreground via `client/lib/health.ts` (react-native-health;
  reads stay on-device).

## Tier 3 — Natural premium pull (endow first, gate second)

- 🆕 **11. Post-milestone "next milestone" proposal** — an immediate private
  fallback is fully visible; an opted-in coach can refine it; "Add" is the
  paywall moment for free users.
- 🆕 **12. Second-persona invitation** — one quiet card after 30+ days at 70%+
  rolling consistency; never more than once a month.
- ⚠️ **13. One-month free trial on yearly** — StoreKit eligibility and exact
  live-offer rendering are complete. App Store Connect currently has a
  one-week offer in 175 territories; replacing it requires explicit approval
  to delete the live offer first.
- ✅ **14. Streak shield visibility** — "shield ready" marker on the Today
  streak chip before it's needed. 🆕 completed: premium 2-shield capacity
  (`computeStreak` maxShields), earn/spend toasts on Today, paywall rows.

## Tier 4 — Streamlining

- ✅ Persist onboarding chat (interruption-proof interview)
- ✅ Benchmark → Milestone rename (editor + paywall table + profile stats)
- ✅ App Store ratings prompt at the 3rd day-complete (expo-store-review)
- ✅ Completed rows stay visible under the day-complete card (bug found in
  live sim testing)
- 🆕 Real SSE for `/api/reflection` (`stream: true`, JSON fallback kept for
  old builds; simulated 30ms/char typewriter removed for the coach)
- 🆕 Contextual paywall card at the 10/10 coach gate (from
  ux-optimization-plan next wave)
- 🆕 Website social-proof strip + `aggregateRating` schema. Apple's live
  lookup reported 3 ratings at 5.0 on 2026-07-18, activating this item.

## Release-console sequence from here

1. Preserve the current App Store review/release state; do not submit this
   branch merely to change console products.
2. With explicit approval, delete the one-week yearly offer and recreate it as
   a one-month free offer across all 175 territories.
3. Choose final App Store prices before creating the lifetime and alternate
   yearly products. The client hides both until StoreKit returns them.
4. Refresh the website's rating count when Apple's public count changes.

## 2026-07-17 ground-up sprint — additions beyond the numbered items

Built as part of the numbered 🆕 marks above (strategy in
`docs/ground-up-review-2026-07.md`):

- 🆕 **Privacy-respecting telemetry** — daily event counts only, keyed to
  the anonymous deviceId (`client/lib/telemetry.ts`, `POST /api/telemetry`,
  `device_events` table, admin `GET /api/telemetry/summary`). Funnel events
  instrumented across onboarding, daily loop, paywall, coach, widget.
  Disclose in the privacy policy before shipping.
- 🆕 **Launch-time entitlement re-sync** — AppContext reconciles the local
  subscription against `GET /api/subscription/status` on cold start
  (conservative downgrade: only when the server disagrees AND local expiry
  has lapsed).
- 🆕 **Portfolio-of-hooks reminders** — the single daily notification learns
  which voice (momentum / coach / calm) this user taps; lapsed users always
  get the no-guilt reopen (`selectReminderHook` in `lib/notifications.ts`).
- 🆕 **MI coach spine** — reflection prompts restructured around
  motivational interviewing (reflect → permission → evoke → evidence-based
  affirmation).
- 🆕 **Proactive coach observation** — one locally-computed weekly
  observation card on Today ("every Tuesday for 4 weeks — Tuesday You is
  real"); `computeCoachObservation` in `lib/insights.ts`.
- 🆕 **Free memory taste** — free users experience coach memory exactly once
  before the gate; the coach may mention Premium once if it lands naturally.
- 🆕 **Identity-science micro-notes** — 18 bundled 60-second reads
  (`lib/micro-notes.ts`), daily for premium / weekly for free, in the Coach
  lobby.
- 🆕 **Milestone reward layer** — un-drainable cosmetics unlocked by
  completed milestones (`lib/rewards.ts`); first reward ships the previously
  hard-locked light palette as the **Dawn theme** (ThemeProvider +
  Profile → Appearance row; reveal in the milestone celebration modal).
- 🆕 **Premium 2-shield capacity + earn/spend visibility** (completes #14).

Additional completed Later bets: celebration-only witness sharing, private
iCloud backup/restore, The Year You Became annual recap, lifetime entitlement
support, and stable new-install price-cohort support. Production rate limits
now use shared Postgres counters and production quota/auth failures fail
closed.

Still external: **#13 trial replacement**, plus creation and pricing of the
lifetime and alternate-yearly products. The App Store CTA, telemetry/privacy
disclosures, and conditional website rating strip are complete.
