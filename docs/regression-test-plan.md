# Functional Regression Test Plan — data mutations & propagation

Purpose: every user edit must save and be reflected on every screen that
derives from it. Run before each release (simulator or device). Items
marked ✅ passed on 2026-07-07 (simulator, builds 29 and 36); items
marked ▢ remain for the final device pass.

## 2026-07-07 build 36 simulator pass — results

- ✅ Fresh onboarding end-to-end: consent gate → chat (first token ~2 s
  after the gpt-5-mini reasoning_effort fix) → extraction → sane plan
  (exact sorted weekdays, evening anchors honoring stated availability).
- ✅ Weekday ordering everywhere: editor chips Mon-first, saved order
  sorted, "Every day"/"Weekdays"/"Mon · Wed · Fri" labels, milestone
  detail "On:" row tells the schedule→anchor story.
- ✅ Schedule edit propagation (item 1): Sun-only → Every day updated
  badge ("Daily"), detail row, Today ring denominator, tab badge count,
  tomorrow preview ("3 actions").
- ✅ Logging propagation (item 5): ring 1/1, streak 1-day, consistency
  chip/card agree, day-complete card, delayed reminder ask.
- ✅ Coach tab: momentum, "10 of 10 free check-ins" framing, check-in
  invite bubble, no premature upsell. Premium discovery card on Journey.
- 🐛→fixed (build 37): Monthly Consistency divided by scheduled days
  before the plan existed (perfect day one showed 8%); creation-date
  cutoff added to computeMomentumScore + unit tests.
- 🐛→fixed (build 37): milestone detail text occasionally rendered as a
  single clipped line on first layout (Fabric measurement); explicit
  width + flexShrink on actionDetailText.
- ⚠️ Simulator-only: Daily Reminders toggle cannot enable (notifications
  lib intentionally returns false when !Device.isDevice) — but the
  pre-permission context alert also did not appear on switch tap while
  the adjacent AI Data Sharing switch alert works. ▢ Verify the
  reminders toggle end-to-end on a physical device (item 18).

## 2026-07-07 build 39 simulator pass — release candidate verified

- ✅ Fresh onboarding → 3-action Tue/Thu/Sun reading plan, sorted days.
- ✅ Monthly Consistency creation-date cutoff: perfect first day reads
  "July · 100% +100 today" on chip, Journey ring, and day-complete card
  (was 8% pre-fix). Calendar day 7 green, "3/3 done" matches.
- ✅ Milestone detail text wraps on first mount (both long kickstarts);
  "On: Tue · Thu · Sun" ordering correct; milestones credited 1/21.
- ✅ Optimistic logging: ring/chips/card flip immediately on tap;
  completed rows collapse; toasts fire.
- Build 39 uploaded to TestFlight = the resubmission candidate.

## A. Schedule (frequency) edits

1. ✅ **Edit an action to Daily** → Journey milestone badge reads "Daily";
   action day-tags show all 7; Today shows the action and the ring
   denominator updates; tomorrow preview updates; tab badge count updates.
2. ✅ **Edit an action to specific days (Wed/Sat)** → badge/day-tags update;
   Today only shows it on those days.
3. ✅ **Monthly Consistency recalculates after schedule edits** (denominator
   = scheduled days month-to-date; number moves immediately).
4. ✅→🐛→fixed: **Editing an action with legacy invalid frequency values**
   ("First Thursday") preserved the invalid value alongside new days.
   Fixed: editor sanitizes frequency to real weekdays on load (commit
   1eaaf44). ▢ Re-verify on build 33+: open an action, save, confirm only
   real weekday tags remain.

## B. Logging & backfill

5. ✅ Toggling today's actions (Today + Journey day-detail) updates: ring,
   chips (streak, consistency + delta), milestone N/21, day-complete state,
   completed-row collapse. (Regression #1 + #2.)
6. ▢ **Backfill a past day** from Journey day-detail → streak recomputes
   (consecutive days), consistency rises, milestone N/21 increments.
7. ✅ (negative) Days before plan creation don't count toward milestone
   progress or July consistency (creation-date cutoff; unit-tested).
8. ▢ Un-toggling a logged action reverses all of the above.
9. ▢ Future dates cannot be logged (blocked with message).

## C. Title/copy edits

10. ▢ Edit milestone title → Journey list, Today card subtitle, and
    Journey day-detail subtitle all update.
11. ▢ Edit action title/kickstart/anchor → Today card and Journey
    expanded details update.

## D. Structural edits

12. ▢ Add action to a milestone (max 5/plan enforced with alert).
13. ▢ Delete action (min 3/plan enforced; logs removed; Today updates).
14. ▢ Delete milestone → its action and logs disappear everywhere;
    counts/scores recalc.
15. ✅ (gate) "+ Add milestone" free-tier lock routes to paywall.
16. ▢ Premium: add milestone → appears with 0/21, schedulable.

## E. Settings propagation

17. ▢ AI Data Sharing OFF → coach/chat gated with consent path to
    re-enable; ON via consent modal → chat works.
18. ▢ Notifications toggle + time bucket (Morning/Midday/Evening) →
    subtitle updates; reminder reschedules.
19. ▢ Delete My Account & Data → local wipe, server row removed
    (device_subscriptions + device_ai_usage), app returns to empty state.

## F. Purchase (device only)

20. ✅ Purchase monthly in sandbox (validated 2026-07-07 on device).
21. ▢ Delete app → reinstall → Restore Purchases → premium returns.
22. ▢ Premium flips gates everywhere: unlimited check-ins copy, + Add
    milestone unlocked, Journey premium card hidden, Profile shows
    Premium Active.

## G. Cross-cutting invariants (check after any mutation)

- Today ring fraction == count of today's scheduled actions.
- Journey day-detail "N/M done" == Today ring for today.
- Consistency % identical on Today chip, Journey ring, day-complete card.
- Streak chip identical on Today and Journey.
- No day badge ever shows a non-weekday string.
