# Coach keyboard fix and TestFlight

Accepted scope: Brett requested "Fix and deploy to TestFlight" on September
28, 2026 after the native regression reproduced the obstructed Coach composer.

## Plan and acceptance

1. Move the fixed sheet-height constraint outside the keyboard-avoiding container
   so its inner conversation and composer can shrink when the keyboard opens.
   Account for the sheet's screen position when calculating keyboard overlap.
   Preserve tall initial presentation, smaller detent, draft text, streaming,
   and close-to-save behavior.
2. Re-run the existing failing typed-follow-up regression with the software
   keyboard visible. Inspect screenshots, and verify save/reopen, fresh session,
   and the smaller sheet/large-text layout. Run automated checks.
3. Commit and push the source branch, synchronizing the next iOS build number.
   Build a signed production IPA locally, verify app/widget versions, and upload
   to TestFlight. Keep 1.5.0 release notes in draft; uploading to TestFlight is
   not an App Review submission.
4. Verify Apple processing, beta group assignment, and tester availability.
   Do not merge main or deploy the website as part of this TestFlight request.

The failing native flow and evidence are in
`docs/plans/2026-09-28-native-regression.md`. No new native dependency is needed.

## Implementation

The native form sheet retains an explicit outer height. Its keyboard-avoiding
view and inner content now flex within that constraint, allowing the conversation
area to shrink while the composer remains visible. Clipping prevents scrolled
chat text from painting underneath the composer.

On iOS, keyboard presentation expands the native sheet without a detent-change
event. Keyboard visibility therefore temporarily uses the full safe-area height;
hiding it restores the selected detent. The keyboard offset accounts for the
sheet's position in screen coordinates. No messaging, persistence, or entitlement
logic changed.

## Verification before production build

- 45 Jest suites / 319 tests pass under Pacific time.
- TypeScript, Expo lint, Prettier, release checks, and server bundling pass.
- Native small-detent test passes, including a real typed message sent while
  the software keyboard is visible. The screenshot verifies the header,
  conversation area, composer, and Send button remain above the keyboard.
- Evidence: `build/native-regression/coach-small-final.xml` and its screenshot
  directory. Normal and accessibility-size full-session flows are rerunning
  against the final source before upload.
- Saved-session assertions now scroll to the follow-up message, accommodating
  variable AI response length and larger system text without skipping validation.

Target: 1.5.0 (99). Apple currently lists 1.4.1 as released, so the 1.5.0 train
is open. Upload only to TestFlight; leave public release status in draft.

## Final regression and build evidence

Final source passes the full session flow at normal text (55 seconds) and
accessibility-medium text (59 seconds), plus the smaller-detent keyboard flow
(24 seconds). Evidence is under `build/native-regression/coach-v4-normal`,
`coach-v4-large-restored`, and `coach-small-final`, with JUnit XML beside those
directories. Screenshots confirm the composer and Send button are above the
software keyboard. The small-detent run also returns to its original smaller
height after sending. The original simulator data and `large` text setting
were restored and its AsyncStorage manifest matches the pre-test backup.

An intervening large-text run exhausted the local fixture's free check-ins;
restoring the original simulator fixture allowed the complete flow to pass.
No entitlement logic was changed.

Build 99 stopped before compilation because Xcode selected a different local
Apple Distribution certificate from the EAS profile's iPhone Distribution
certificate. Build 100 archived successfully with
`GYM_CODE_SIGNING_IDENTITY=B7361570C46DD775268CEEF81EAC8244F90F48E3`, then hit the
same ambiguity during export. Apple's API key could read profiles but could
not create replacements; no new profile or certificate was created.

Recovery used the existing EAS credentials in a temporary keychain and pinned
the same fingerprint in `ExportOptions.plist` as `signingCertificate`. The
completed build 100 archive exported successfully without recompiling. The
temporary keychain was removed and the original keychain search list restored.
For future local builds with multiple distribution certificates, pin the
matching certificate in both archive and export stages.

- Compiled source: `257d59919bfb5a79b1b600a45304ffd452327ace`, pushed before build.
- Archive: `~/Library/Developer/Xcode/Archives/2026-09-28/ResolutionCompanionAI 2026-09-28 22.23.15.xcarchive`.
- IPA: `build/ios-local.ipa`; app and widget verified at **1.5.0 (100)**.
- SHA-256: `aff2cfb35596f7057e4785a076e434534d98c512c72de249a4bb406295a7a3de`.
- Upload: EAS submission `5c0b1d11-e76e-4bbb-b489-9afd3e42eb81`.

Expo Doctor reported three available patch updates (Expo, expo-constants,
jest-expo). The tested dependency lockfile was retained. This advisory did not
block native compilation or export.

## TestFlight delivery confirmed

Apple accepted the upload and processed **1.5.0 (100)** successfully:

- Build ID: `0e23c5c2-c0e1-4e80-80c9-feb69665ff59`.
- Processing state: `VALID`.
- Internal state: `IN_BETA_TESTING`.
- Build 100 appears in Team (Expo)'s builds; that internal group has access to
  all builds. Brett remains a member with tester state `INSTALLED`.
- English What to Test notes were saved for the keyboard, detents, larger text,
  saved-session reopening, and new-session isolation checks.
- External state is `READY_FOR_BETA_SUBMISSION`; no external Beta App Review or
  App Store review was requested. The public 1.5.0 release entry remains draft.

Status was verified through live App Store Connect API reads. Browser sessions
required fresh Apple sign-in, so no tester-facing phone installation or physical
iPhone behavior is claimed. The internal group assignment confirms access;
Brett's next check is Update in TestFlight.

The signed IPA and archive are preserved. Temporary credential downloads and
the temporary export keychain were removed. Website/server deployment and
merging main remain outside this request.
