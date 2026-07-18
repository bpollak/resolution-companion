# Ground-Up Roadmap Implementation Audit

**Audited:** July 18, 2026

**Source plans:** `docs/ground-up-review-2026-07.md` and the approved
`docs/enhancement-roadmap.md` it extends

**Artifact tested:** iOS simulator build **1.0.11** on iPhone 16 Pro / iOS 18.0

## Outcome

Every application and server deliverable in Phase 0 through Phase 3, every
Later bet, and every currently applicable item in the approved enhancement
roadmap is implemented in the repository. A final prose-level audit also
closed the alternate-icon, accent-reward, large/lock widget, honest-pricing,
client-error, and AI-cost visibility details. The exact 1.0.11 native artifact
passed clean-install, largest-text accessibility, reward/icon, later-bet,
roadmap-completion, annual-recap, live-Coach, and App Group widget-
reconciliation regressions. Static validation also passes.

Two commercial release-console actions are deliberately not represented as
complete:

- The approved yearly introductory offer in App Store Connect is free for one
  week in 175 territories, not the roadmap's one-month offer. Replacing it
  requires explicit approval to delete the live offer before recreating it.
- Lifetime and alternate-yearly product support is complete and fail-safe in
  code, but the products remain hidden unless StoreKit returns real App Store
  Connect products. Creating those products requires final price choices.

The client remains truthful while those actions are open: trial text comes
from Apple's live offer and eligibility metadata, and unavailable products are
not shown. No App Store build was submitted and the in-review release state was
not disturbed.

## Phase 0 — Measure

| Requirement | Status | Implementation and evidence |
| --- | --- | --- |
| Privacy-respecting telemetry | Complete | `client/lib/telemetry.ts` records only allowlisted daily event counts keyed to an anonymous device ID. Server validation, daily aggregation, admin summaries, disclosures, and tests are present. A caught JavaScript failure contributes only a `client_error` count; its message and stack remain on-device. AI requests separately aggregate model/input/output token totals by UTC day and endpoint without device IDs or content, exposed through an admin-only summary. |
| One-month yearly trial | Client complete; ASC action requires approval | `client/lib/iap.ts` parses Apple's live introductory offer and eligibility; the paywall never invents trial terms. The current one-week live offer must be deleted before a one-month offer can replace it. |
| Launch-time entitlement re-sync | Complete | Cold start reconciles cached entitlement with `/api/subscription/status`, including expired and lifetime cases. |

## Phase 1 — Ambient layer

| Requirement | Status | Implementation and evidence |
| --- | --- | --- |
| Cast Your Vote widgets | Complete | The app mirrors current and seven-day action state to App Group storage. Small, medium, and large Home Screen families plus a circular lock-screen family cover ring, identity, rest, full-vote, and kickstart states. Interactive families advance optimistically and stale data rolls forward without guilt copy. The 1.0.11 artifact embeds the compiled `ResolutionWidget.appex`. |
| App Intents / Siri | Complete | `targets/widget/AppShortcuts.swift` exposes kickstart and named-action intents using the same pending-vote contract. |
| Portfolio-of-hooks notifications | Complete | Local response history selects momentum, coach, calm, or lapsed copy while preserving the one-notification-per-day covenant. |

## Phase 2 — Story loop

| Requirement | Status | Implementation and evidence |
| --- | --- | --- |
| Month in Votes recap | Complete | Six local story beats cover votes, consistency, best patterns, comeback/floor saves, Health votes, resilience, and shields. Cards are share-ready; the optional coach line is consent-gated and has an offline fallback. |
| Insights panel | Complete | Premium Journey insights provide day-of-week patterns, an eight-week momentum view, and a local narrative/recommendation from the same history. |
| Earned shield economy | Complete | Seven clean scheduled action-days earn a shield; misses spend it; Free holds one and Premium holds two. Earn/spend state appears across Today, Journey, Weekly Review, recap, and paywall. |

## Phase 3 — Coach, rewards, and integrations

| Requirement | Status | Implementation and evidence |
| --- | --- | --- |
| Motivational-interviewing prompt spine | Complete | Coach prompts reflect, ask permission, evoke the user's reasons, and affirm identity evidence. |
| Proactive weekly observation | Complete | Today derives one local pattern observation and only frames it as AI noticing when AI consent exists. |
| Real reflection SSE | Complete | `/api/reflection` streams native SSE; the client buffers updates without stealing user-controlled scroll. The final simulator run received a real non-empty coach response. |
| Identity-science micro-notes | Complete | Eighteen bundled notes form a free/premium drip; expand/collapse is covered by native regression. |
| Milestone reward layer | Complete | Five permanent rewards unlock at successive milestones and never drain: Dawn theme, Direct Coach, Aurora celebration, a native Aurora Home Screen icon, and a contrast-safe Violet accent. Profile switches expose names, hints, and checked state. The compiled app declares `CFBundleAlternateIcons`, contains the `AuroraIcon` asset, displayed Apple's native confirmation, and visibly changed the Simulator Home Screen icon. |
| Health auto-votes | Complete | Per-action workout, step, and mindful-minute triggers evaluate fail-closed and record Health as the source. |

