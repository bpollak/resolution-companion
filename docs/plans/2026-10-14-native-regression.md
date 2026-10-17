# Native regression run (2026-10-14)

Brett requested a complete native Maestro regression of the iOS app on the
simulator after the 2026-10-14 UI declutter, widget, and responsiveness work,
before the result goes to TestFlight. Rule for this run: triage every
failure, fix real issues, never weaken a behavioral assertion to make a flow
pass. No purchases, restores, submissions, deployments, pushes, or commits.

## Environment

- Branch `claude/review-fixes-2026-10-13`, base commit `93b84f6`, plus the
  uncommitted changes listed below.
- Release simulator build (xcodebuild, Release, iphonesimulator SDK, arm64,
  ad-hoc signed, production env, backend
  `resolutioncompanion.com`), version 1.5.0 (103). First pass on the `93b84f6`
  build; final pass (`final-*`, then `final2-*` for the seeded chain after two
  flake fixes) on a rebuild that includes the Today badge fix below.
- Simulator "UCSD Next Demo", iOS 26.5, 402x874pt, shared with other apps.
  Only `com.resolutioncompanion.app` was uninstalled/installed. The app's
  prior data was archived before the first fresh install. Content size was
  set to `accessibility-medium` for the accessibility flow and restored to
  `large`.
- Maestro 2.11.0, Java 17. Evidence (junit XML, console logs, flow
  screenshots, failure hierarchies) under the ignored
  `build/native-regression-2026-10-14/`; `final-*` directories are the final
  pass on the rebuilt app, `final2-*` the rerun of the seeded chain, the
  others are the first pass, triage reruns, and spot checks.
- AI flows used the production model (onboarding, Coach, weekly review).

## Order and preconditions

1. Fresh install: `maestro-regression` (AI onboarding, completion, Journey,
   Coach, paywall prices), then `maestro-stateful-regression` (tab first tap,
   undo/2-minute, editors, cold relaunch).
2. On that AI-made plan: ambient-coach, health-disclosure,
   subscription-status, coach-live, coach-save, coach-session, later-bets.
3. `clearState` flows: ai-onboarding, accessibility (at accessibility-medium).
4. New helper `qa/_self-setup-plan.yaml` creates the AI-free starter plan
   ("My Future Self", three habits), then `seed_history.py`: engagement,
   widget-prepare, App Group vote injection, widget-verify,
   `prepare-roadmap-completion.py` + roadmap-completion, `seed_rewards.py` +
   rewards, coach-responsiveness, `seed_premium.py` + year-recap.
5. Fresh install, launch, `seed_marketing.py`: marketing-shots.

## Results

Evidence paths are relative to `build/native-regression-2026-10-14/`; each
has `<dir>.xml` (junit), `<dir>/console.log`, and screenshots under
`<dir>/debug/`. "First pass" is the `93b84f6` build before triage.

