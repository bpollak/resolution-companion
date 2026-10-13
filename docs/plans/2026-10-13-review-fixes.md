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
