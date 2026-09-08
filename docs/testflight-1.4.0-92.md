# TestFlight 1.4.0 (92) — September 7, 2026

Available to the **Team (Expo)** internal TestFlight group. App Store Connect readback confirmed **VALID** and **IN_BETA_TESTING**. Testing notes were saved and read back.

This build clarifies onboarding as **Talk with Coach → Review your plan**, moves Preview into the header, replaces floating Stop with the composer control, and removes stacked plan actions. Review has one fixed Start button; edits remain protected when returning to Coach. The Coach prompt now hands off to Preview when the habit and recurring days are clear.

The local production build passed app/widget metadata verification at **1.4.0 (92)**. The packaged JavaScript contains the new controls and revised Coach handoff; removed plan controls are absent. Source hashes match the native QA source. TypeScript, lint, formatting, static accessibility, and **40 Jest suites / 286 tests** passed.

Native iPhone 17e / iOS 26.5 checks covered consent, step orientation, Stop/Retry, relaunch recovery, unsent text, draft preservation and update choices, keyboard layouts, larger text, validation, and completion into Today. Persistence readback verified exactly one Friday-only habit and cleared onboarding draft/transcript. Three live synthetic prompt probes and a final native Coach reply verified the conversation-to-review handoff. See [the UX review](onboarding-controls-review-2026-09-07.md) for scope and limits.

- Apple build ID: `f8d29f64-d3f9-4f79-a30b-3c7492d2b96a`
- Uploaded: `2026-09-07T10:56:37-07:00`
- IPA SHA-256: `c5080655b5805a206d2406c3e08ecb624d1340be75b53180f4b71ef166e1a32d`
- [EAS submission](https://expo.dev/accounts/bpollak99/projects/evolve-app/submissions/12514459-d69f-4d56-a5bc-1c5acb1800dd)
- [App Store Connect TestFlight](https://appstoreconnect.apple.com/apps/6757996708/testflight/ios)
- IPA: `build/ios-testflight-1.4.0-92.ipa`
- Evidence: `build/testflight-1.4.0-92/` and `build/onboarding-controls-2026-09-07/`

Release scope: internal TestFlight. No App Store review submission or production server deployment.
