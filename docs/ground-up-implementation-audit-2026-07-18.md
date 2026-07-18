# Ground-Up Roadmap Implementation Audit

**Audited:** July 18, 2026

**Source plan:** `docs/ground-up-review-2026-07.md` §6

**Artifact tested:** iOS simulator build **1.0.9** on iPhone 16 Pro / iOS 18.0

## Outcome

Every application and server deliverable in Phase 0 through Phase 3 is
implemented. The exact 1.0.9 native artifact passed the clean-install,
seeded-history/engagement, App Group widget-reconciliation, and Title II/WCAG
2.1 AA technical regressions. Static validation also passes.

One release-console task remains: a live App Store Connect inspection on July
18 found that the yearly subscription's approved introductory offer is **free
for one week in 175 territories**, rather than the roadmap's one-month offer.
Replacing it requires deleting the live offer and creating a new one, which is
intentionally awaiting explicit destructive-action approval. The client
deliberately reads StoreKit's live offer and eligibility metadata, so it will
truthfully render the current duration instead of hard-coding a one-month
promise.

The source plan's **Later bets** are not Phase 0–3 commitments. Witness
accountability, the annual wrapped, iCloud backup, and pricing tests remain
explicitly deferred.

## Phase 0 — Measure

| Requirement                     | Status                                             | Implementation and evidence                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| ------------------------------- | -------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Privacy-respecting telemetry    | Complete                                           | `client/lib/telemetry.ts` keeps only daily event counts keyed to the anonymous device ID; `client/context/AppContext.tsx` and feature surfaces emit the allowlisted funnel events. `server/routes.ts` validates and aggregates them, `shared/schema.ts` stores daily counters, and the admin endpoint never returns device IDs. The disclosure is live in `server/templates/privacy.html`. Unit coverage: `client/lib/__tests__/telemetry.test.ts`.                               |
| One-month yearly trial          | Client complete; ASC replacement approval required | `client/lib/iap.ts` parses the live StoreKit introductory offer and checks subscription-group eligibility. `client/screens/SubscriptionScreen.tsx` shows trial language only for an eligible free offer and passes the eligibility flag into purchase. Live ASC inspection found the current approved offer is one week across 175 territories. Replacing it requires deleting that offer before creating the one-month offer. Unit coverage: `client/lib/__tests__/iap.test.ts`. |
| Launch-time entitlement re-sync | Complete                                           | `client/context/AppContext.tsx` reconciles the cached entitlement with `/api/subscription/status` on cold start through `client/lib/subscription.ts`, including inactive, expired, and validated-expiry cases. Unit coverage: `client/lib/__tests__/subscription.test.ts`.                                                                                                                                                                                                        |

## Phase 1 — Ambient layer

| Requirement                      | Status   | Implementation and evidence                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| -------------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Cast Your Vote widgets           | Complete | `client/lib/widget.ts` mirrors ring state, all remaining actions, and seven future day plans to the App Group. `targets/widget/index.swift` supports full and kickstart interactive votes, optimistic advancement, rest states, and stale-snapshot roll-forward. The 1.0.9 build embedded `ResolutionWidget.appex`; `qa/maestro-widget-prepare.yaml` and `qa/maestro-widget-verify.yaml` proved a native pending vote was consumed and visibly labeled. Unit coverage: `client/lib/__tests__/widget.test.ts`. |
| App Intents / Siri               | Complete | `targets/widget/AppShortcuts.swift` exposes kickstart and named-action intents over the same pending-vote contract. Reconciliation records `completionSource` and `completionKind` rather than collapsing native votes into manual taps.                                                                                                                                                                                                                                                                      |
| Portfolio-of-hooks notifications | Complete | `client/lib/notifications.ts` tracks opportunities, notification taps, and organic opens locally, then selects momentum, coach, calm, or lapsed copy by response rate while preserving the one-notification-per-day covenant. Unit coverage: `client/lib/__tests__/notifications.test.ts`.                                                                                                                                                                                                                    |

## Phase 2 — Story loop

| Requirement           | Status   | Implementation and evidence                                                                                                                                                                                                                                                                                                                                                      |
| --------------------- | -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Month in Votes recap  | Complete | `client/lib/recap.ts` produces six story beats covering votes, consistency, best weekday/time, comeback and floor saves, Health votes, resilience, and shields. `client/screens/MonthRecapScreen.tsx` renders share-ready cards, requests one consent-gated coach line, caches it by persona/month, and falls back offline. Unit coverage: `client/lib/__tests__/recap.test.ts`. |
| Insights panel        | Complete | `client/components/InsightsPanel.tsx` and `client/lib/insights.ts` provide premium pattern views from the same local history and emit an aggregate view event. Unit coverage: `client/lib/__tests__/insights.test.ts`.                                                                                                                                                           |
| Earned shield economy | Complete | `client/lib/progress.ts` earns one shield after seven clean scheduled action-days, spends it on a miss, and caps inventory at one for Free or two for Premium. Today/Journey, Weekly Review, and recap surfaces report earned/used state. Unit coverage: the shield scenarios in `client/lib/__tests__/progress.test.ts`.                                                        |

