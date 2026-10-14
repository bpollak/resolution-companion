# Review fixes: data integrity, entitlements, AI reliability, setup

Accepted scope: Brett reviewed the 2026-10-13 UX and code review of
`codex/consolidate-local-2026-09-28` (87c63c7) and replied "Can you proceed?"
to the recommendation to fix the top tier first. This plan covers that tier.
It does not merge `main`, deploy the server, or upload a build; those gates
stay with Brett.

Work happens on `claude/review-fixes-2026-10-13`, branched from 87c63c7, in a
clean clone outside iCloud (the iCloud checkout lacks `node_modules` and has
missing git objects).

## Plan and acceptance

### A. Check-offs are never lost or reversed

1. Add an idempotent "complete" path for daily logs that only ever sets
   `status: true` for `(actionId, date)` and is a no-op when already complete.
   Apple Health auto-votes, widget/Siri votes, and the notification
   "Mark all done" action use it instead of the toggle.
   Health auto-vote runs are single-flight.
   Accept: two overlapping Health runs, or two identical widget votes, leave
   exactly one completed log; a test covers it.
2. "Mark all done" waits until stored data has loaded, records the handled
   marker only after the writes succeed, and survives a cold background launch.
   Accept: test or reasoned trace shows a cold-launch response completes
   today's remaining actions once.
3. Daily-reminder rescheduling is serialized, and cancellation targets every
   scheduled notification tagged `daily-reminder` rather than only stored IDs.
   Accept: two concurrent reschedules leave one set; disabling reminders
   leaves none; a test covers it.

### B. Paying users are not downgraded by outages

4. Server receipt validation distinguishes "Apple says invalid" from "could
   not reach Apple / server error": the latter returns a retryable 5xx.
   The client never saves a downgrade to free while StoreKit reports an active
   entitlement that could not be verified; it keeps the prior state.
   Accept: test for upstream failure keeps premium.
5. Lifetime (non-expiring) Apple purchases store `expiresDate: null` instead of
   an Invalid Date. Accept: test validates a lifetime transaction end to end
   through the expiry mapping.

### C. AI routes fail visibly and stop spending on dead sockets

6. Streaming and non-streaming AI routes detect client disconnect via the
   response (`res.on("close")`, registered before the upstream call) and abort
   the upstream request with an `AbortController`. Error handlers check the
   response state, so real OpenAI failures are logged and the client receives
   an error frame or JSON error.
7. The OpenAI client gets a bounded timeout and at most one retry.
8. Cheap abuse limits: validate the `X-Device-Id` format. App Attest and
   server-built system prompts are larger changes and are deferred to a
   separate plan (noted below).

### D. Setup and readability

9. Onboarding offers "Set it up myself" so a user who declines AI consent, or
   is offline, can still create a plan from the existing starter-plan builder
   and reach Today. Accept: the path never calls an AI endpoint.
10. Journey calendar day numbers on complete/partial days use a theme token
    that meets 4.5:1 contrast in both themes.

## Verification

`npm run check:types`, `npm run lint`, `npm test` all green, with new
regression tests for A1, A3, B4, B5. Native simulator check of the onboarding
path (D9) and Journey calendar (D10) if the local simulator build is available.
A separate reviewer pass (report-only) over the diff before handoff.

## Deferred (separate intent)

- App Attest on AI routes; build system prompts server-side; global daily AI
  spend circuit breaker.
- Webhook lifecycle gaps (SUBSCRIBED, DID_FAIL_TO_RENEW, lifetime refunds,
  `signedDate` ordering, 5xx on persistence failure).
- Log redaction for AI and feedback routes; account deletion of reports and
  rate-limit rows; one transaction unlocking many devices.
- Editor discard prompts, trial-button price, plain-language errors,
  terminology pass, pre-typing Coach quota notice, midnight snapshot refresh.

## Implementation

- A1: `client/lib/daily-log.ts` adds idempotent complete and (actionId, date)
  upsert helpers; storage writes share one queue; AppContext exposes
  `completeDailyLog`, used by Health, widget, and notification votes. Health
  runs are single-flight; widget votes are deduped and share one helper. UI
  state updaters use the same upsert, and a dropped duplicate's note carries
  over.
- A2: "Mark all done" waits for the store, joins duplicate deliveries, and
  writes the handled marker only after the writes succeed.
- A3: reminder scheduling runs through one timed serial queue (10s per task);
  cancellation also removes every notification tagged `daily-reminder`; the
  plan signature makes redundant reschedules a no-op.
- B4: `server/iap-validation.ts` separates affirmative invalid (200
  `{valid:false}`) from unavailable (503 `{valid:false, retryable:true,
  error:"verification_unavailable"}`). The client treats 5xx, network, and
  retryable bodies as unverified and never saves a downgrade while StoreKit
  reports an active entitlement. Purchase and restore force a fresh check.
  The Play webhook skips unknown tokens and asks Pub/Sub to retry only for
  stored ones. A StoreKit 2 token reaching the legacy path logs a config error.
- B5: absent Apple expiry maps to `null`; lifetime rows store no period end.
- C6/C7: `server/ai-request.ts` aborts upstream on response close and sends
  real errors to the client; all OpenAI calls pass the signal. Client timeout
  30s, one retry.
- C8: `server/device-id.ts` validates `X-Device-Id`; invalid ids use the IP
  bucket and are never premium.
- D9: "Set it up myself" builds an editable starter plan with no AI calls;
  a self-setup draft can still switch to Coach.
- D10: new `onStatus` token. Calendar day numbers: Dawn 6.59:1 / 6.84:1
  (white on success / warning), dark 15.66:1 / 12.11:1 (black).

## Verification (2026-10-13)

- `npm run check:types`, `npm run lint`, Prettier: clean.
- `npm test`: 52 suites, 401 tests pass (319 before).
- `npm run server:build`: bundles.
- Report-only reviewer pass: no blockers; its three should-fix items and
  three nits were applied and re-verified.
- Not done: simulator check of D9/D10. The local simulator build failed in
  dependency install with ENOSPC (about 600 MB free on the Mac). Run
  `npm run build:local:sim` after freeing disk, before any TestFlight build.

## Native verification and TestFlight (2026-10-13)

Brett asked to clear disk space, finish testing, and deploy to TestFlight.

- Disk: removed only regenerable items (Xcode DerivedData, npx cache, about
  350 stale temp git index folders). Free space went from 0.6 GB to about 7 GB.
- Simulator (arm64 Release build of f5c33a1, fresh install): "Set it up
  myself" opens an editable starter plan, approves with no AI call, and lands
  on Today. Marking the habit complete shows on the Journey calendar with
  dark text on the success fill (dark theme), and survives a relaunch.
- Signing: the EAS export picked a local "Apple Distribution" cert instead
  of the EAS profile's cert (builds 101 and 102 failed at export). Xcode
  automatic signing then refused because react-native-health writes an empty
  `healthkit.access` entitlement; `plugins/with-healthkit-access-cleanup`
  removes it (0bf1b95). No App ID capability was changed.
- Build 1.5.0 (103) archived from 0bf1b95 and uploaded from Xcode Organizer
  with automatic signing; status "Uploaded to Apple". Warnings only: missing
  dSYMs for prebuilt React, ReactNativeDependencies, and hermes frameworks.
- Not yet verified: Apple processing, internal tester availability, and a
  physical-device pass.
