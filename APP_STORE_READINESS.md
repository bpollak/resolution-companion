# App Store Readiness — Regression Analysis & Submission Checklist

Full regression analysis performed 2026-07-06 across the client (Expo/React
Native), server (Express/Postgres), and project configuration, focused on
Apple App Store submission. Companion to `DEPLOYMENT.md` (operational setup).

## What was already in good shape

- **Icon & assets**: `assets/images/icon.png` is 1024×1024 RGB with no alpha
  (App Store compliant); splash and adaptive icons present.
- **Privacy manifest** (`app.json`): UserDefaults (CA92.1), DiskSpace (E174.1),
  Device ID collected for app functionality, not linked, not tracking;
  `ITSAppUsesNonExemptEncryption: false`.
- **Paywall (Guideline 3.1.2)**: real store prices per plan, auto-renewal
  terms, Restore Purchases button, Terms of Use + Privacy Policy links, price
  in the subscribe button.
- **Account & data deletion (Guideline 5.1.1(v))**: in-app "Delete My Account
  & Data" removes the server-side record and local data (no login exists, so
  this exceeds the requirement).
- **Notifications**: local-only daily reminder; OS permission prompt is gated
  behind an explanatory in-app dialog from a user-initiated toggle.
- **Receipt validation**: server-side via App Store Server API v2 with
  verified JWS webhook handling (Apple Root CA G3 chain validation).
- **Legal pages**: `/privacy`, `/terms`, `/feedback` served by the backend and
  linked from the app (Profile + paywall).

## Regressions found and fixed in this change set

1. **Apple renewal webhooks couldn't match subscriptions.** Validation stored
   the per-renewal `transactionId`, but App Store Server Notifications key on
   `originalTransactionId`. After the first renewal, renew/expire/refund
   events silently no-oped and entitlements drifted. Records are now keyed by
   `originalTransactionId` (`server/routes.ts`).
2. **iOS validation could run without a transaction ID**, falling into the
   legacy `verifyReceipt` path that cannot parse StoreKit 2 JWS tokens and
   storing `iap_undefined` rows. `POST /api/iap/validate` now requires
   `transactionId` for iOS.
3. **Rate limiting was ineffective behind Railway's proxy** — `req.ip` was the
   proxy address, collapsing all users into one 30 req/min bucket. Added
   `trust proxy` (`server/index.ts`).
4. **"Delete/clear data" orphaned purchase restore.** `clearAll()` wiped the
   device ID that server-side subscriptions are keyed by. It is now preserved
   on data clear and removed only after successful account deletion.
5. **Feedback PII was effectively public.** `GET /api/feedback` (names +
   emails) was guarded by the API key that ships inside the app bundle. Now
   gated behind a separate operator-only `ADMIN_API_SECRET` (404 until set).
6. **Guessable device IDs.** IDs were `Date.now()+Math.random()`; combined
   with no ownership checks this allowed reading/deleting other users'
   subscription records. New IDs use `expo-crypto` `randomUUID()`.
7. **Default CORS allowed any HTTPS origin with credentials.** Now no
   cross-origin access unless `ALLOWED_ORIGINS` is set.
8. **Paywall advertised features that don't exist or aren't gated**
   ("Custom Actions" isn't premium-gated; "Advanced Insights" doesn't exist —
   a Guideline 2.3.1 accurate-metadata risk). Copy now matches the real
   premium gates: unlimited personas, unlimited coaching, unlimited
   benchmarks.
9. **Dead code removed**: leftover Stripe helpers in `client/lib/storage.ts`
   and 8 unused database tables in `shared/schema.ts` (all app data is
   on-device; the server only stores feedback + subscriptions).
10. **Account deletion now verifies the server response** instead of treating
    any HTTP status as success.

## Submission checklist (actions only you can do)

### 1. Backend (Railway)
Hosting: keep Railway — `railway.json` (Dockerfile build, `/api/health`
healthcheck) is already configured; add the managed Postgres plugin and point
`resolutioncompanion.com` at the service. Run a single instance (in-memory
rate limits).

