# Onboarding bottom spacing and keyboard dismissal — September 7, 2026

The chat composer and review Start button were too close to the screen bottom. React Native KeyboardAvoidingView in padding mode overwrote the root paddingBottom, so the supplied safe-area inset did not take effect.

The safe-area inset is now a separate child below onboarding content. It collapses while the keyboard is visible and returns when the keyboard closes. Scroll views have a bounded flexible viewport; the composer, review footer, and bottom inset do not shrink. The final habit and draft explanation can scroll completely above the footer.

A compact, right-aligned **Hide keyboard** control sits in a normal-flow toolbar immediately above the keyboard during Coach and plan editing. It has a 44-point target, pressed feedback, hit slop, and an accessibility hint. Dismissing leaves entered text intact. The toolbar disappears when the keyboard closes.

An independent UX reviewer found no remaining source-level blocker. Native checks used a dedicated iPhone 17e simulator on iOS 26.5 with synthetic data. Standard and extra-extra-large preferred text were checked. Evidence confirms the three-habit final card, last reminder field, restored bottom inset, and Start button remain reachable. The edited reminder persisted after relaunch. In Coach, hiding the keyboard retained an unsent multiline message. Welcome spacing after dismissal was also checked.

TypeScript, lint, static accessibility checks, formatting of the changed files, and all **40 Jest suites / 286 tests** passed. Production source hashes are recorded in `build/testflight-1.4.0-94/source-hashes.json`. Screenshots and validation details are in `build/onboarding-bottom-2026-09-07/`.

Scope: the two onboarding layout components and iOS build metadata. Native QA covers this simulator and these text sizes; it is not an exhaustive device or Android certification. TestFlight availability is recorded separately in `testflight-1.4.0-94.md` after Apple processing.
