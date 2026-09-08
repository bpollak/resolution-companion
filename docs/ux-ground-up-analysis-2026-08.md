# Ground-Up UX Analysis — August 2026 (v1.3.6 working tree)

A full end-user-perspective review of the app as it stands after four accumulated
sprints (v1.0.4 enhancements → ground-up sprint → ambient-coach sprint). The
question asked: does the current layout maximize what the app can actually do?

**Thesis of this review:** the daily loop itself is built and coherent. The
biggest UX wins available are not new features — they are (1) deleting drift,
(2) shipping capabilities that already exist but are invisible to users, and
(3) converging duplicate surfaces that accumulated as sprints layered on. This
matches the engagement plan's own directive: _instrument and tune the loop, not
build a new pile of features._

Settled decisions this review respects and does not reopen: the 3-tab IA
(Today / Journey / Coach) with Profile as a header-gear modal; no `animation`
on the bottom-tab navigator; the ambient-coach privacy boundaries (on-device
signals, opaque tune-up slots, count-only telemetry); R013/R014 from the
2026-08-04 regression pass; fill-only milestones; the anti-pattern list (no
guilt, no leaderboards, no loss-aversion).

---

## 1. The experience as an end user meets it

**First run.** Compass logo → "Begin Your Evolution" → 3-page intro carousel →
AI consent → a 3-turn AI interview → plan extraction → land on Today. This is
strong: consent-first, a graceful no-AI starter-plan path, transcript restored
on interrupt. (Known, unaddressed weakness from the July review: completion is
turn-count-based, not substance-based.)

**The daily loop.** Reminder fires in the anchor-inferred time bucket, in the
best-performing copy voice, naming the milestone — with a "Mark all done ✓"
action that works without opening the app. In-app, Today leads with a single
interpretive signal (rest / complete / reduce-friction / protect-pattern /
plan-fit / next-action), then the action rows with 2-minute kickstart floors.
Completion gives haptic + identity-framed toast + ring fill; day-complete gives
a celebration card, an optional 5-factor context capture, and a tomorrow hook.
Actions can also complete from the widget, lock screen, Siri, the notification
action, or Apple Health. **This loop is the app's core asset and it works.**

**The long arc.** Journey holds the rhythm framing (working well / still
forming / worth simplifying), factor discoveries, the calendar with shields,
milestone fill-bars, and premium Insights. Coach (as a sheet over any screen)
starts from evidence, can propose a plan tune-up with a field-by-field preview,
and never applies changes silently. Recaps (weekly card, Month in Votes, The
Year You Became) narrate progress with no-guilt framing.

**Where it breaks down for the user** — the rest of this document.

---

## 2. Findings

### A. Broken or dead (defects, verified against code)

| #   | Finding                                                                                                                                                                                                                                                                                                | Location                                     |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------- |
| A1  | **~700-line dead coach implementation.** ReflectScreen contains a complete in-tab chat session (streaming, save/discard, consent modal, coach-memory digest) reachable only via `route.params.startWeekly` — which nothing in the codebase ever sets. All live coaching goes through CoachSheetScreen. | `client/screens/ReflectScreen.tsx`           |
| A2  | **Premium coach memory never ships.** `previousSessionNotes`, `recentNotes`, and the free-tier "memory taste" upsell are assembled only inside the dead A1 path. CoachSheet passes only action context / tone / weekly context. A paid differentiator with zero user exposure.                         | `client/lib/ai.ts`, `ReflectScreen.tsx`      |
| A3  | **Rewards copy points to a nonexistent screen.** All five earned-reward descriptions say "Switch anytime in Profile → Appearance"; the rewards actually render in Profile → About → "Earned Personalization", below the version number.                                                                | `client/lib/rewards.ts`, `ProfileScreen.tsx` |
| A4  | **Orphaned components**: CoachObservationCard, LapseRecoveryCard, Card, Button, HeaderTitle, AnimatedPressable, Spacer — imported by nothing. `buildCoachOpening` only used by the dead A1 path.                                                                                                       | `client/components/`, `client/lib/coach.ts`  |
| A5  | **Plan-adjustment audit trail has no reader.** Every AI plan change is recorded (before/after/rationale/applied) and exposed on AppContext, but no screen shows it. Users cannot review what the coach changed.                                                                                        | `client/lib/storage.ts`, `AppContext.tsx`    |
| A6  | **~13 untracked `* 2.tsx` / `* 2.ts` duplicate files** sit beside the live files, drifting.                                                                                                                                                                                                            | `client/{screens,components,lib}/`           |
| A7  | **Year recap built with `maxShields = 2` unconditionally** while the month recap correctly passes `isPremium ? 2 : 1`.                                                                                                                                                                                 | `client/screens/TodayScreen.tsx`             |
| A8  | **Duplicate "N actions tomorrow →" link** — two implementations in mutually exclusive TodayScreen branches.                                                                                                                                                                                            | `TodayScreen.tsx`                            |
| A9  | **Duplicate micro-note id** `identity-evidence` (indices 0 and 11) — the hash keying can serve the same note twice as often as intended.                                                                                                                                                               | `client/lib/micro-notes.ts`                  |