- [ ] Set env vars per DEPLOYMENT.md — critically `API_SECRET`,
      `DATABASE_URL`, `AI_INTEGRATIONS_OPENAI_API_KEY`, and the three Apple
      keys `APPLE_ISSUER_ID` / `APPLE_KEY_ID` / `APPLE_PRIVATE_KEY`
      (**without these, every iOS purchase charges the user and then fails
      validation**). Optionally `ADMIN_API_SECRET`, `ALLOWED_ORIGINS`.
- [ ] `npm run db:push` against the production database.

### 2. EAS build & submit
- [ ] Create EAS env var `EXPO_PUBLIC_API_SECRET` = server `API_SECRET`
      (verify with `eas env:list`). Missing ⇒ all API calls 401 in prod.
- [ ] Fill `eas.json` → `submit.production.ios`: `appleId`, `ascAppId`,
      `appleTeamId` (currently empty strings).
- [ ] `npm run build:ios`, then `npm run submit:ios`.

### 3. App Store Connect
- [ ] Create the app: bundle ID `com.resolutioncompanion.app`, name
      "Resolution Companion AI".
- [ ] Create both auto-renew subscriptions in one group —
      `com.resolutioncompanion.monthly`, `com.resolutioncompanion.annual` —
      status "Ready to Submit" and **attached to the app version** (otherwise
      the paywall shows an error and review fails).
- [ ] App Privacy questionnaire matching the manifest: Device ID — app
      functionality, not linked, not tracking; nothing under "Data Used to
      Track You".
- [ ] URLs: Privacy `https://resolutioncompanion.com/privacy`, Support
      `https://resolutioncompanion.com/feedback`, EULA/Terms
      `https://resolutioncompanion.com/terms`.
- [ ] App Store Server Notifications V2 URL:
      `https://resolutioncompanion.com/api/webhooks/apple`.
- [ ] Age rating: answer the questionnaire honestly for the unrestricted 1:1
      AI chat (expect a higher band, e.g. 12+/13+ under the 2025
      questionnaire). In App Review notes, explain: no login required, AI
      coaching is 1:1 (not user-to-user UGC), and premium is testable with a
      sandbox account.

### 4. TestFlight smoke test (from DEPLOYMENT.md §5)
- [ ] Offline launch shows banner, no crash.
- [ ] Onboarding AI chat streams.
- [ ] Paywall shows real prices; sandbox purchase succeeds.
- [ ] Restore Purchases works after delete + reinstall.
- [ ] Privacy/Terms links open from paywall and Profile.
- [ ] Delete My Account & Data removes the `device_subscriptions` row.
- [ ] Daily reminder fires after the explanatory dialog + permission grant.

## Recommended follow-ups (not submission blockers)

- **Server-side free-tier quota.** The "10 AI check-ins/month" free limit is
  enforced only client-side; the API key ships in the bundle and is
  extractable, so the OpenAI-backed endpoints are effectively uncapped.
  Add a per-device counter server-side.
- **Server-pinned system prompts.** `/api/chat` and `/api/extract-persona`
  accept fully client-supplied prompts — an extracted key turns them into a
  general-purpose GPT-4o proxy. Move system prompts server-side.
- **Per-device ownership tokens** to fully close the IDOR on device-keyed
  endpoints (crypto-random IDs shrink the practical risk, but a
  device-bound secret issued at first contact would eliminate it).
- **Feedback PII in deletion flow**: website feedback is keyed by email, not
  device ID, so in-app account deletion cannot remove it; handle via the
  support channel if a user requests it.
- **Tests & CI**: the project has no automated tests and no CI; lint,
  typecheck, and format checks exist as npm scripts and could run in a
  GitHub Action.
- **Landing page**: `server/templates/landing-page.html` still has a TODO
  placeholder where the App Store badge link belongs — fill in after the app
  is live.
