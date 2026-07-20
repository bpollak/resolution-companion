# Deployment & App Store Submission Checklist

This document lists everything that must be configured before the app works in
production and passes App Store review.

## 1. Backend (Railway / any Docker host)

Deploy the Express server (Dockerfile in repo root) and point
`resolutioncompanion.com` at it. Required environment variables:

| Variable                          | Required           | Purpose                                                                                                                                                                            |
| --------------------------------- | ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `NODE_ENV`                        | yes (`production`) | Enables fail-closed API auth                                                                                                                                                       |
| `DATABASE_URL`                    | yes                | PostgreSQL connection (subscriptions, feedback)                                                                                                                                    |
| `API_SECRET`                      | yes                | Shared key for app↔server auth. Must match `EXPO_PUBLIC_API_SECRET` in EAS. In production, protected endpoints return 503 until this is set.                                      |
| `AI_INTEGRATIONS_OPENAI_API_KEY`  | yes                | OpenAI key for chat/onboarding/reflection                                                                                                                                          |
| `AI_INTEGRATIONS_OPENAI_BASE_URL` | no                 | Optional OpenAI-compatible base URL                                                                                                                                                |
| `APPLE_ISSUER_ID`                 | yes (iOS)          | App Store Connect > Users and Access > Integrations > In-App Purchase keys                                                                                                         |
| `APPLE_KEY_ID`                    | yes (iOS)          | Key ID of the In-App Purchase key                                                                                                                                                  |
| `APPLE_PRIVATE_KEY`               | yes (iOS)          | Contents of the .p8 key (newlines may be escaped as `\n`)                                                                                                                          |
| `APPLE_SHARED_SECRET`             | no                 | Only used by the legacy verifyReceipt fallback                                                                                                                                     |
| `APPLE_SANDBOX`                   | no                 | Set `true` to force the StoreKit sandbox endpoint                                                                                                                                  |
| `GOOGLE_SERVICE_ACCOUNT_KEY`      | yes (Android)      | JSON service-account key with Play Android Publisher access                                                                                                                        |
| `ANDROID_PACKAGE_NAME`            | no                 | Defaults to `com.resolutioncompanion.app`                                                                                                                                          |
| `ALLOWED_ORIGINS`                 | no                 | Comma-separated CORS allowlist. Unset = no cross-origin browser access (the native app and same-origin website don't need CORS).                                                   |
| `ADMIN_API_SECRET`                | no                 | Operator-only key for `GET /api/feedback` (sent as `X-Admin-Key`). The endpoint returns 404 until this is set. Do NOT reuse `API_SECRET` — that value ships inside the app bundle. |

> **Important (StoreKit 2):** the app now uses `react-native-iap` v14, which
> returns JWS transactions instead of legacy receipts. iOS receipt validation
> therefore REQUIRES the App Store Server API credentials
> (`APPLE_ISSUER_ID`, `APPLE_KEY_ID`, `APPLE_PRIVATE_KEY`). The legacy
> `verifyReceipt` fallback cannot parse JWS tokens — without these three
> variables, EVERY iOS purchase fails validation and users are charged
> without receiving premium.

The server sets `trust proxy` (Railway terminates TLS at a reverse proxy), so
per-IP rate limiting uses the real client address. Rate limit state is
in-memory: run a single instance (Railway's default).

Run `npm run db:push` once against the production database to create tables.
(The `device_subscriptions` provider columns are named `provider_customer_id`
and `provider_transaction_id` — if you created the schema before this rename,
re-run `npm run db:push` before deploying. The schema now contains
`website_feedback`, `device_subscriptions`, and `device_ai_usage` (monthly
per-device AI quota counters); the previously defined unused tables — users,
personas, benchmarks, etc. — were removed, and `db:push` will offer to drop
them if they exist. All app data lives on-device.)

The OpenAI-backed endpoints enforce server-side monthly quotas per device
(free: 150 chat / 150 reflection / 20 extract requests; premium devices get
10×). These are abuse ceilings above legitimate use — the user-visible free
tier (10 check-ins/month) is still enforced in the client.

## 2. App builds (EAS)

`eas.json` already bakes `EXPO_PUBLIC_DOMAIN=resolutioncompanion.com` into
preview/production builds. Additionally set, in the EAS project (Environment
Variables, visibility "secret" is fine for builds):

- `EXPO_PUBLIC_API_SECRET` — same value as the server's `API_SECRET`.

> **Pre-flight blocker:** if this EAS variable is missing at build time, the
> production app ships without an API key and EVERY protected endpoint
> (onboarding AI, coaching, purchase validation, restore, account deletion)
> returns 401. Verify with `eas env:list` before building.

Before every iOS build, bump `expo.version` in `app.json` and add the matching
newest entry to `public/releases.json`. The build scripts run
`npm run release:check` first and stop if the versions do not match. Use
`npm run release:notes` to print the exact App Store release notes for the
current version.

Then:

```bash
npm run build:ios       # eas build --platform ios
npm run submit:ios      # eas submit --platform ios
```

A successful iOS upload automatically runs `npm run release:mark-submitted`.
Commit and push the resulting `public/releases.json` change so the public
Release Notes page shows that the version is with Apple. After Apple releases
the version, run `npm run release:sync`; this verifies the live App Store
version through Apple's Lookup API and marks it available. Commit and push that
status update as the final release step.

Release history is published at `https://resolutioncompanion.com/release-notes`
and as structured JSON at `https://resolutioncompanion.com/releases.json`.

Fill in `submit.production.ios` in `eas.json` (appleId, ascAppId, appleTeamId)
before running submit.

## 3. App Store Connect

1. Create the app with bundle ID `com.resolutioncompanion.app`, name
   "Resolution Companion AI".
2. Create two auto-renewable subscriptions in one subscription group:
   - `com.resolutioncompanion.monthly` (1 month)
   - `com.resolutioncompanion.annual` (1 year)
     Both must be "Ready to Submit" and attached to the app version, or the
     paywall will show "couldn't load subscription options" and review will fail.
3. App Privacy questionnaire (must match the privacy manifest in app.json):
   - Identifiers > Device ID — collected, app functionality, NOT linked to
     identity, NOT used for tracking.
   - Other Data > AI chat content is processed by OpenAI but not stored by us.
   - "Data Used to Track You": none.
4. URLs:
   - Privacy Policy: `https://resolutioncompanion.com/privacy`
   - Support: `https://resolutioncompanion.com/feedback`
   - Terms of Use (EULA): standard Apple EULA is referenced at
     `https://resolutioncompanion.com/terms`.
5. App Store Server Notifications (V2):
   `https://resolutioncompanion.com/api/webhooks/apple`
6. Review notes: mention that no account/login is required, and that premium
   can be tested with a sandbox Apple account.

## 4. Google Play (when ready)

1. Subscriptions: `premium_monthly`, `premium_yearly`.
2. Real-time developer notifications: Cloud Pub/Sub push to
   `https://resolutioncompanion.com/api/webhooks/google`.
3. Data safety form: device identifier (app functionality), AI chat content
   processed by OpenAI.

## 5. Pre-submission smoke test (TestFlight)

- [ ] App launches with no network and shows the offline banner (no crash).
- [ ] Onboarding AI chat streams a response.
- [ ] Paywall shows real store prices (no placeholders) and purchase works
      with a sandbox account.
- [ ] Restore Purchases works after delete + reinstall.
- [ ] Privacy Policy and Terms links open from the paywall and Profile.
- [ ] Profile > Delete My Account & Data succeeds (check `device_subscriptions`
      row is removed).
- [ ] Daily reminder permission prompt appears only after the explanatory
      dialog, and the reminder fires at 8 PM.