### B. Built but invisible (capability ≫ discoverability)

| #   | Finding                                                                                                                                                                                                                                                                           | Impact |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| B1  | **Widget + Siri shortcuts have zero in-app mention.** Four widget families and two Siri phrases are fully built; no onboarding step, Profile row, or card ever tells the user. The strongest "trigger" asset in the habit loop is undiscoverable.                                 |
| B2  | **No deep linking.** The `resolutioncompanion` scheme exists in app.json but `NavigationContainer` has no `linking` config. A notification saying "One step toward Run a marathon" lands on whatever tab was last open. Widget body-taps likewise.                                |
| B3  | **The paywall undersells.** The compare table omits daily micro-notes, the year recap, all-discoveries, and coach memory — all premium in code. Only 2 of 14 paywall entry points pass a `source`, so most paywall visits show a generic hero with no "here's what you just hit." |
| B4  | **Witness** is one row, two levels deep, on a non-default tab. **Health auto-complete** is visible only inside action editing. **iCloud backup** is three levels deep.                                                                                                            |

### C. Layout, density, consistency

| #   | Finding                                                                                                                                                                                                                                                                                                                                          |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| C1  | **Today has dueling primary CTAs**: the signal card's "Complete this action" acts on the same action as the first ActionCard's "Mark Complete" ~200px below it.                                                                                                                                                                                  |
| C2  | **Journey is 16 sections in one scroll**, carrying four parallel progress framings (monthly ring, streak chips, milestone bars, insights sparkline). App-wide there are five differently-windowed "consistency" metrics with near-identical labels (7-day momentum, month-to-date alignment, 8-week trend, 28-day rhythm, calendar-month recap). |
| C3  | **Coach lobby: five CTAs, three of which open the identical destination** (`CoachSheet {origin:"direct", promptId:"reflect-success"}`); the free check-in counter renders twice on the same scroll.                                                                                                                                              |
| C4  | **Premium gating uses at least four visual patterns**: lock glyph with unchanged label (Journey "Add milestone"), full locked card (coach limit), quiet locked panel (Insights), and a silent redirect-on-mount (YearRecap).                                                                                                                     |
| C5  | **The Coach tab is the only tab without the Profile gear** (and the only one without a header subtitle) — settings are unreachable from one of three tabs.                                                                                                                                                                                       |
| C6  | **DailyContextCard has two contracts**: Skip button + dismissed status on Today; no Skip and a different title on Journey.                                                                                                                                                                                                                       |
| C7  | **Today's footer card stack** — eight mutually-suppressing cards with a hand-maintained precedence chain and independent AsyncStorage "seen" keys. Managed, but fragile (regression row C07 exists because of it).                                                                                                                               |
| C8  | **Docs drift**: `design_guidelines.md` still says Today leads with the completion ring (it now leads with the signal card) — its second staleness cycle. The engagement plan's Phase A baseline table was never filled in, so the metric-gated roadmap is nominally blocked at step one.                                                         |

---

## 3. Fix plan

**Status: ALL THREE TIERS IMPLEMENTED 2026-08-05** (same session as this
analysis). 247 unit tests pass; typecheck and lint clean. Notes inline below.

### Tier 1 — Delete drift & fix broken promises (small, near-zero risk) ✅

- Remove the dead in-tab session from ReflectScreen (extract its
  `ReflectionExtras` builders first — Tier 2 needs them); keep lobby +
  past-session viewer.
- Delete orphaned components and `* 2.*` duplicates; drop `buildCoachOpening`.
- Fix A3 (with the Tier 3 Profile change making the copy true), A7, A8, A9.
- Add gear + subtitle to the Coach tab header.

### Tier 2 — Ship what's already built (medium, high value) ✅

- Port coach memory (`previousSessionNotes` / `recentNotes` / `memoryTaste`)
  into CoachSheetScreen's request builder.
- Add `linking` config; notification taps and widget body-taps route to Today.
- Widget/Siri discoverability: a one-time card after the first day-complete +
  a Profile row explaining the widget and Siri phrases.
- Paywall: add the missing premium rows; pass `source` from high-traffic
  entries (Insights, milestone add, year recap).
- Plan-adjustment history: a compact "Plan changes" list in the Coach lobby.

### Tier 3 — Converge duplicate surfaces (medium-large, design judgment) ✅

- Today: the `next-action` signal keeps its evidence framing but drops the
  duplicate completion button (one completion affordance per action).
- Coach lobby: one conversation entry point; monthly check-in merges into it;
  counter renders once.
- Journey: reorder into three zones (Rhythm → History → Milestones), merge the
  persona card into the header area, move Stories & Support into Profile reach,
  and label every metric with its window.
- One premium-gate pattern (locked-card style); YearRecap shows a gate screen
  instead of silently redirecting.
- DailyContextCard: one contract (Skip everywhere, one title rule).
- Profile: a real "Appearance & Rewards" row on the main panel.

