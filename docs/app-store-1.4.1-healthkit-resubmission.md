# App Store 1.4.1: HealthKit rejection and resubmission

## Rejection

Apple reviewed version 1.4.1 (95) on September 9, 2026 and rejected it under guideline 2.5.1 because the UI did not clearly identify its HealthKit functionality. The App Review page lists only this issue. The approved 1.4.0 remains available.

Review record: https://appstoreconnect.apple.com/apps/6757996708/distribution/reviewsubmissions/details/3b800ec2-3ef2-4c33-975c-34ee6f0aa23a

## Cause and changes

The installed react-native-health package copies native methods with Object.assign. React Native's bridgeless native module exposes lazy, non-enumerable methods, so that copy loses initHealthKit and the app treated HealthKit as unavailable. This also hid the old per-habit Health controls. The issue was reproduced in the native simulator and is consistent with the package's upstream issue 395: https://github.com/agencyenterprise/react-native-health/issues/395.

The adapter now reads and binds the four used native methods explicitly. A regression test reproduces non-enumerable methods and verifies initialization and a step-count read. Existing unsupported-platform behavior remains a no-op.

Profile > Settings now includes Apple Health, an explanation of the optional HealthKit integration, the three read categories and completion rules, privacy and permission guidance, and direct links to each habit. The habit editor identifies Apple Health and HealthKit before its Off / Workout / Steps / Mindful controls. The disclosure remains visible before permission and does not depend on the module being available. Copy now accurately says checks happen when opening or returning to the app, rather than claiming background completion.

The App Review notes explain this path and include the native-module correction. What's New includes the Apple Health improvements. The existing listing name and automatic release after approval are retained.

## Validation

- Typecheck, lint, static accessibility checks, and 41 Jest suites / 287 tests passed.
- Native iPhone 17e / iOS 26.5: Settings disclosure before onboarding/authorization; direct habit navigation; native Health permission sheet; declining access; saved Steps selection and Off persistence; manual completion and Undo.
- Simulator verification uses the existing 1.4.1 simulator native shell with a fresh production JavaScript bundle from the final source. Native dependencies are unchanged. No physical-device recording or real health records were used.
- Evidence and final client source hashes: build/healthkit-review-20260909/.

## Build status

Build 96 contained the first disclosure change and was not submitted after testing exposed the native-module issue. Build 97 included the final fix but failed because the React Native dependency download returned a transient upstream error body rather than a gzip archive. A replacement official release archive was obtained from the Google-hosted Maven Central mirror and matched Maven Central's published SHA1, 6fa3428d0e143d5fd15bfef43223b7daf0610ab5. SHA256: 702dfc90aed09da439b37c6f15266643259c198fed5c0052e23439680e362b5d.

Build 98 uses that validated release archive via RCT_USE_LOCAL_RN_DEP. All 86 production client files in its actual build directory match the simulator-tested source hashes. The signed app and widget both verify as 1.4.1 (98). The IPA is 26,914,118 bytes with SHA256 1c372f219919190efb5ac1e161b9bf5ccfa146fe5baff28110c239c4466ed891.


## Resubmission confirmed

On September 9, 2026 at 9:10 AM Pacific (2026-09-09T16:10:55.156Z), App Store Connect accepted the resubmission. Both version 1.4.1 and its review submission read back WAITING_FOR_REVIEW. Build 98 is VALID, App Store eligible, and attached to the version. Automatic release AFTER_APPROVAL remains enabled.

- Build ID: 47b88943-bb14-441c-83f2-5ccffa9c727d.
- EAS upload ID: 8afaa797-e63a-4ebd-9504-854512f57e92.
- Review submission: 3b800ec2-3ef2-4c33-975c-34ee6f0aa23a.
- The rejected item was marked resolved after attaching build 98; the same review submission was submitted again.
- Updated App Review notes explicitly name build 98 and explain the fix and test path. What's New includes the Apple Health improvements.
- Readback evidence: build/healthkit-review-20260909/final-review-state.json.

This confirms submission for review, not approval. The currently approved app remains 1.4.0. No website deployment was performed.
