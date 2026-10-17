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
