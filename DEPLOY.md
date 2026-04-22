# Production Deploy Runbook

Production stack:

- **Domain:** `resolutioncompanion.com`
- **Backend:** Railway (Dockerfile-based, `railway.json` in repo)
- **Database:** Railway Postgres (auto-injects `DATABASE_URL`)
- **Edge / WAF (optional, recommended):** Cloudflare proxy in front
- **Monitoring:** Uptime Robot (free) + Sentry (free tier) — optional but strongly recommended before submission
- **CI gate:** `.github/workflows/checks.yml` runs typecheck + lint on PRs. Railway itself auto-deploys `main` on every push via its GitHub integration — no separate deploy workflow needed.

The same backend serves the mobile API **and** the landing / privacy / terms pages. These URLs are referenced from App Store Connect and must never change after submission.

---

## One-time setup

### 1. Railway project

- Sign in at https://railway.app and "New Project → Deploy from GitHub repo".
- Pick this repo. Railway auto-detects `railway.json` + `Dockerfile`.
- In the service settings, confirm:
  - **Build:** Dockerfile
  - **Healthcheck path:** `/api/health`
  - **Port:** Railway auto-detects via the `PORT` env var (the Dockerfile sets it to `5000`, and the server reads `process.env.PORT`).

### 2. Railway Postgres

- "+ New → Database → PostgreSQL" inside the same project.
- Railway auto-injects `DATABASE_URL` into the server service. No manual wiring.
- Note: for the first schema push you'll run `npm run db:push` locally against that URL (see step 5).

### 3. Environment variables

Railway Service → Variables. Set everything below. **NEVER** commit any of these.

```
NODE_ENV=production
ALLOWED_ORIGINS=https://resolutioncompanion.com,https://www.resolutioncompanion.com
ANDROID_PACKAGE_NAME=com.resolutioncompanion.app
APPLE_SANDBOX=false

API_SECRET=<run: openssl rand -hex 32>
AI_INTEGRATIONS_OPENAI_API_KEY=sk-...
APPLE_ISSUER_ID=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
APPLE_KEY_ID=ABC123XYZ
APPLE_PRIVATE_KEY=-----BEGIN PRIVATE KEY-----\nMII...\n-----END PRIVATE KEY-----
APPLE_SHARED_SECRET=abc123...
GOOGLE_SERVICE_ACCOUNT_KEY={"type":"service_account",...}
```

Notes:

- `APPLE_PRIVATE_KEY`: paste the full `.p8` contents. Railway preserves newlines when you paste into the raw-editor field.
- `GOOGLE_SERVICE_ACCOUNT_KEY`: paste the whole JSON as a single value. The server `JSON.parse`s it.
- `API_SECRET` also goes into the mobile app build as `EXPO_PUBLIC_API_SECRET` via `eas.json` → build → production → env, matched to the server's value. Mismatch = every AI request returns 401.
- `EXPO_PUBLIC_DOMAIN=resolutioncompanion.com` also lives in `eas.json`, not on the server.

### 4. Custom domain

In the Railway service → Settings → Networking → Custom Domain:

- Add `resolutioncompanion.com`. Railway displays a CNAME target (something like `abcdef.up.railway.app`).
- Add `www.resolutioncompanion.com` too.

