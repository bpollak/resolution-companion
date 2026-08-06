# Ambient Coach 1.3.6 — Restart Handoff

Last updated: 2026-08-05, after the post-restart completion audit.

## Current outcome

The Ambient Coach implementation and full regression campaign are complete.
The authoritative test matrix has no `PENDING` or `FAIL` rows:

- `docs/full-app-regression-plan-2026-08-04.md`

The release metadata is reconciled and the scoped 1.3.6 change set is staged.
No commit or push has been made. Apple processing/review/release state remains
an authenticated external check; it is not a remaining code or regression bug.

The matrix resolves 60 rows as `PASS` and 11 rows as `EXTERNAL`. The external
rows require paid store entitlements, physical-device services, private iCloud,
Siri/Health conditions, or authenticated provider state. Their shared logic,
privacy boundaries, and available fallback paths have current evidence.

## Final artifacts

Repository handoff copies:

- `build/ios-local.ipa`
  - Version: 1.3.6
  - App build: 84
  - Widget build: 84
  - SHA-256:
    `08b551743c7c25e3716e0e90587f21b4a42db2f493ec0965116e1ac2b95921f7`
  - Deep code signature passed.
- `build/android-local.aab`
  - Version: 1.3.6
  - Version code: 18
  - SHA-256:
    `45773318933587806509ccc0eb465ef8b8de205bb4c46ec3a3af94ce22ac249e`
  - JAR verification passed.
  - Bundletool installed a universal APK generated from this exact AAB on
    `emulator-5554`; Android package metadata confirmed 1.3.6 (18).

The build-number guard now synchronizes the next EAS remote iOS number before a
production build and verifies that the exported app and widget match.

## Final validation already completed

Node 22 in `TZ=America/Los_Angeles` passed:

- Prettier format check, including `.mjs` build scripts.
- TypeScript typecheck.
- Expo lint with zero errors.
- 36 Jest suites / 246 tests.
- Static accessibility check.
- Expo Doctor 18/18.
- Server production build.
- iOS and Android release checks.
- Clean staged-state dependency install (`npm ci`).

The post-restart gate rerun also made format validation order-independent: it
now includes `.mjs` release scripts and excludes generated build directories.

Exact release binaries passed clean install, onboarding, retained-state daily
loop, Today/Journey/Coach, contextual Coach, daily context, plan preview/apply,
edit persistence, completion undo/redo, error recovery, accessibility, large
text, orientation, rapid tab switching, and no-crash checks. Paid-store,
physical-device, iCloud-account, Siri voice, and real Health-sample tests remain
explicit `EXTERNAL` rows rather than inferred passes.

The final Android destructive/offline pass proved:

- Cold launch with Wi-Fi and mobile data disabled.
- Local Today, Journey, context, scrolling, and tab switching.
- Visible `Undo` changed 2/2 to 1/2 and restored the pending action offline.
- `Delete My Account & Data` returned the server-confirmed `Account Deleted`
  result and remained empty after a cold relaunch.

## Product changes to preserve

- Today uses one dominant locally generated signal/evidence surface.
- Contextual Coach uses bounded origin-specific prompts and quieter secondary
  actions; plan tuning appears only where relevant.
- Action and milestone Coach origins are reachable from their product UI.
- Completed actions expose a visible `Undo` cue inside the existing full-row
  checkbox target and retain the accessibility hint.
- Interactive scroll surfaces set `delaysContentTouches={false}` where
  applicable. Existing virtualization, memoized context/derived values,
  buffered streaming, eager tab mounting, and safe navigation settings remain.
- Do not add `animation` to the bottom-tab navigator; it is a known iOS
  black-screen regression.

## Provider state at pause

- Apple: EAS submission `c2d7b6ea-7f3c-4c87-92ed-71fecf0a0db2` finished at
  `2026-08-05T15:14:55.163Z` with no error. Fastlane recorded a successful
  upload of the signed 1.3.6 build 84 IPA to App Store Connect. The submission
  intentionally skipped waiting for build processing, and the available App
  Store Connect browser session requires a fresh interactive sign-in. This
  proves upload acceptance only; processing completion, review availability,
  and release are still unverified external states.
- Google Play: EAS submission `7d08ec28-559a-4553-af85-f2db275d9d78`
  finished at `2026-08-05T15:17:30.853Z` with no error. An independent Google
  Play Publishing API read confirmed closed track `alpha` contains release
  1.3.6, version code 18, status `completed`.
- The repository copy of `public/releases.json` records 1.3.6 as `submitted`
  on 2026-08-05. It must not be changed to `released` until provider evidence
  supports that claim.

## Agent pickup sequence

1. Recheck the artifact copies before doing anything else:

   ```sh
   cd /Users/bpollak/Documents/resolution-companion
   shasum -a 256 build/ios-local.ipa build/android-local.aab
   node scripts/verify-ios-artifact.mjs build/ios-local.ipa
   rg '\| PENDING|\| FAIL' docs/full-app-regression-plan-2026-08-04.md
   ```

2. Confirm Apple build 84 processing/review state in App Store Connect. Report
   the exact state; do not treat upload acceptance as review availability.

3. Google closed testing is already confirmed; do not resubmit Android unless a
   new defect or provider state requires a new build.

4. The scoped release files are staged. Preserve the still-unstaged App Store
   rating/ASO work, broad copy experiments, screenshots, marketing assets, and
   iCloud duplicate files. Do not commit or push unless explicitly requested.

5. The full regression does not need to be repeated for a documentation-only or
   provider-status-only edit. If runtime code changes, reopen the affected rows
   and run the proportional native and automated regressions.

## Temporary workspace

The authoritative build workspace used during the campaign was:

`/tmp/resolution-companion-release-base.zzXukl/resolution-companion-0cacccf46f5eab1c35a99e85dcd5503075c52df3`

It was based on local HEAD
`0cacccf46f5eab1c35a99e85dcd5503075c52df3` plus the scoped release changes.
The repository's staged change set, artifact copies, and the two handoff
documents above are now the durable sources of truth.
