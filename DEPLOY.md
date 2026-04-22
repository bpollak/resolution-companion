# Production Deploy Runbook

Production stack:

- **Domain:** `resolutioncompanion.com` (Cloudflare Registrar / DNS)
- **Backend:** Fly.io (`fly.toml` in repo, Dockerfile-based)
- **Database:** Neon Postgres (pooled connection string in `DATABASE_URL`)
- **Edge / WAF:** Cloudflare proxy in front of Fly
- **Monitoring:** Uptime Robot (free) + Sentry (free tier) — optional for day 1
- **CI/CD:** `.github/workflows/deploy.yml` auto-deploys `main` on changes to server / shared / Dockerfile / fly.toml.

The same backend serves the mobile API **and** the landing / privacy / terms pages. These URLs are referenced from App Store Connect and must never change after submission.

---

## One-time setup

### 1. Fly account + CLI

```bash
brew install flyctl                       # macOS
fly auth login
fly launch --copy-config --no-deploy      # picks up fly.toml; confirms region
```

Answer "no" when asked about Postgres (we use Neon) and Redis.

### 2. Neon Postgres

- Create project at https://console.neon.tech
- Create **two branches**: `main` (production) and `staging`
- Copy the **pooled connection string** from the "Connection Details" panel — the one with `-pooler` in the host. Fly's short-lived connections blow standard PG connection slots otherwise.

### 3. Secrets (run once — NEVER commit these)

```bash
fly secrets set \
  DATABASE_URL="postgresql://...pooler..." \
  API_SECRET="$(openssl rand -hex 32)" \
  AI_INTEGRATIONS_OPENAI_API_KEY="sk-..." \
  APPLE_ISSUER_ID="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" \
  APPLE_KEY_ID="ABC123XYZ" \
  APPLE_PRIVATE_KEY="$(cat /path/to/AuthKey_ABC123XYZ.p8)" \
  APPLE_SHARED_SECRET="abc123..." \
  GOOGLE_SERVICE_ACCOUNT_KEY="$(cat /path/to/play-service-account.json)"
```

The app's client build also needs `EXPO_PUBLIC_API_SECRET` set to the same value as `API_SECRET`, and `EXPO_PUBLIC_DOMAIN=resolutioncompanion.com`. These go in `eas.json` build env, not on the server.

### 4. Initial deploy

```bash
fly deploy
fly status                                 # confirm one machine is started
curl https://resolution-companion.fly.dev/api/health
```

### 5. Database schema

From a machine with `DATABASE_URL` exported to the Neon pooled URL:

```bash
npm run db:push
```

### 6. DNS (Cloudflare)

Add these records in the Cloudflare DNS tab for `resolutioncompanion.com`:

| Type    | Name | Target                              | Proxy |
| ------- | ---- | ----------------------------------- | ----- |
| A       | `@`  | (Fly anycast IPv4 — see below)      | ON    |
| AAAA    | `@`  | (Fly anycast IPv6 — see below)      | ON    |
| CNAME   | `www`| `resolutioncompanion.com`           | ON    |

Get the Fly anycast IPs:

```bash
fly ips list
```

Then tell Fly about the custom domain so it provisions TLS:

```bash
fly certs add resolutioncompanion.com
fly certs add www.resolutioncompanion.com
fly certs show resolutioncompanion.com     # repeat until status == "Ready"
```

**Cloudflare SSL mode:** set to **Full (strict)**. Any other mode either breaks TLS or exposes plaintext.

### 7. GitHub Actions deploy secret

- `fly tokens create deploy -x 999999h` → copy the token
- Repo → Settings → Secrets and variables → Actions → New repository secret:
  - Name: `FLY_API_TOKEN`
  - Value: that token

From now on every push to `main` that touches server code auto-deploys.

### 8. App Store Connect wiring

Once `https://resolutioncompanion.com/privacy` and `/terms` return 200:

- **App Store Connect → App Information:**
  - Privacy Policy URL: `https://resolutioncompanion.com/privacy`
  - Subscription Terms of Use: `https://resolutioncompanion.com/terms`
- **App Store Connect → App → App Store Server Notifications:**
  - Production URL: `https://resolutioncompanion.com/api/webhooks/apple`
  - Version: **Version 2**
  - Send a test notification — check `fly logs` for "Apple S2S notification".
- **Google Play Console → Monetization setup → Real-time developer notifications:**
  - Topic: a Pub/Sub topic pushing to `https://resolutioncompanion.com/api/webhooks/google`.

---

## Staging environment

Clone the production setup into a second Fly app so the App Store review build has somewhere safe to test against:

```bash
fly launch --name resolution-companion-staging --copy-config --no-deploy
# Point at the Neon "staging" branch
fly secrets -a resolution-companion-staging set \
  DATABASE_URL="postgresql://...staging-pooler..." \
  APPLE_SANDBOX="true" \
  ... # everything else, sandbox keys where applicable
fly deploy -a resolution-companion-staging
fly certs add api-staging.resolutioncompanion.com -a resolution-companion-staging
```

Add the `api-staging` CNAME in Cloudflare. Your App Store TestFlight builds point at this; production App Store builds point at the apex.

---

## Observability (strongly recommended before submission)

### Uptime Robot (free)

- Monitor `https://resolutioncompanion.com/api/health`, every 5 min.
- Alert to your phone number.
- Turn this on **before** you submit. Reviewers test at unpredictable hours.

### Sentry (free tier)

Install `@sentry/node` in `server/`, wrap the Express error handler. 5 minutes of setup. The first time a webhook silently fails, this pays for itself.

### Log retention

`fly logs` shows the last few hours only. For Apple webhooks (which can retry days later), ship logs to Axiom or BetterStack:

```bash
fly ext axiom create                       # free tier, auto-wires log forwarding
```

---

## Rotating secrets

If any secret leaks, rotate immediately:

- `API_SECRET` / OpenAI key / Apple p8 / Google service account:
  `fly secrets set KEY=newvalue` → the app restarts automatically.
- Apple `.p8` also needs the old key **revoked in App Store Connect**.
- After rotating `API_SECRET`, also update `EXPO_PUBLIC_API_SECRET` in `eas.json` and ship a mobile app update; old builds won't reach the server anymore.

---

## Rollback

```bash
fly releases                               # list past releases
fly releases rollback <version>            # revert to a previous image
```

The DB is separate; rolling back the server does not roll back schema migrations. Use Neon's point-in-time restore for that.

---

## Costs (order of magnitude, early stage)

| Thing                     | Cost                 |
| ------------------------- | -------------------- |
| Domain (Cloudflare Reg.)  | ~$10/yr              |
| Fly.io (1 × shared-cpu-1x)| ~$5–15/mo            |
| Neon Postgres             | $0 (free) → $19/mo   |
| Cloudflare                | $0                   |
| Uptime Robot              | $0                   |
| Sentry                    | $0                   |
| **Total**                 | **~$15–35/mo**       |

OpenAI spend sits on top and scales with user count — set billing alerts.
