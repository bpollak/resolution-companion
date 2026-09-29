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
