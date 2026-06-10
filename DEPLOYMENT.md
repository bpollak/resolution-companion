# Deployment & App Store Submission Checklist

This document lists everything that must be configured before the app works in
production and passes App Store review.

## 1. Backend (Railway / any Docker host)

Deploy the Express server (Dockerfile in repo root) and point
`resolutioncompanion.com` at it. Required environment variables:

| Variable | Required | Purpose |
| --- | --- | --- |
| `NODE_ENV` | yes (`production`) | Enables fail-closed API auth |
| `DATABASE_URL` | yes | PostgreSQL connection (subscriptions, feedback) |
| `API_SECRET` | yes | Shared key for app↔server auth. Must match `EXPO_PUBLIC_API_SECRET` in EAS. In production, protected endpoints return 503 until this is set. |
| `AI_INTEGRATIONS_OPENAI_API_KEY` | yes | OpenAI key for chat/onboarding/reflection |
| `AI_INTEGRATIONS_OPENAI_BASE_URL` | no | Optional OpenAI-compatible base URL |
| `APPLE_ISSUER_ID` | yes (iOS) | App Store Connect > Users and Access > Integrations > In-App Purchase keys |
| `APPLE_KEY_ID` | yes (iOS) | Key ID of the In-App Purchase key |
| `APPLE_PRIVATE_KEY` | yes (iOS) | Contents of the .p8 key (newlines may be escaped as `\n`) |
| `APPLE_SHARED_SECRET` | no | Only used by the legacy verifyReceipt fallback |
| `APPLE_SANDBOX` | no | Set `true` to force the StoreKit sandbox endpoint |
| `GOOGLE_SERVICE_ACCOUNT_KEY` | yes (Android) | JSON service-account key with Play Android Publisher access |
| `ANDROID_PACKAGE_NAME` | no | Defaults to `com.resolutioncompanion.app` |
| `ALLOWED_ORIGINS` | recommended | Comma-separated CORS allowlist (e.g. `https://resolutioncompanion.com`) |

> **Important (StoreKit 2):** the app now uses `react-native-iap` v14, which
> returns JWS transactions instead of legacy receipts. iOS receipt validation
> therefore REQUIRES the App Store Server API credentials
> (`APPLE_ISSUER_ID`, `APPLE_KEY_ID`, `APPLE_PRIVATE_KEY`).

Run `npm run db:push` once against the production database to create tables.
(The `device_subscriptions` provider columns are named `provider_customer_id`
and `provider_transaction_id` — if you created the schema before this rename,
re-run `npm run db:push` before deploying.)

## 2. App builds (EAS)

`eas.json` already bakes `EXPO_PUBLIC_DOMAIN=resolutioncompanion.com` into
preview/production builds. Additionally set, in the EAS project (Environment
Variables, visibility "secret" is fine for builds):

- `EXPO_PUBLIC_API_SECRET` — same value as the server's `API_SECRET`.

Then:

```bash
npm run build:ios       # eas build --platform ios
npm run submit:ios      # eas submit --platform ios
```

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