| Flow                                                                                                     | First pass    | Final             | Evidence                         | Notes                                                                                                                                                                      |
| -------------------------------------------------------------------------------------------------------- | ------------- | ----------------- | -------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| maestro-regression (fresh install, live AI onboarding, completion, Journey, Coach, paywall $24.99/$2.99) | PASS          | PASS              | `final-01-regression`            |                                                                                                                                                                            |
| maestro-stateful-regression (tab first tap, undo, 2-minute, editors, cold relaunch)                      | PASS          | PASS              | `final-02-stateful`              | Runs tab-first-tap, today-undo, editors-persistence, editors-relaunch, \_reset-to-today                                                                                    |
| maestro-ambient-coach                                                                                    | FAIL          | PASS              | `final-03-ambient-coach`         | Stale precondition (day already complete); now runs `_pending-today`                                                                                                       |
| maestro-health-disclosure                                                                                | PASS          | PASS              | `final-04-health`                |                                                                                                                                                                            |
| maestro-subscription-status                                                                              | PASS          | PASS              | `final-05-subscription-status`   | Settles to free, no stuck Premium label                                                                                                                                    |
| maestro-coach-live                                                                                       | FAIL          | PASS              | `final-06-coach-live`            | Stale entry ("Adjust my plan") and assert-on-first-chunk timing                                                                                                            |
| maestro-coach-save-regression                                                                            | PASS          | PASS              | `final-07-coach-save`            |                                                                                                                                                                            |
| maestro-coach-session-regression                                                                         | PASS          | PASS              | `final-08-coach-session`         | Typed follow-up sends with keyboard open (build 100 fix holds)                                                                                                             |
| maestro-later-bets                                                                                       | FAIL          | PASS              | `final-09-later-bets`            | Restructured for features moved off Profile                                                                                                                                |
| maestro-ai-onboarding                                                                                    | FAIL          | PASS              | `final-10-ai-onboarding`         | Stale entry label, consent-decline copy, iOS 26 input label                                                                                                                |
| maestro-accessibility (accessibility-medium)                                                             | FAIL          | PASS              | `final-11-accessibility`         | Stale consent-decline copy                                                                                                                                                 |
| \_self-setup-plan (new helper, AI-free starter plan)                                                     | PASS          | PASS              | `final2-12-self-setup`           |                                                                                                                                                                            |
| maestro-engagement (micro-note, live weekly review, Dawn on/off)                                         | PASS\*        | PASS              | `final2-13-engagement`           | \*First pass passed while toggling the wrong way; fixed. Final pass flaked once on the "ends with ?" heuristic (`final-13-engagement`), replaced by a stream-complete wait |
| Today badge regression (theme switch under Profile)                                                      | FAIL (manual) | PASS (screenshot) | `final2-21-badge-after-theme`    | Product bug fixed; see below                                                                                                                                               |
| maestro-widget-prepare                                                                                   | PASS          | PASS              | `final2-14-widget-prepare`       |                                                                                                                                                                            |
| maestro-widget-verify (App Group kickstart vote)                                                         | FAIL          | PASS              | `final2-15-widget-verify`        | Injection path and stale row label                                                                                                                                         |
| maestro-roadmap-completion                                                                               | FAIL          | PASS              | `final2-16-roadmap-completion`   | Primer outranked the invitation; then AI-vs-local proposal race (`final-16-roadmap-completion`)                                                                            |
| maestro-rewards (Violet accent, Aurora icon)                                                             | PASS          | PASS              | `final2-17-rewards`              |                                                                                                                                                                            |
| maestro-coach-responsiveness                                                                             | PASS          | PASS              | `final2-19-coach-responsiveness` |                                                                                                                                                                            |
| maestro-year-recap                                                                                       | PASS (false)  | BLOCKED           | `final2-18-year-recap`           | First-pass PASS was a free user; see Remaining                                                                                                                             |
| maestro-marketing-shots                                                                                  | PASS          | PASS              | `final2-20-marketing-shots`      |                                                                                                                                                                            |
| maestro-coach-offline                                                                                    | not run       | BLOCKED           | none                             | Needs host network cut; see Remaining                                                                                                                                      |
| Manual spot checks                                                                                       |               | PASS              | `spot-*`, `spot/`                | See below                                                                                                                                                                  |

AI calls: roughly 25 production model requests across both passes (two
onboarding plans per pass, Coach, weekly reviews, plan-adjust previews,
milestone suggestions). No purchase, restore, or report was sent.

## Fixes

### Product bug: Today tab badge shown on the focused Today tab

Plan A6 says the Today badge is hidden while Today is focused. After a theme
change in Profile > Appearance (Dawn or Violet), closing Profile left the
"2" badge on the selected Today tab until the next tab switch. Reproduced
twice in `maestro-engagement` screenshots and in isolation
(`spot/badge-before-fix.png`).

Cause: the badge option used `navigation.isFocused()`, which also requires
the root stack route to be focused. Tab options are recomputed only when the
tab navigator re-renders; the theme change re-rendered it while the Profile
modal covered the tabs, so `isFocused()` read false and the stale badge
stayed after the modal closed.