---

## 4. Docs hygiene (follow-up, not code)

- ✅ `design_guidelines.md` updated to describe the signal-card-led Today.
- ▢ Fill the engagement plan's Phase A baseline table from live telemetry
  before starting Phase B work.
- ▢ Reconcile the ≤1 vs ≤2 notifications/day invariant across
  `ground-up-review-2026-07.md` and `engagement-plan-2026-07.md`.

## Implementation notes (2026-08-05)

- New/changed surfaces: Coach lobby consolidated (one conversation entry with
  a locked variant at 10/10, counter shown once, "Plan Changes" history list);
  CoachSheet now sends coach memory (`buildPreviousSessionNotes` /
  `buildRecentNotes` / one-time free `memoryTaste`, moved to `lib/coach.ts`);
  deep links live (`resolutioncompanion://today|journey|coach`), notification
  taps route to Today, widget body-tap opens Today (`widgetURL` in
  `targets/widget/index.swift`); one-time widget/Siri hint card at
  day-complete + "Widget & Siri" Profile row; paywall gained 4 compare rows
  and 3 new `source` contexts (insights / year-recap / milestone-limit);
  Profile gained a real Appearance panel (rewards moved out of About, with a
  locked empty state); YearRecap shows a visible gate instead of a silent
  redirect; Journey header compacted (persona intro line, Stories & Support
  moved below Insights); Journey's context card gained Skip parity.
- Tests: `coach-session-lifecycle.test.ts` retargeted to CoachSheetScreen;
  `coach.test.ts` covers the memory builders; `profile-navigation.test.ts`
  expects the 6-row settings list.
- NOT yet device-verified: widget deep link + Siri phrases (need a real
  build), coach-memory payload on the wire, paywall rows on-device.

## Full regression + visual pass (2026-08-05, evening)

Executed against fresh local builds on iPhone 17 / iOS 26.5 (results log:
`qa/regression-results-2026-08-05.txt`).

**PASS (Maestro, current build):** fresh-install regression (×2 full runs),
tab-first-tap, today-undo, ambient-coach, coach-live (production AI),
coach-responsiveness (rewritten for the sheet; live stream + session
isolation), subscription-status, accessibility, rewards (new Appearance
panel), journey-discovery. Manual verification: coach-session save persists
(reflection + conversation + quota decrement), Profile/Appearance panels,
milestone editor UI.

**Environment-limited (not app defects):** coach-offline needs the
network-off harness; premium year-recap story needs StoreKit sandbox (the
entitlement system correctly revokes forged QA entitlements — the new gate
screen verified in its place); editors text-value asserts blocked by iOS 26.5
accessibility-tree gap in Maestro (editor verified manually); engagement's
Profile-open step and daily-context's save-tap remain flaky under Maestro on
this iOS (features verified manually/elsewhere).

**Product fixes that came out of the regression + visual review:**
splash = transparent compass glyph on pure black (was a visible gradient
square); app icon recomposited on pure black (iOS + both Android adaptive
layers); CoachSheet background dim (`sheetLargestUndimmedDetentIndex:
"none"`) and opaque composer bar (chat text showed through); semantic accent
colors (green = working well/day complete, amber = friction/kickstart/
micro-read, cyan = everything else — violet explicitly rejected); "1 day"
singular; save-while-streaming edge documented. Harness hardening: seeds
guard against the SIGKILL-mid-write AsyncStorage wipe (idle-wait +
personas-present check); 6 stale flows repaired for the current UI.

## Product decisions during live review (2026-08-06, with Brett)

- **Daily-context capture removed entirely** (the "What shaped today?"
  five-factor card). With it went the factor-discovery engine, the `plan-fit`
  signal kind, and the factor tallies in plan tune-up requests (the request
  field remains, always zero, for server compat). The storage layer keeps its
  context functions so legacy data still cleans up on persona deletion.
  Rationale: Brett found the popup unwanted; chosen over softer options
  (stop auto-open / Journey-only) explicitly.
- **Coach lobby reduced to a single entry**: one "Start a conversation" card
  (locked state at quota), the micro-read, plan-change history, and past
  sessions. The weekly-review and plan-tune-up paths moved fully into the
  sheet's chips (`direct` origin now offers the tune-up chip too). The
  weekly-recap card on Today still deep-links into a review.

**Marketing assets (new, "Confident Spanish Speaker" persona):**
`appstore-screenshots/aso-v3-spanish/` — 8 shots at the 6.9" tier
(1320×2868) including the July hero calendar (solid green + 2 shielded days)
and the milestone-celebration card; website `screen-*-v3.png` written to
`assets/website/` + `public/assets/website/` and referenced by
`server/templates/landing-page.html`. Seeder: `qa/seed_marketing.py` +
`qa/maestro-marketing-shots.yaml`.

## 5. Out of scope here

Committing the uncommitted 1.3.6 tree (separate decision), ASC intro-offer and
lifetime pricing, the web paywall dead end, BlurView profiling on older
devices, substance-based onboarding completion.
