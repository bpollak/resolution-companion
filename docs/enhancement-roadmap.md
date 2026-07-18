# Enhancement Roadmap (approved 2026-07-11)

Source: enhancement brainstorm approved by Brett on 2026-07-11 — sticky
(brings users back), useful (real utility), and value-first premium pull
(never salesy). Status marks track what's shipped; evolving detail lives in
the persistent-memory pickup notes (`enhancement-sprint-v1-0-4`).

**Design principles (from ux-redesign-proposal.md):** Today is the loop; no
streak guilt; ≤2 notifications/day; jargon budget ~2 concepts; milestones
only fill, never drain; identity framing ("votes for who you're becoming").

Legend: ✅ built (v1.0.4 candidate, commits 9f54168 / 85c60b5 / 8345490) ·
🆕 built in the 2026-07-17 ground-up sprint (uncommitted; see
`docs/ground-up-review-2026-07.md` for the strategy behind it) ·
▢ not started

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
  pending-vote reconciliation in AppContext.
- 🆕 **4. Monthly "Identity Wrapped" share card** — "Month in Votes":
  swipeable no-guilt story (votes, portrait, comeback, shields, closing) on
  the 1st, share-as-image via react-native-view-shot; entry card on Today.
  `client/lib/recap.ts`, `MonthRecapScreen`. December year-in-review still ▢.
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

- ▢ **11. Post-milestone "next milestone" proposal** — coach generates the
  actual next milestone, fully visible; "Add" is the paywall moment.
- ▢ **12. Second-persona invitation** — one quiet card after ~30 days of
  sustained consistency; never more than once a month.
- ▢ **13. 7-day free trial on yearly** — StoreKit intro offer; ASC config
  only, can be set up as soon as the subscriptions are Approved.
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

## 2026-07-17 ground-up sprint — additions beyond the numbered items

Built the same day as the numbered 🆕 marks above (strategy in
`docs/ground-up-review-2026-07.md`, all uncommitted pending device
verification):

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

Still external / not code: **#13 trial** (ASC intro-offer config — now the
top remaining lever; data says a ~1-month trial fits the clean-slate rhythm),
marketing CTA swap to the App Store URL, privacy-policy line for telemetry.