Fix: `client/lib/tab-badge.ts:25` adds `isSelectedTab(tabState, routeKey)`,
which reads only the tab navigator's own state, and
`client/navigation/MainTabNavigator.tsx:393` uses it. Unit tests in
`client/lib/__tests__/tab-badge.test.ts` (selected-tab read, modal-over-tabs
regression, out-of-range index). Verified on the rebuilt app with the same
theme-toggle sequence.

### Stale flows (intentional UI changes), behavioral intent kept

- `qa/maestro-later-bets.yaml`: rewritten. The year recap and witness entries
  moved from Profile to Journey's "Stories & Support"; Private iCloud Backup
  moved under Profile > Privacy & Data. The free year-recap check now matches
  the current teaser design (opening card plus "See the full year story with
  Premium") and asserts that the rhythm, resilience, and closing cards do
  not leak before following the teaser to the paywall.
- `qa/maestro-coach-live.yaml`: the lobby has one primary entry, so plan
  adjustment opens via "Start a conversation with Coach" and the sheet chip
  (label "Request a previewed plan adjustment"; the old "Adjust my plan" tap
  target no longer exists). Response controls render after the stream
  completes, so the flow now waits for "Stop Coach response" to disappear
  before asserting Copy/Helpful/Report (it asserted on the first chunk).
- `qa/maestro-ambient-coach.yaml`, `qa/maestro-coach-live.yaml`,
  `qa/maestro-coach-offline.yaml`: run new helper `qa/_pending-today.yaml`
  first. The progress line and habit-card "Ask Coach" link show only while a
  habit is pending; a finished day shows the Day complete card instead, and
  the preceding flows end with the habit done.
- `qa/maestro-ai-onboarding.yaml`, `qa/maestro-accessibility.yaml`: entry is
  "Make my plan" (was "Start your journey"); declining consent now shows "AI
  coaching is off" and offers "Set it up myself" (review fix D9 replaced
  "Setup is paused"), both asserted. iOS 26 appends the placeholder to the
  onboarding composer's label, so its selector gained `.*`.
- `qa/maestro-engagement.yaml`, `maestro-rewards.yaml`,
  `maestro-widget-prepare.yaml`, `maestro-widget-verify.yaml`: the AI-free
  starter plan is now "My Future Self" (was "Momentum Builder"). The flows
  run on the new `qa/_self-setup-plan.yaml` helper.
- `qa/maestro-engagement.yaml`: the Dawn section tapped the switch once and
  assumed the milestone unlock had already applied Dawn. It does not (the
  reward is opt-in), so the old flow actually turned Dawn on while its
  screenshot was named "back to midnight". It now asserts the switch off,
  turns Dawn on (asserted), captures Today in Dawn, and turns it back off
  (asserted).
- `qa/maestro-widget-verify.yaml`: the reconciled row's label is
  "... completed. Undo, 2-minute version" (was ", 2-minute vote"). Also
  documents the working injection path (below).
- `qa/maestro-year-recap.yaml`: strengthened. The old Share-only assertions
  also pass for a free user (who sees the opening card, the same Share
  button, and a teaser), and the first-pass "card two" screenshot shows
  exactly that. It now asserts the teaser is absent and the rhythm card
  appears after a swipe.

- `qa/maestro-roadmap-completion.yaml`: the milestone modal shows the local
  "Deepen <milestone>" proposal instantly and swaps in a Coach suggestion
  when AI consent is on (`client/lib/milestone-proposal.ts`). The first pass
  caught the local one; the final pass caught "Coach suggestion. Celebrate
  small wins each evening". The flow now accepts either source and taps
  "Add next milestone: <any>", still requiring the proposal before the gate
  and the contextual paywall after Add.
- `qa/maestro-engagement.yaml`, `maestro-coach-responsiveness.yaml`,
  `maestro-marketing-shots.yaml`: waited for a coach bubble ending in "?" as
  the stream-complete signal. A valid weekly review ended "...one point of
  friction you noticed." and timed out. They now wait for "Stop Coach
  response" to disappear and assert the response controls, which render only
  on a finished turn.

### Harness fixes

- `qa/seed_history.py`: tolerates a plan with no `dailyLogs` key yet; marks
  LAST week's recap seen (the recap's week key is last Monday, see
  `client/lib/progress.ts:526`), so the observation card can take the slot
  as the script intends.
