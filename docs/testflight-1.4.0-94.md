# TestFlight 1.4.0 (94) — September 7, 2026

Available to the **Team (Expo)** internal TestFlight group. App Store Connect readback confirmed **VALID** and **IN_BETA_TESTING**. Testing notes were saved and read back.

The onboarding composer and Start button now respect the bottom safe area. The last habit can scroll fully above the review footer. A compact **Hide keyboard** control is available while typing in both Coach and plan review; it closes the keyboard while retaining entered text.

Native iPhone 17e / iOS 26.5 checks covered a long three-habit plan, the final reminder field, keyboard opening and dismissal, standard and extra-extra-large preferred text, an unsent Coach message, and the edited reminder surviving relaunch. TypeScript, lint, changed-file formatting, static accessibility, and **40 Jest suites / 286 tests** passed. An independent UX review found no source-level layout blocker. See [layout review and evidence](onboarding-bottom-spacing-2026-09-07.md).

The local production artifact passed app/widget verification at **1.4.0 (94)**. Its packaged JavaScript contains Hide keyboard and the existing two-step onboarding controls. Production client hashes match the source used for native QA. Compared with build 92, only OnboardingScreen and OnboardingPlanReview changed; the other 84 production client source files are unchanged.

- Apple build ID: `87d31e1e-961c-4d18-bbae-1fc7d6eabffa`
- Uploaded: `2026-09-07T11:41:57-07:00`
- IPA SHA-256: `1216afcb2af470a899d9903c2eb99ffb239892a81de50e0337a30aa1d31bb9a4`
- [EAS submission](https://expo.dev/accounts/bpollak99/projects/evolve-app/submissions/a89f6cd7-8326-4e59-9294-cc01bb23ad26)
- [App Store Connect TestFlight](https://appstoreconnect.apple.com/apps/6757996708/testflight/ios)
- IPA: `build/ios-testflight-1.4.0-94.ipa`
- Evidence: `build/testflight-1.4.0-94/` and `build/onboarding-bottom-2026-09-07/`

Release scope: internal TestFlight. No App Store review submission or production server deployment. Native checks cover the stated simulator and text sizes, not every device or Android.