At your DNS provider (Cloudflare, if that's where the domain lives):

| Type  | Name  | Target                         | Proxy |
| ----- | ----- | ------------------------------ | ----- |
| CNAME | `@`   | `<your>.up.railway.app`        | OFF\* |
| CNAME | `www` | `<your>.up.railway.app`        | OFF\* |

\* **Important:** Railway issues Let's Encrypt certs for custom domains. If Cloudflare's proxy is ON (orange cloud), you must set Cloudflare SSL to **Full (strict)**, not Flexible. The easier path during first setup is to leave the proxy OFF (gray cloud) until Railway's cert is `Issued`, then turn the proxy on and set SSL → Full (strict).

Some registrars can't CNAME the apex — if so, use Cloudflare DNS (free) for this domain and CNAME-flatten the apex automatically.

### 5. Initial database migration

Run once from your laptop against the Railway Postgres:

```bash
# Grab the DATABASE_URL from the Postgres service → Variables → "Connect" tab
export DATABASE_URL="postgresql://..."
npm install
npm run db:push
```

Subsequent schema changes can be pushed the same way, or wired into a Railway pre-deploy command if you want.

### 6. GitHub integration (already done if you set it up in step 1)

Railway Service → Settings → Source → confirm:

- **Branch:** `main`
- **Automatic deployments:** ON

Every push to `main` triggers a build. The `checks.yml` workflow runs typecheck + lint in parallel — keep it green to avoid shipping broken code.

### 7. App Store Connect wiring

Once `https://resolutioncompanion.com/privacy` and `/terms` return 200:

- **App Store Connect → App Information:**
  - Privacy Policy URL: `https://resolutioncompanion.com/privacy`
  - Subscription Terms of Use: `https://resolutioncompanion.com/terms`
- **App Store Connect → App → App Store Server Notifications:**
  - Production URL: `https://resolutioncompanion.com/api/webhooks/apple`
  - Version: **Version 2**
  - Send a test notification — check Railway logs for "Apple S2S notification".
- **Google Play Console → Monetization setup → Real-time developer notifications:**
  - Topic: a Pub/Sub topic pushing to `https://resolutioncompanion.com/api/webhooks/google`.

---

## Staging environment

Railway supports multiple environments per project. Create a `staging` environment (Project Settings → Environments → New).

- Staging gets its own set of variables. Duplicate the production ones, then override:
  - `APPLE_SANDBOX=true`
  - `APPLE_*` keys → sandbox versions
  - `ALLOWED_ORIGINS` → include your TestFlight landing if needed
- Point staging at a separate Railway Postgres (or a branch, if you later migrate to Neon).
- Add a staging custom domain like `api-staging.resolutioncompanion.com` so TestFlight builds can target it via `EXPO_PUBLIC_DOMAIN=api-staging.resolutioncompanion.com` in an `eas.json` preview profile.

Production App Store builds point at the apex; TestFlight / preview builds point at staging.

---

## Observability (strongly recommended before submission)

### Uptime Robot (free)

- Monitor `https://resolutioncompanion.com/api/health`, every 5 min.
- Alert to your phone number.
- Turn this on **before** you submit. Apple reviewers test at unpredictable hours, and downtime during review = rejection + back to the queue.

### Sentry (free tier)

Install `@sentry/node` in `server/`, wrap the Express error handler. ~5 minutes of setup. The first time `/api/webhooks/apple` silently fails is when this pays for itself.

### Log retention

Railway retains logs for 30 days on the Hobby plan; check your plan's limit. Apple webhooks can retry days later, so forward logs to something with longer retention (BetterStack, Axiom, Logtail) via Railway's log drain setting if you need more than what Railway retains.

---

## Rotating secrets

If any secret leaks, rotate immediately:

- **`API_SECRET` / OpenAI / Apple `.p8` / Google service account:** update the variable in Railway → the service redeploys automatically.
- **Apple `.p8`** also requires revoking the old key in App Store Connect → Users and Access → Keys.
- **After rotating `API_SECRET`:** also update `EXPO_PUBLIC_API_SECRET` in `eas.json` and ship a mobile app update. Old app builds will no longer reach the server.

---

## Rollback

Railway → Deployments → find the last known good deployment → "Redeploy".

The database is separate; rolling back the server doesn't roll back schema migrations. Irreversible migrations should ship in their own PR, behind a flag, ideally not in the same deploy as dependent app code.

---

## Costs (order of magnitude, early stage)

| Thing                      | Cost                    |
| -------------------------- | ----------------------- |
| Domain (you already own)   | ~$10/yr                 |
| Railway Hobby              | $5/mo + usage           |
| Railway Postgres           | usage-based, ~$5–15/mo  |
| Cloudflare (if used)       | $0                      |
| Uptime Robot               | $0                      |
| Sentry                     | $0                      |
| **Total**                  | **~$15–30/mo**          |

OpenAI spend sits on top and scales with user count — set billing alerts in the OpenAI dashboard.
