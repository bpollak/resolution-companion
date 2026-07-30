# Version 1.3 Website and App Store Refresh

## Objective

Bring the public website and App Store listing in line with the simplified
Version 1.3 interface that is already live:

1. Present one clear daily loop on Today.
2. Describe Journey as the home for Your Story, calendar, milestones,
   comebacks, and monthly chapters.
3. Describe Coach as one open conversation plus Review my week and Adjust my
   plan.
4. Replace streak- and monthly-consistency-heavy screenshots with current
   interface captures.

## Prepared assets

Website images:

- `public/assets/website/screen-today-v3.png`
- `public/assets/website/screen-journey-v3.png`
- `public/assets/website/screen-milestones-v3.png`
- `public/assets/website/screen-coach-v3.png`
- `public/assets/website/screen-day-complete-v3.png`
- `public/assets/website/screen-welcome-v2.png`

App Store 6.9-inch images, all 1320 by 2868:

- `appstore-screenshots/01-today.png`
- `appstore-screenshots/02-journey.png`
- `appstore-screenshots/03-milestones.png`
- `appstore-screenshots/04-coach.png`
- `appstore-screenshots/05-welcome.png`
- `appstore-screenshots/06-day-complete.png`

Do not upload the older `appstore-screenshots/06-chat.png`.

## Website release path

The website is served by the Express app from
`server/templates/landing-page.html` and deploys through Railway from GitHub
`main`.

Before deployment:

1. Run `npm run check:a11y`.
2. Run `npm run server:build`.
3. Run `npm run release:check`.
4. Run `npm run check:types`.
5. Run `npm run lint`.
6. Run `git diff --check`.

After deployment:

1. Confirm `/api/health` returns healthy.
2. Confirm the home page says Version 1.3 and “One Clear Daily Loop.”
3. Confirm the refreshed Today, Journey, Milestones, Coach, and Day complete
   images load.
4. Check the home page at desktop and mobile widths.
5. Confirm `/release-notes` and `/releases.json` show Version 1.3 as released.

## App Store path

First inspect Version 1.3 in App Store Connect. If Apple permits editing the
live version’s screenshots, replace the 6.9-inch set directly. If the live
version is locked, use the smallest permitted metadata refresh:

1. Create Version 1.3.1.
2. Bump `expo.version` in `app.json` to `1.3.1`.
3. Add the matching top entry to `public/releases.json`.
4. Run the full release gate.
5. Build locally with `npm run build:local:ios`.
6. Upload with `npm run submit:local:ios`.
7. Select the processed build in App Store Connect.
8. Upload the six prepared screenshots in the order above.
9. Use concise What’s New copy that describes the listing refresh and current
   simplified interface.
10. Submit for review with automatic release enabled.

## Current status

- Fresh simulator captures: complete.
- Website copy and image updates: committed and pushed to GitHub `main`.
- Website validation and GitHub CI: complete and passing.
- Website production deployment: live at `https://resolutioncompanion.com/`.
  Railway missed the pushes made during its July 30 build incident, so commit
  `7fa5c0c` safely retriggered the current `main` source after Railway marked
  the incident resolved.
- Website production verification: `/api/health` is healthy, `/releases.json`
  and `/release-notes` show Version 1.3 as released, all five versioned
  screenshot assets return HTTP 200, and desktop plus 390 by 844 mobile checks
  found no horizontal overflow or broken images.
- Website hero correction: commit `20be5de` is live. The hero now uses the
  simulator captures as the device silhouettes, without duplicate padded
  frames or perspective tilt; the narrow simulator gutter is cropped and all
  three above-the-fold images load eagerly.
- App Store Connect: Version 1.3.1 created because live Version 1.3 is locked.
- App Store screenshots: six current 6.9-inch images uploaded in the intended
  order.
- App Store metadata: current description, promotional text, keywords, What’s
  New copy, and review notes saved.
- iOS build: Version 1.3.1 build 75 compiled locally, uploaded, processed, and
  attached successfully.
- App Review: Version 1.3.1 build 75 was submitted July 30 and is Waiting for
  Review. Automatic release and immediate rollout are enabled.
- Remaining App Store step: wait for Apple review, then verify the public
  product page and screenshot order after release.
