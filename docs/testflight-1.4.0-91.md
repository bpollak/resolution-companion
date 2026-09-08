# TestFlight 1.4.0 (91)

Available to the existing **Team (Expo)** TestFlight group. Apple processing is **VALID**, with internal state **IN_BETA_TESTING**. Uploaded September 6, 2026 at 10:00:34 a.m. Pacific. Testing notes were saved to Apple and read back successfully.

This release makes AI Coach the onboarding entry, replaces the initial plan form with a summary and optional editing, preserves drafts through interruptions, and gives new users a clear first scheduled day. [UX review and native verification](onboarding-ux-review-2026-09-06.md).

- Version/build: **1.4.0 (91)**; app and widget match.
- Apple build ID: `d9d27756-f23f-4fd1-a1f6-b5ce21ce636c`.
- [EAS submission](https://expo.dev/accounts/bpollak99/projects/evolve-app/submissions/1a7faca6-94ad-4e19-ac5c-a4489e7124e5).
- [App Store Connect TestFlight](https://appstoreconnect.apple.com/apps/6757996708/testflight/ios).
- [Signed IPA](../build/ios-testflight-1.4.0-91.ipa).
- SHA-256: `e5be01d3a102fd170dda55963ec183d388ca63b9674e841864a22db10cd54534`.
- [Apple processing evidence](../build/testflight-1.4.0-91/apple-status.json).
- [Verified testing notes](../build/testflight-1.4.0-91/testing-notes-proof.json).
- [Packaged UI text checks](../build/testflight-1.4.0-91/production-bundle-proof.json).

Verification: typecheck, lint, static accessibility checks, 40 suites / 286 passing tests, and a native iPhone 17e walkthrough. The signed production bundle contains the new plan-return, first-day, and paused-consent text; the removed manual entry labels are absent.

The public App Store remains on 1.3.6 (88). This release is in internal TestFlight; external beta submission has not been made. The existing production API was used with a compatible proposal request.
