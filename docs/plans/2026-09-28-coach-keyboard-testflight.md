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
