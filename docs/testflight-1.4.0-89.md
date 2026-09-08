# TestFlight 1.4.0 (89)

The UX update is available to the existing **Team (Expo)** internal testing group.

Apple verified the build as **VALID** and **IN_BETA_TESTING** after upload on September 5, 2026 at 5:04 p.m. Pacific. The What to Test notes were added directly through App Store Connect and read back successfully.

- [Open TestFlight in App Store Connect](https://appstoreconnect.apple.com/apps/6757996708/testflight/ios)
- [Upload receipt](https://expo.dev/accounts/bpollak99/projects/evolve-app/submissions/860e52da-7943-4b7e-b1bb-cf6c7c9c1b50)
- [Release evidence](../build/testflight-1.4.0-89/release.json)
- [Testing notes](../build/testflight-1.4.0-89/what-to-test.txt)
- [Implementation and simulator validation](ux-implementation-2026-09-05.md)
- [Signed IPA](../build/ios-testflight-1.4.0.ipa)

The local production build succeeded. The signed app and widget both report **1.4.0 (89)**, and all 31 changed client source files matched the validated implementation. Prior validation passed **40 suites / 278 tests**, type checking, lint, static accessibility, and native iPhone simulator flows.

Archive SHA-256: `dc1121e38599535f977345e77e4e40055e0e1bef8fc72c5bfd262f3ada3720b0`.

Expo Doctor reported three available patch updates (Expo, expo-constants, jest-expo); the production build used the tested lockfile without dependency changes. The build itself succeeded. Expo’s optional testing-notes submission field was plan-gated, so the upload was submitted without it and the same notes were saved directly in Apple’s system.

This was an internal TestFlight release. External beta review and App Store review were not submitted. The published App Store version remains 1.3.6. The new client was validated against the existing server; the separate 1–5 suggestion server change remains local.
