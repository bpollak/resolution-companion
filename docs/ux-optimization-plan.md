# UX & Performance Analysis + Optimization Plan

Analysis run overnight 2026-07-06 → 07 across every screen in `client/`.
Two audits (experience + render performance) were synthesized into this
plan. Items marked ✅ were implemented the same night (build 24); items
marked ▢ are the recommended next wave.

## What was implemented overnight (build 24)

### Performance ("app feels sluggish when tapping navigation")

- ✅ **AppContext provider value memoized** (`client/context/AppContext.tsx`).
  The context previously handed out a fresh object with ~20 recreated
  functions on every state change, re-rendering all five tab screens each
  time anything changed. All mutators are now `useCallback`'d and the value
  object is `useMemo`'d. This was the root cause of sluggish tab taps.
  (Also fixed in passing: `deleteBenchmark` captured a stale `actions`
  array; it now reads fresh state from storage.)
- ✅ **Tabs freeze while blurred** (`freezeOnBlur`, shipped in build 22).
- ✅ **Calendar month grid indexed** (`client/screens/CalendarScreen.tsx`).
  The 42-cell grid re-filtered the full log array twice per cell; it now
  uses a memoized `actionId|date` set. Also fixed a correctness bug: a
  day's completed count previously included completions of actions not
  scheduled that day.
- ✅ **ReflectScreen** reflection list sort memoized.
- ✅ **ProgressScreen** expand/collapse state no longer resets on unrelated
  state changes (keyed on the benchmark id set, not array identity).

### First-run journey & comprehension

- ✅ **Post-onboarding now lands on Today** (was Progress) — the first thing
  a new user sees is the list of actions they can check off right now.
- ✅ **"Next Steps" guidance card** on Progress (added build 22, copy
  improved build 24): explains benchmarks are AI-created milestones, that
  each has a scheduled daily action, that Edit customizes days, and that
  Today-tab check-offs move the bars.
- ✅ **Frequency badges** ("Daily" / "3×/week") on every benchmark card.
- ✅ **Alignment score explained inline** on Today and Progress: "% of
  scheduled actions completed over the last 30 days".
- ✅ **Momentum score explained inline** on Coach: "Your completion rate
  for scheduled actions over the past 7 days".
- ✅ **Kickstart and Anchor Link hints rewritten** in the action editor to
  explain the behavioral model (2-minute fallback still counts; habit
  stacking).

### Daily loop & feedback

- ✅ **Success toast on Today** when an action is logged ("Logged — nice
  work!"), matching the Calendar's existing toast.
- ✅ **Calendar check-offs credit the right benchmarks** (timezone weekday
  bug, build 22) and evening check-ins after 5 PM Pacific no longer land
  on the wrong date.

### Monetization UX

- ✅ **Coach tab reads as free-first**: "Free Check-ins · N of 10 ·
  Included free — resets at the start of each month"; upgrade link hidden
  until 7/10 used; hard gate only at 10/10 (build 22).
- ✅ Profile shows "N free check-ins left this month".
- ✅ Paywall "Unlimited Coaching" copy made concrete ("No monthly cap on
  AI check-ins…").
- ✅ Purchase reliability: server JWT signature fix + StoreKit
  finish-transaction sweep (builds 22/23 + server deploy).

### Accessibility

- ✅ ChatBubble now announces "You:"/"AI coach:" with message content to
  screen readers.
- (Existing coverage was already good: calendar day cells, action
  checkboxes, and nav controls have labels/roles from earlier passes.)

## Recommended next wave (not implemented — needs product judgment or device testing)

- ▢ **Tab IA**: Calendar and Progress overlap (both show progress; two
  places to check off actions). Consider renaming Calendar → "History"
  and focusing it on streak insight, or folding date-picking into Today.
  Needs usage data before restructuring.
- ▢ **Contextual paywall framing**: when arriving at the paywall from the
  10/10 coach gate, show a "you've used all 10 free check-ins this month"
  context card instead of the generic hero.
- ▢ **Streak celebration moment**: when the last action of the day is
  logged, a one-time confetti/animation + "all done today" state on Today
  would reinforce the habit loop far more than the toast alone.
- ▢ **Notification timing**: daily reminder is fixed at 8 PM; letting the
  AI suggest a time based on the user's anchor habits (morning coffee →
  morning reminder) would fit the product's coaching identity.
- ▢ **BlurView tab bar cost**: if tabs still feel heavy on older devices
  after the context fix, drop blur intensity or gate it by device age
  (needs on-device profiling).
- ▢ **Web paywall dead end**: subscriptions are iOS-only by design; the
  web build could link out to the App Store page post-launch.
- ▢ **Empty-state for "all done today"**: currently the list just shows
  checked cards; an explicit completed state with tomorrow preview would
  close the loop.

## Verification notes

All overnight changes pass `tsc --noEmit`, Prettier, and ESLint (only
pre-existing animation-hook warnings remain). None of them alter data
formats or server contracts. The riskiest change is the AppContext
memoization — dependency arrays were derived from each function's actual
closures, and the one function that read state (`deleteBenchmark`) was
switched to a fresh storage read. Morning device pass should include: tab
switching feel, one full onboarding run, calendar toggles updating all
progress bars, coach screen copy, and the purchase/restore flow on build
23+ (queue-sweep fix).
