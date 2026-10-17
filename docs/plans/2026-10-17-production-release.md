# Resolution Companion 1.5.0 production release

Accepted intent: Brett requested "I wanna push the latest version live" on
2026-10-17. This authorizes publishing the latest reviewed app and server work,
submitting the iOS app for App Review, and automatic release after approval.

## Scope and plan

- Release source: `claude/review-fixes-2026-10-13` at `ef6ae49`, including the
  final October 14 affordance pass after TestFlight build 105. Use the existing
  clean Developer checkout; GitHub remains the source of truth.
- Re-run typecheck, lint, React compiler checks, tests, release checks, and server
  build. Retain the committed October 14 simulator regression evidence and note
  its blocked Premium/offline checks. No new feature implementation is planned.
- Build a signed 1.5.0 iOS app locally with a new build number above 105. Verify
  matching app/widget versions and production API configuration before upload.
  Version 1.5.0 exceeds the currently released 1.4.1, so its train is open.
- Publish the reviewed server source through main, verify deployment and live
  health/auth behavior, and preserve rollback commit `a5b9a2a`.
- Create the 1.5.0 App Store release from existing approved listing metadata,
  attach the new build, add factual release notes, and submit with automatic
  release after Apple approval. Retain existing prices and product setup.
- Verify actual Apple processing and submission state. Record that submission
  is not public availability; verify the storefront before claiming it is live.

## Known verification limits

October 14 native verification is recorded in
`2026-10-14-native-regression.md` and `2026-10-14-ui-declutter.md`.
Premium-only year recap and a host-network offline flow were blocked by the
simulator environment. Physical iPhone behavior was not independently verified.

## Release preflight finding

The October 17 dependency audit reports critical advisories in `proxy-addr`
(server proxy/IP parsing) and `shell-quote` (development tooling), plus a high
advisory in server `compression`. Apply only compatible updates for those three
packages in the lockfile, retain the native framework versions, then repeat the
checks before build/upload. Broader framework/tooling advisories remain outside
this release and must be reported separately rather than applying major upgrades.

## Verified release outcome (2026-10-17)

- PR #27 merged: https://github.com/bpollak/resolution-companion/pull/27.
  Release source `4dab2b3`; production merge `6556c94`.
- 59 suites / 504 tests, types, lint, React Compiler guard (43 files), full
  formatting, release check, and server production bundle pass. GitHub CI passed.
  The independent report-only review found no release blockers.
- Compatible lockfile patches: proxy-addr 2.0.8, shell-quote 1.12.0,
  compression 1.8.2. Audit: zero critical, 32 high, 22 moderate findings remain;
  broader framework/tooling upgrades were not included.
- Local archive compiled successfully. EAS export reproduced the documented
  ambiguous-certificate issue; the completed archive exported with the existing
  matching certificate explicitly pinned, using a temporary keychain. Original
  keychains were restored and temporary certificate/profile downloads removed.
- App and widget verified at **1.5.0 (106)**. The signed JavaScript bundle
  contains the expected production domain and API configuration. Live requests
  reject missing/invalid keys (401) and accept the real key through authentication
  (400 for an intentionally empty request; no model invocation).
- Archive: `~/Library/Developer/Xcode/Archives/2026-10-17/ResolutionCompanionAI 2026-10-17 09.25.31.xcarchive`.
  IPA: `build/ios-local.ipa`.
  SHA-256: `4d640fc02abcf174afc319edff48175fd9ae9037291d84d45035110247485c99`.
- EAS upload: `f5c78648-1899-4dd3-a532-6300df8ca289`.
  Apple build `3af2c4e1-aee9-4cef-9610-0cdfee57b210` is `VALID` and
  `APP_STORE_ELIGIBLE`; the release relationship points at build 106.
- Brett confirmed accepting Apple's updated Developer Program agreement.
  The original local API key could not create releases; the existing EAS
  App Manager submission credential completed the authorized submission.
  No permission or API-key role was changed.
- App Store version `a326aeca-58a6-459d-9708-2d7aa56c31db` and review
  `94d83e5a-6a1b-4620-a3f8-30455141d5b0` both read back as
  **WAITING_FOR_REVIEW** at 2026-10-17 09:34 PT. Release type is
  **AFTER_APPROVAL**. Existing listing, screenshot sets, prices, and review
  contacts were retained; release and reviewer notes were saved.
- Railway deployment `f56afbb9-0b93-4ed6-bff9-7bae5e75cba4` succeeded for
  `6556c94` on the service owning `resolutioncompanion.com`. Cache-busted
  health, home, privacy, terms, release notes, and release JSON return 200.
  Authentication checks passed again after deployment.

The iOS update is submitted, not publicly available yet. Apple approval is
outstanding. The public release entry is marked submitted, never released.
No physical-device validation or previously blocked Premium/offline native
check is claimed. No trial, pricing, or In-App Event was created.
