# Native regression run (2026-11-27), 1.7.0 steps release

Run for the plan `docs/superpowers/plans/2026-11-27-steps-release-1.7.0.md`.
Rule for this run, as in October: triage every failure, fix real issues,
never weaken a behavioral assertion in the repo to make a flow pass. No
purchases, restores, submissions, deployments, or merges.

## Environment

- Branch `claude/new-year-2027`. Final pass on the build that includes the
  Profile delete-button fix (the commit after `d9d19bb`); an earlier pass on
  `d9d19bb` is kept as `pass1-1.7.0`.
- Local simulator build (`npm run build:local:sim`), version 1.7.0, production
  env, backend `resolutioncompanion.com`.
- Simulator "RC 1.6.1 QA", iOS 26.5. Maestro, Java 17.
- Evidence under the ignored `build/native-regression-2026-11-27/`
  (`final-1.7.0/` per-flow logs, junit XML, screenshots; `steps-walk-1.7.0/`
  for the live goal walk; `vague-goal-walk/` for the 1.6.1 baseline walk).
- AI flows used the production model through the production server.

## The one pre-deploy substitution

The production server does not have this branch's server changes until the
branch is merged to `main`. Until then extraction returns no `why` and no
`scheduleSource`, so every plan's days read "Suggested: ..." and
`qa/maestro-regression.yaml` (which requires exactly "Every day" for days the
person stated, and no "Suggested:") fails at that step.

The repo flow was left strict. This run used a temporary copy of `qa/` whose
only difference is that one assertion accepting "Suggested: Every day".
**After the server deploys, run the committed `qa/maestro-regression.yaml`
unchanged; it is the check that stated days are credited as stated.**

## Baseline before any change (main 495e928, build 1.6.1 (112))

17 of 18 flows passed; `maestro-year-recap` was blocked by the simulator's
missing StoreKit entitlement (Premium-only content). 624 unit tests passed.

## Results on 1.7.0 (final build)

| Flow                                                                            | Result       | Notes                                                                       |
| ------------------------------------------------------------------------------- | ------------ | --------------------------------------------------------------------------- |
| maestro-regression (fresh install, live AI onboarding, Journey, Coach, paywall) | PASS         | With the pre-deploy substitution above                                      |
| maestro-stateful-regression (tab first tap, undo, 2-minute, editors, relaunch)  | PASS         |                                                                             |
| maestro-ambient-coach                                                           | PASS         | Now also asserts "Help me add a next step" and no adjust chip on a new plan |
| maestro-health-disclosure                                                       | PASS         |                                                                             |
| maestro-subscription-status                                                     | PASS         |                                                                             |
| maestro-coach-live                                                              | PASS         | Now proposes a next step, "Not now", then adds it                           |
| maestro-coach-save-regression                                                   | PASS         |                                                                             |
| maestro-coach-session-regression                                                | PASS         |                                                                             |
| maestro-later-bets                                                              | PASS         | Free user walks the whole year story; no paywall                            |
| maestro-ai-onboarding                                                           | PASS         |                                                                             |
| maestro-accessibility (accessibility-medium)                                    | PASS         |                                                                             |
| \_self-setup-plan                                                               | PASS         |                                                                             |
| maestro-engagement (seeded history)                                             | PASS         |                                                                             |
| maestro-rewards                                                                 | PASS         |                                                                             |
| maestro-coach-responsiveness                                                    | PASS (flaky) | Failed once on the final pass, passed on two recorded reruns; see below     |
| maestro-year-recap                                                              | PASS         | Was blocked in October and at baseline; passes now that the story is free   |
| maestro-january-start (new)                                                     | PASS         | Day-one ask, "Not now", countdown, nothing missed, ask does not return      |
| maestro-delete-only-plan (new)                                                  | PASS         | After the Profile fix below                                                 |

Unit and static gates on the same commit: types, lint, format clean; 1,012
tests pass; `check:a11y` and `check:compiler` pass.

## Live goal walk (plan goal items 1 to 3)

Typed "I want to get healthier this year", then "I am not sure what to do...
Can you help me break it down?". Coach replied with three steps and a short
why each (10-minute walk, regular bedtime, add a fruit or vegetable),
recommended the walk, and asked which fits. Review showed "Start with one
step. The others wait for you in Journey." with the other two saved for
later. Journey showed "Next steps"; "Add to my plan" added the bedtime habit
under the existing milestone and Today showed two habits. In Coach, "Help me
add a next step" proposed "Drink a glass of water" with a preview; Add put it
in the plan and showed a note, not a chat message. The 1.6.1 baseline walk
with the same messages produced one walk habit and broke down the walk.

## Fixes made during the run

- **Product bug: Delete plan unreachable by VoiceOver.** The trash button was
  a Pressable nested inside the plan row's own accessible Pressable; iOS
  exposes only the outer one, so VoiceOver (and Maestro) could not reach
  Delete. `client/screens/ProfileScreen.tsx` now renders the row as two
  sibling buttons. Found by the new delete-only-plan flow.
- **Day one for a plan started on the spot.** A review fix let a plan started
  today before 8:00 AM receive the "Day one" notification. `dayOneFireDate`
  now applies only to plans saved for a later day (start stored at local
  midnight), pinned in `notifications.test.ts`.
- **"0% consistency" on a new plan.** The Coach sheet's evidence card now
  reads "Nothing to measure yet. One small step is enough to begin." until
  there is something to measure.
- **New flow selectors.** `maestro-january-start.yaml` looked for "Start with
  1 habit" (the button reads "Plan it for January 1") and its "nothing
  missed" check matched the milestone's "0 of 21 days done"; it now matches
  day cells only.

## Flaky and unverified

- `maestro-coach-responsiveness`: one failure where the sheet was still open
  after "Close Coach" while a reply had just finished (timing). It passed on
  the previous build of the same Coach code. On this build it failed in the
  full pass, then passed in two recorded reruns; two other reruns ran without
  their result being captured, and a last one failed for an unrelated,
  expected reason (repeated runs had used the free plan's ten check-ins).
  Not fixed.
- Seen in a failure screenshot, not fixed: the new "Add a next step" action
  above the composer sits tight against the last chat bubble. Check on a
  phone and add spacing if it reads as crowded.
- Not run: widget vote injection, roadmap-completion, marketing-shots,
  coach-offline.
- Needs the server deployed: the "why" line under each step, stated days
  shown without "Suggested:", the separate step-suggestion quota.
- Needs a phone: a real purchase and Restore (including after a failed
  validation), notification delivery (day one at 8:00 AM, no second
  notification that morning, reminders after adding a step), the widget on
  January 1, overnight rollover with the app in memory, VoiceOver on the plan
  row, the first-weeks share card layout.
