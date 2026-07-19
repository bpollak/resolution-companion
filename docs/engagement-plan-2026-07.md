# Engagement Plan — highest obtainable engagement (2026-07-17)

**Directive:** build for the *highest level of engagement*, and keep it
**obtainable**. Not sales-y — a utility people find useful and want to pay for.
Value pulls the subscription; we never push it. Engagement is the goal;
conversion is a byproduct of a genuinely sticky daily habit.

This plan is deliberately scoped to what *this codebase + one agent* can ship
in short cycles. The core insight: **most of the machinery is already built**
(widget, adaptive reminders, streak shields, coach memory, recap, insights,
telemetry). The job is now to **instrument, baseline, and tune the loop** — not
to build a new pile of features. That is what makes it obtainable.

---

## 1. North Star (one metric, honestly measurable)

**W2 Habit Rate = % of activated users who log an action on ≥3 distinct days
during their *second* week.**

Why this one: activation happens in week 1; the *habit* either forms or dies in
weeks 1–2. D1 opens are vanity; a formed habit shows up as repeated logging in
week 2. It's directly computable from the telemetry we just shipped
(`action_logged` counts per day, keyed to the anonymous deviceId).

**Supporting funnel (all already instrumented in `client/lib/telemetry.ts`):**
1. `onboarding_started → onboarding_completed` (activation start)
2. `onboarding_completed → first_action_logged` **same day** (time-to-value)
3. `day_complete` rate in week 1 (early reward loop working?)
4. **W2 Habit Rate** (North Star)
5. `paywall_viewed → purchase_success` (byproduct, watched but never optimized at engagement's expense)

Guardrails that must never regress: ≤2 notifications/day, no guilt states,
jargon budget ~2 concepts, milestones only fill (never drain).

---

## 2. The engagement model (what we're tuning, and why)

The loop is **trigger → tiny action → visible reward → investment**, wrapped in
a **no-guilt** shell so a missed day never causes churn.

- **Trigger** — the single adaptive daily notification (`selectReminderHook`)
  + the home/lock-screen widget. Ambient presence is the biggest lever most
  habit apps miss; we already have it, so the work is *adoption*, not building.
- **Tiny action** — the "floor version" / 2-min kickstart. The bar to cast one
  vote must always be near-zero. A user should never break a streak for lack of
  time — there's always a kickstart.
- **Visible reward** — the Today ring fills instantly (optimistic), plus
  identity affirmation, streak/shield, and *variable* rewards (a micro-note, a
  coach observation, a milestone theme unlock). Variability is what keeps the
  loop alive past novelty.
- **Investment** — completion notes, personalization, and coach memory. The
  more a user puts in, the more the app is "theirs" and the harder to leave.
- **No-guilt shell** — shields/grace, the "any day is day one" reframe, warm
  (never red) lapsed reopen. Guilt is the #1 uninstall trigger for this genre.

---

## 3. Obtainable sequence (each phase: small, gated on a metric)

Ship in this order. **Do not start a phase until the prior one's metric moves
or is confirmed already-good.** Each phase is days, not weeks.

### Phase A — See the truth (do this first; ~1 cycle)
Can't raise engagement blind. Turn the telemetry we shipped into a picture.
- Build a minimal funnel readout from `GET /api/telemetry/summary` (a simple
  admin page or a daily digest query) showing the 5 funnel steps + W2 Habit Rate.
- **Baseline** every funnel number. Write the baselines down here.
- Exit criteria: we can see the funnel and know our worst drop-off step.

### Phase B — Activation (fastest time-to-first-vote)
Target the step from "installed" to "cast their first vote today."
- Guarantee onboarding *ends with at least one action already scheduled and
  loggable today* — the user tastes the reward loop in session one.
- Prompt to add the widget **right after the first `day_complete`** (peak
  motivation), never before value is felt.
- Metric: raise same-day `onboarding_completed → first_action_logged`.

### Phase C — Daily-habit hardening (raise the North Star)
- Verify the adaptive reminder is actually learning the best hook per user;
  confirm the "Mark all done ✓" notification action works end-to-end.
- Kickstart/floor available on every action, everywhere (widget, notification,
  Today) so a vote is always one tap.
- Metric: **W2 Habit Rate** up. This is the main event.

### Phase D — Resurrection (win back lapsed users, no guilt)
- A warm comeback for users who miss N days: "any day is day one" reopen +
  a frictionless one-tap restart (reuse the site's "restart your resolution"
  reframe). Never guilt, never red.
- Metric: reactivation rate of 7-day-lapsed users.

### Phase E — Depth loops (week-4+ retention & organic pull)
- Coach memory taste → the "a coach that knows you" moment; weekly review
  ritual as a Sunday anchor; **Month in Votes** share card on the 1st (this is
  also the only *acquisition* loop — sharing brings friends, no ad spend).
- Metric: week-4 retention + `recap_shared` rate.

---

## 4. Premium, the non-salesy way
Endow first, gate second. Every premium surface (coach memory, insights,
2-shield capacity, recap) should first be *felt* as value, then gated calmly —
one quiet line, never a nag, never an interstitial that blocks the loop. If a
paywall ever hurts the daily loop's engagement numbers, the loop wins.

## 5. What we are NOT doing (protect the scope)
- No new analytics infra — reuse the telemetry already shipped.
- No gamification that adds guilt or noise (no leaderboards, no loss-framed
  streaks, no >2 notifications/day).
- No big new feature until the funnel says where the leak is. Measure, then tune.

---

*Companion to `docs/enhancement-roadmap.md` (feature status) and
`docs/ground-up-review-2026-07.md` (strategy). The sprint that built the
machinery this plan tunes is committed on `wip/ground-up-sprint-2026-07-17`.*
