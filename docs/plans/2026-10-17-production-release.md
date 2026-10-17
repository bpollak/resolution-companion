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
