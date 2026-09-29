# Coach keyboard fix and TestFlight

Accepted scope: Brett requested "Fix and deploy to TestFlight" on September
28, 2026 after the native regression reproduced the obstructed Coach composer.

## Plan and acceptance

1. Move the fixed sheet-height constraint onto the keyboard-avoiding container
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