- `qa/prepare-roadmap-completion.py`: also settles the reminder primer and
  widget hint, which outrank the second-persona invitation in Today's single
  optional slot (plan A5). A 30-day user has long since answered both.
- `qa/seed_premium.py`: docstring now states the simulator limitation below.
- `qa/seed_marketing.py`: docstring names the actual persona; seeded note
  copy no longer uses an em dash.
- App Group injection: `simctl spawn defaults write
group.com.resolutioncompanion.app` writes a per-device domain the app never
  reads, so the vote stayed pending. Writing to the App Group container plist
  path (`xcrun simctl get_app_container <udid> com.resolutioncompanion.app
group.com.resolutioncompanion.app` + `/Library/Preferences/
group.com.resolutioncompanion.app`) is consumed on launch. The CLAUDE.md
  note describing the bare-domain command should be updated.

## Remaining failures and blocked checks

- `maestro-year-recap.yaml`: BLOCKED (environment). The simulator has no
  StoreKit entitlement, and the launch check correctly treats StoreKit's
  completed, empty entitlement list as account truth and clears the seeded
  local Premium flag (`client/lib/subscription.ts`, review fix B; the
  subscription-status flow asserts this same settle-to-free behavior). The
  seeded Premium state lasts only until that check lands, so premium-only
  content cannot be verified here without a real or StoreKit-test
  entitlement. The free path (teaser, no leaked cards, paywall) passes in
  later-bets.
- `maestro-coach-offline.yaml`: BLOCKED (environment). The simulator shares
  the host network; cutting connectivity would mean changing host network or
  firewall settings, which is out of bounds for this run.
- Home Screen widget check-off: not performed. Adding a widget means editing
  the shared simulator's Home Screen in SpringBoard edit mode next to other
  apps' delete controls. The app side (pending vote reconciled into the
  store and shown on Today) passes via widget-prepare/verify; the declutter
  run verified a real medium-widget check-off on a signed build.

## Manual spot checks (screenshots under `spot/` and the `spot-*` directories)

- Today with two pending habits: both "Mark Complete" buttons identical and
  filled, no milestone label, progress line "0/2 done · Day 1", one optional
  card (reminder primer) below the habits.
- Journey: no selected-day list by default; selecting Tuesday shows its two
  habits; unchecking one changes the cell to "1 of 2 habits done", re-checking
  restores "2 of 2"; tapping the selected day again clears the list.
- Profile: one grouped Settings list (Apple Health, Daily Reminder,
  Appearance, Widget & Siri, Privacy & Data, About), one upgrade row above My
  plans, active plan with a checkmark, no "Tap trash icon" hint. Switching to
  a second plan moves the checkmark and Today shows "Becoming Steady Reader"
  with its habit; switching back restores the original plan.
- Paywall: no doubled top inset; title directly under the close button;
  yearly $24.99 and monthly $2.99 shown; price in the CTA.
- Dawn after unlock (Profile > Appearance): Today, cards, and buttons legible;
  violet accent and Aurora icon toggles apply.

## Observations (not changed)

- On a day with a "protect-pattern" observation, the "Your coach noticed"
  card sits above the habits, so Mark Complete starts near 525pt for an
  engaged user (`final2-13-engagement/.../18b-today-dawn.png`). Plan A2
  keeps that card; A1 says habit first. Worth a product call.

- The Today tab badge is not exposed to accessibility (the tab's label is
  fixed to "Today tab"), so VoiceOver users do not hear the remaining count.
  Adding it to `tabBarAccessibilityLabel` would also need flow selectors to
  accept a suffix.
- The Coach sheet's evidence card shows a "0%" month consistency on day one,
  while Journey uses "Day N" until seven planned days (plan B3 covers Journey
  only).

## Verification of code changes

`npm run check:types`, `npm run lint`, `npm run check:compiler` (42 files,
no bailouts), Prettier on changed files, and `npm test` (59 suites, 495
tests) all pass. Node 22 from Homebrew fails to load (`libsimdjson`); checks
ran on the default Homebrew node.
