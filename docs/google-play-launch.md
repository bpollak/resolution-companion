# Google Play launch runbook

The Android app uses the same Expo/React Native source, server, API contract,
and product behavior as iOS. Android-specific code is limited to native build
configuration, Play Billing offers, store lifecycle verification, and
capability-gated UI.

## Human and console gates

- [ ] Create and verify the personal Google Play developer account and
      payments profile.
- [ ] Create “Resolution Companion AI” as a free app with package
      `com.resolutioncompanion.app`; accept Play App Signing.
- [ ] Create `premium` with active `monthly` and `yearly` auto-renewing base
      plans, no trial, matching iOS markets, and localized prices based on
      $2.99/month and $24.99/year in the US.
- [ ] Create separate least-privilege service accounts for Railway Android
      Publisher access, authenticated Pub/Sub push, and EAS submission.
- [ ] Configure and test the RTDN topic and OIDC-authenticated push endpoint.
- [ ] Complete Data Safety, content rating, target audience, ads, app access,
      privacy, generative-AI, and subscription declarations.
- [ ] Upload the first signed AAB manually to Internal testing.
- [ ] Keep 12 or more testers continuously opted in to Closed testing for at
      least 14 days; capture their device models, Android versions, feedback,
      and resolved issues.
- [ ] Apply for production access and promote the exact closed-test artifact.

## Required listing assets

- 512×512 32-bit PNG Play icon.
- 1024×500 JPEG or 24-bit PNG feature graphic.
- Current Android phone screenshots for Today, Journey, milestones, Coach,
  onboarding, and the paywall.
- At least four current tablet screenshots.
- English app title, short description, full description, release notes,
  support email, privacy URL, and feedback URL.

Do not publish iPhone-framed screenshots or claim Health, iCloud backup,
widgets, Siri, alternate icons, lifetime purchase, or cross-platform sync on
the Android listing.

## Closed-test matrix

Test Play-enabled emulator images on API 24, 30, 34, and 36 plus a low-memory
phone, a current physical phone, and a tablet. Record pass/fail evidence for:

- Cold/warm launch, offline launch/recovery, onboarding, Today, Journey,
  Coach, persona switching, action completion, recaps, sharing, reminders,
  dark/light themes, large text, screen reader, keyboard, rotation, system
  back, and edge-to-edge safe areas.
- Monthly/yearly price loading, purchase, cancellation, pending purchase,
  declined purchase, acknowledgement, renewal, grace period, account hold,
  cancellation through paid expiry, refund/revoke, expiry, reinstall restore,
  and restore on a second Android device using the same Play account.
- RTDN test notification, valid lifecycle messages, invalid OIDC identity,
  wrong package, duplicate delivery, transient server failure/retry, and all
  device records linked to one purchase token.
- AI response reporting from onboarding and Coach, including retry behavior;
  confirm reports are visible only through the admin endpoint.
- Profile contains no Apple-only entry points and Delete My Account & Data
  removes local data plus the server device record.

## Production gates and rollout

Before promotion, `npm run check:types`, `npm test`, `npm run lint`,
`npm run check:format`, `npm run check:a11y`, `npx expo-doctor`, the server
build, local preview APK, and production AAB must pass. Verify real localized
prices and license-test purchases from the Play-distributed build.

Use managed publishing and roll out to 10%, 50%, then 100%. Advance only when
Play Vitals shows no release-blocking crash/ANR regression and Railway shows
healthy validation, acknowledgement, and authenticated RTDN processing. Halt
the rollout on entitlement loss, purchase-without-access, crash/ANR spikes,
or a policy rejection. Add the live Google Play URL and badge to the website
only after the public listing is reachable.
