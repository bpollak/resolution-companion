# Latest app screenshots on the website

Accepted intent: Brett asked to update the website with the latest screenshots
on 2026-10-17. This authorizes replacing the website gallery and publishing it.

## Plan and acceptance

- Capture the current 1.5.0 UI from the latest committed JavaScript in a native
  simulator shell. Use an isolated screenshot simulator and synthetic demo data;
  preserve the shared simulator and all existing app data.
- Replace the four existing Plan / Today / Journey / Coach gallery images with
  new versioned assets. Retain the existing layout, navigation, and product copy.
  Label the gallery as a version 1.5 preview while the public App Store release
  remains 1.4.1. Do not alter App Store screenshots or its pending review.
- Inspect all four screenshots, verify gallery switching and sizing on desktop
  and mobile, check formatting, server build, release validation, and existing
  accessibility checks. No application feature changes are planned.
- Commit, publish through main/Railway, and verify live rendered images and
  production asset hashes before reporting completion.

## Capture and local verification

- Captured Plan, Today, Journey, and Coach at 1206 × 2622 on an isolated iPhone
  17 Pro simulator. The installed October 14 native 1.5 shell was copied and
  rebundled with the current production JavaScript at `f9cd2ba`; this was not a
  new native compilation. The existing shared simulator and its data were kept.
- All content is synthetic Spanish-learning demonstration data. The Plan image
  shows one chosen habit, Today shows pending/completed habits, Journey shows a
  month calendar and milestone progress, and Coach shows its entry and weekly read.
- New assets are `public/assets/website/screen-{plan,today,journey,coach}-v6.png`.
  Existing layout and product copy stay intact. Gallery alt text, structured-data
  screenshot references, and the JavaScript cache key point to the new assets.
  The visible caption reads "Version 1.5 preview · Sample data".
- All four gallery selections loaded successfully with the expected pressed
  state. Desktop 1440 × 1000 and phone 390 × 844 checks found no horizontal
  overflow; all images retain their native aspect ratio.
- Server bundle, release validation, changed-file formatting, JavaScript syntax,
  and diff whitespace checks pass. The existing accessibility source checker
  still reports the same five missing skip-link findings across templates;
  rendered pages include the injected skip link. No new accessibility finding
  was introduced by this asset change.
- Temporary production environment file and the newly created screenshot-only
  simulator were removed after capture. Original simulator remains booted.
- Concurrent user-authorized cache cleanup reclaimed 1.53 GiB from unused
  npm, node-gyp, Homebrew, CocoaPods, and two EAS build-plugin caches. Projects,
  archives, active CLIs, runtime dependencies, and existing simulator data were
  preserved. Manifest: `/private/tmp/codex-safe-disk-cleanup-2026-10-17-094129/cache-cleanup-manifest.json`.
