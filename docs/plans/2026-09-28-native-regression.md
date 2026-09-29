# Native regression run

Brett requested the simulator UI regressions on September 28, 2026 after
the automated suite passed on consolidated commit `9f3c140`.

## Plan

Install Java and Maestro locally. Preserve the installed simulator app and
its data before fresh-install testing. The installed native shell reports
1.5.0 and includes ExpoClipboard; native dependencies and module sources on
the consolidated branch match the original 1.5 release branch. Rebundle
current source into a copy of this shell, install it, and execute native UI
flows. This verifies current JavaScript on an existing native shell; it is
not a new native compilation or release artifact.

Run fresh onboarding, completion/undo, first-tap tabs, editor persistence,
Coach, and paywall checks where the simulator supports them. Record failing
assertions with screenshots and distinguish stale selectors from product
failures. Correct stale test selectors against observed UI without weakening
behavioral expectations. No purchases, submissions, or deployments.

The configured backend is production. Use synthetic test input only; network
dependent AI and StoreKit checks will be reported separately from local UI
behavior. Preserve evidence under ignored `build/native-regression/`.

## Results

Run on the iOS 26.5 simulator with Maestro 2.10.0 and Java 17. Application
source remains `9f3c140`; subsequent changes are test flows and this record.
The installed 1.5.0 shell was copied and bundled with current production
JavaScript using `expo export:embed --dev false --bytecode`. EAS production
API authentication was supplied to that build without changing source.

| Check | Result | Evidence under `build/native-regression/` |
| --- | --- | --- |
| Fresh install, live AI onboarding, plan preview/approval, completion, Journey, Coach quick read, annual/monthly paywall prices | PASS | `fresh-install-v4.xml` |
| First-tap tabs; full/2-minute completion and undo; milestone/action/anchor edits; cold-relaunch persistence | PASS | `stateful-v3.xml` |
| Live Coach response, copy/helpful controls, typed follow-up | FAIL at follow-up send | `coach-session.xml` |
| Coach close-to-save, saved transcript, new-session isolation | PASS | `coach-save.xml` |
| HealthKit disclosure, privacy explanation, direct habit editor, all options, saving Off | PASS | `health.xml` |
| Accessibility-medium text: entry, orientation requests, onboarding, consent decline and paused setup | PASS | `accessibility-v2.xml` |

### Open regression: Coach composer hidden by the keyboard

After opening Coach from the tab, sending a suggested prompt, and typing a
follow-up, the iOS keyboard covers both the composer and Send button. The
typed message remains unsent. Maestro's tap at the Send button's reported
position hits the keyboard's Return key and adds a newline to the draft.

The hierarchy records the keyboard starting at y=539, the input at y=714–791,
and Send at y=747–791 (402×874 logical screen). The screenshot confirms this
is visible obstruction, not a missing text selector. Input value readback
contains the full synthetic follow-up plus the unexpected newline.

- Failing flow: `qa/maestro-coach-session-regression.yaml`.
- Screenshot: `build/native-regression/coach-session/2026-09-28_215053/coach-session-regression/screenshots/step-023-assertCondition-You_.breakfast_bowl.png`.
- Hierarchy: matching JSON under that run's `screen-hierarchy/` directory.
- Investigate `client/screens/CoachSheetScreen.tsx`: its fixed-height inner
  sheet sits inside `KeyboardAvoidingView`. This is a likely contributor,
  not a verified fix. No application code was changed during this test task.

The separate save/reopen regression passes using a suggested prompt without
the keyboard. It does not clear or replace the failing typed-follow-up check.

### Test maintenance

Updated the 1.5 entry label, the iOS TextInput placeholder selector, scrolling
to the completed habit, and the replacement Day complete card. Editor input
selectors now explicitly distinguish title-case input labels from uppercase
headings; the old case-insensitive selector tapped the heading and never
focused the input. Optional celebration dismissal now checks visibility
before tapping. None of these changes bypasses the failing Coach behavior.
The large-text flow now scrolls to the paused-setup explanation, which is
below the initial viewport at the tested accessibility font size.

### Scope

This is current JavaScript running in an existing native shell, not a fresh
native compilation. AI calls use the live backend; the local PR #25 server
changes remain undeployed and were covered by the automated suite separately.
No purchase, health-record read, push, deployment, or Apple submission occurred.
Physical-device notifications, purchases/restoration, and real HealthKit
activity remain outside this simulator run.

The original simulator app data was backed up before clear-state tests and
restored afterward. System content size was restored from accessibility-medium
to its original `large` setting. The current-source app bundle remains installed;
the original native app copy and all test evidence remain under the ignored
evidence directory.
