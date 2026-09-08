# App Store listing update: 1.4.1

Submitted September 8, 2026. App Store Connect confirms **1.4.1 Waiting for Review** and **1 Item Submitted**. Automatic release after approval is enabled.

Review record: https://appstoreconnect.apple.com/apps/6757996708/distribution/reviewsubmissions/details/3b800ec2-3ef2-4c33-975c-34ee6f0aa23a

Build ID: `52f8ebe7-8016-4834-abdf-8223b032db19`.

## Listing

- Name: Resolution: Habit Tracker
- Subtitle: AI Coach & Daily Goal Planner
- Keywords: routine,accountability,motivation,self,improvement,identity,reminder,progress,consistency,journal
- Promotional text: Build habits that fit your life. Set goals, track small daily actions, and get help from an AI coach when you feel stuck. Start free, with no account required.
- What's New: Resolution Companion has a new App Store name: Resolution: Habit Tracker. This update refreshes our listing to make our habit tracking, daily planning, and AI coaching features easier to find.

The title, subtitle, and keywords prioritize relevant habit, goal, routine, and coaching searches without repeating terms across fields. These are relevant search terms, not independently verified search-volume rankings. Promotional text supports conversion; Apple states it does not affect search ranking.

## Source and validation

The release source was copied over Tailscale from the work Mac's current Documents checkout into a separate release directory. The original dirty checkout was preserved. Unmodified iCloud placeholders were restored from that checkout's Git HEAD, 2988352. All 86 production client source hashes match the source manifest for App Store build 94.

The app's behavior and production client source are unchanged. The release changes expo.version to 1.4.1, synchronizes the app/widget build number, and adds a release-note entry.

- Type checking: passed.
- Lint: passed.
- Jest: 40 suites, 286 tests passed.
- Accessibility static checks: passed.
- Release notes validation: passed.
- Signed IPA: app and widget both verified at 1.4.1 (95).
- Production bundle: expected onboarding/recovery text and production domain verified.
- IPA SHA256: `6d0bc80926b48e206ef8112737edfe1e04763821157ea8191244bd56f30f2ddd`.
- Upload: successful. EAS submission ID `49a17da9-a1e9-4ec3-ab8f-e17406fe1c9c`.
- Simulator: local build 1.4.1 (95) installed over the existing QA app and launched successfully; the existing Friday Reader plan rendered on Today.
- App Store Connect: name and metadata submitted with build 95; version 1.4.1 is Waiting for Review.

The local production build runs on the work Mac in /Users/bpollak/dev/resolution-release-1.4.1. This Mac holds a separate synced source copy. No cloud compilation or website deployment is part of this release.

## References

- https://developer.apple.com/app-store/search/
- https://developer.apple.com/app-store/product-page/
- https://developer.apple.com/help/app-store-connect/update-your-app/create-a-new-version