## Phase 3 — Coach, rewards, and integrations

| Requirement                            | Status   | Implementation and evidence                                                                                                                                                                                                                                                                                                                                                              |
| -------------------------------------- | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Motivational-interviewing prompt spine | Complete | `client/lib/ai.ts` directs the coach to reflect, ask permission, evoke the user's reasons, and affirm identity evidence. Profile's Direct Coach reward changes the tone without weakening safety or consent.                                                                                                                                                                             |
| Proactive weekly observation           | Complete | Today derives a local, pattern-based coach observation and routes it into Coach. Copy is conditional on AI consent, so the app never claims that AI noticed something when consent is absent. The seeded-history regression exercised this surface.                                                                                                                                      |
| Real reflection SSE                    | Complete | `server/routes.ts` streams `/api/reflection` when requested; `client/lib/ai.ts` consumes native SSE instead of replaying a completed response. `client/lib/stream-buffer.ts` batches UI updates without stealing user-controlled scroll. Unit coverage: `client/lib/__tests__/stream-buffer.test.ts`; the simulator regression also received a real non-empty weekly-coach reply.        |
| Identity-science micro-notes           | Complete | `client/lib/micro-notes.ts` supplies the content drip and `client/screens/ReflectScreen.tsx` renders expandable notes. The engagement regression verifies the Expand→Collapse state.                                                                                                                                                                                                     |
| Milestone reward layer                 | Complete | `client/lib/rewards.ts` permanently unlocks Dawn theme, Direct coach, and Aurora celebrations across the first three earned thresholds. `client/components/MilestoneCompleteModal.tsx` reveals the reward; `client/screens/ProfileScreen.tsx` exposes explicit controls. Unit coverage: `client/lib/__tests__/rewards.test.ts`; the engagement regression toggles Dawn back to Midnight. |
| Health auto-votes                      | Complete | `client/screens/ActionEditorScreen.tsx` configures workout, step, or mindful-minute triggers; `client/lib/health.ts` evaluates them fail-closed; `client/context/AppContext.tsx` records the Health source. Today/Journey/recap disclose the source. Unit coverage: `client/lib/__tests__/health.test.ts`.                                                                               |

## Supporting completion work

- `design_guidelines.md` now documents the real three-tab architecture,
  ambient surfaces, rewards, accessibility, and the known iOS tab-animation
  landmine.
- The tracked Mid-Year Reset campaign copy now points to the live App Store URL
  instead of the pre-launch website/"coming soon" CTA.
- Expo SDK 54 dependencies are aligned; Expo Doctor passes all checks.
- `drizzle-orm` was upgraded to remove its direct SQL-injection advisory. The
  remaining audit findings are transitive Expo/build-tool advisories without a
  non-breaking SDK 54 resolution.
- The client completed a Title II/WCAG 2.1 AA technical pass: semantic roles,
  names, values, modal isolation, status announcements, 2x Dynamic Type,
  accessible light-theme contrast, and all device orientations. See
  `docs/title-ii-accessibility-audit-2026-07-18.md`.

## Verification record

| Check                             | Result                                                                                                                         |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| TypeScript                        | Pass — `npm run check:types`                                                                                                   |
| Accessibility source gate         | Pass — `npm run check:a11y`                                                                                                    |
| Jest, Pacific timezone            | Pass — 13 suites / 150 tests                                                                                                   |
| Expo ESLint                       | Pass — 0 errors (3 hook-dependency warnings)                                                                                   |
| Prettier                          | Pass — `npm run check:format`                                                                                                  |
| Server bundle                     | Pass — `npm run server:build`                                                                                                  |
| Expo Doctor                       | Pass — 18/18 checks                                                                                                            |
| Production dependency audit       | Reviewed — 20 advisories (3 high, 17 moderate, 0 critical), all in Expo/native build-tool dependency paths                     |
| Native simulator compile          | Pass — 1.0.9, app + widget extension, all four orientations                                                                    |
| Accessibility simulator flow      | Pass — largest iOS accessibility text, Increased Contrast, Reduce Motion, portrait + landscape                                 |
| Clean-install Maestro regression  | Pass — onboarding, daily loop, navigation, Coach, paywall                                                                      |
| Seeded-history Maestro regression | Pass — milestone/reward, micro-note, live weekly Coach, Dawn preference                                                        |
| Native App Group reconciliation   | Pass — pending widget kickstart consumed, pending payload cleared, accessible badge shown, persisted as `widget` + `kickstart` |

Simulator screenshots are intentionally kept under the ignored `build/`
evidence directory rather than committed as source files.