## Later bets and foundation requirements

| Requirement | Status | Implementation and evidence |
| --- | --- | --- |
| One-person witness | Complete | Explicit name and opt-in settings, preview, weekly celebration-only prompt, user-initiated system share, no feed, no automatic outbound message, and unit/native coverage. |
| The Year You Became | Complete | Premium annual recap with four swipeable, share-ready cards, seasonal Today entry, Profile entry, deterministic local summaries, and unit/native coverage. Fixed-format image typography is capped to protect the exported composition; each image exposes a complete semantic description at maximum Dynamic Type. |
| Private iCloud backup | Complete | Opt-in private key-value backup, size/version validation, stale-key-safe restore, explicit destructive confirmations, delete-account cleanup, and no subscription/device ID/telemetry/cohort leakage. The simulator fails safely when iCloud is unavailable. |
| Lifetime tier | Code complete; ASC product decision open | iOS StoreKit non-consumable discovery, purchase, restore, server validation, no-expiry reconciliation, and disclosure are implemented. The option is hidden unless StoreKit returns the product. Android remains hidden until Google one-time validation exists. |
| New-cohort yearly price test | Code complete; ASC product decision open | Assignment is limited to genuinely new installs after the configured start, is stable and anonymous, grandfathers existing users/purchasers, and only shows an alternate price returned by StoreKit. |
| Private API and quotas | Complete | Production auth and AI quota checks fail closed; distributed Postgres fixed-window rate limits replace instance-local counters. Database failure returns 503 rather than bypassing protection. |
| Backup and progress-math debt | Complete | Private iCloud backup is shipped and duplicated momentum logic delegates to the canonical progress module. |
| Current architecture/design guidance | Complete | `design_guidelines.md` documents the three-tab system, ambient surfaces, rewards, accessibility, and the iOS tab-animation landmine. |
| Client UI regressions | Complete | Tracked Maestro flows cover clean install, accessibility/orientation, engagement/live Coach, later bets, annual recap, milestone proposal/second persona, earned cosmetics, and native widget reconciliation. |

## Approved enhancement-roadmap closure

Items 1–10 and 14 were already covered by the phase work above. The strict
audit also recovered and completed these previously open requirements:

- **#11 next milestone:** a fully visible local proposal appears immediately;
  an opted-in coach can refine it; only Add is gated for a free user.
- **#12 second persona:** one-persona users with at least 30 days and 70%
  rolling consistency receive one quiet invitation at most once per month.
- **Contextual 10/10 Coach paywall:** implemented as a value-first limit moment.
- **Website social proof:** Apple's live lookup reported 3 ratings at 5.0 on
  July 18, so the now-applicable hero strip and `aggregateRating` schema were
  added. The figures should be refreshed when the public rating count changes.

Item #13 is the same App Store Connect introductory-offer action documented
above. Its client behavior is complete; changing the live offer remains an
explicitly approved console operation.

## Verification record

| Check | Result |
| --- | --- |
| TypeScript | Pass — `npm run check:types` |
| Accessibility source gate | Pass — `npm run check:a11y` |
| Jest, Pacific timezone | Pass — 19 suites / 169 tests |
| Expo ESLint | Pass — 0 errors, 0 warnings |
| Prettier | Pass — `npm run check:format` |
| Server bundle | Pass — `npm run server:build` |
| Expo Doctor | Pass — 18/18 checks |
| Production dependency audit | Reviewed — 20 advisories (3 high, 17 moderate, 0 critical), all in Expo/native build-tool dependency paths |
| Native simulator compile | Pass — 1.0.11, app + widget extension, alternate icon asset catalog |
| Clean-install regression | Pass — onboarding, daily loop, navigation, Coach, and paywall |
| Title II visual-accessibility flow | Pass — maximum iOS Dynamic Type, Increased Contrast, Reduce Motion, portrait and landscape |
| Later-bet flow | Pass — witness opt-in, backup fail-safe, and annual-recap gate |
| Premium annual recap | Pass — two-card swipe/share traversal at maximum Dynamic Type |
| Roadmap completion moments | Pass — proposal, contextual gate, and second-persona invitation at maximum Dynamic Type |
| Live engagement | Pass — note expansion, live weekly Coach reply, and theme preference |
| Earned cosmetic rewards | Pass — Violet accent and Aurora icon switches at maximum Dynamic Type; native confirmation and Home Screen icon verified |
| Native App Group reconciliation | Pass — pending widget vote consumed and cleared, accessible badge displayed, and log persisted as `widget` + `kickstart` |
| Artifact inspection | Pass — version 1.0.11, `CFBundleAlternateIcons`, Aurora asset renditions, and embedded widget extension verified |

Simulator screenshots and the extracted 1.0.11 application are retained under
the ignored `build/` evidence directory rather than committed as source files.
