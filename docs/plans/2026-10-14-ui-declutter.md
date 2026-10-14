# UI declutter pass

Accepted scope: on 2026-10-14 Brett said the interface "seems a bit cluttered"
and asked for an agent-led analysis, a plan, and implementation ("do a user
interface pass ... develop a plan and then set a goal to implement the plan").
Branch `claude/review-fixes-2026-10-13`. No feature is deleted; elements are
reordered, merged, collapsed, deferred, or restyled. Telemetry events and
dismiss keys are preserved. No TestFlight upload or `main` merge in this plan.

## Evidence

Simulator screenshots (iPhone, 402x874pt) for a new user (AI-free starter
plan) and the same user after 33 seeded days (`qa/seed_history.py`). Three
report-only agents audited Today, Journey, and Coach/Profile/Paywall/
Onboarding plus app-wide patterns against code and screenshots.

Key findings:

- Today: Mark Complete sits at about 655-705pt, below a reminder primer that
  shows until answered (forever), a progress line with the streak hidden
  behind a tap, and an "Up next" card that repeats the habit card. A 33-day
  user's first screen is identical to day 1. About six tappable targets and
  nine cyan elements compete above the fold.
- Celebrations collide: on day 7 a shield toast, milestone modal, day-complete
  celebration, and store-review ask can fire from one tap (screenshot shows the
  toast clipped under the modal). The review key is set before the ask runs.
- Journey: one milestone is about 3.5 screens of scroll; the selected-day list
  always repeats Today; the same consistency fact is shown five ways; four
  Premium upsells; the ring reads 100% on day 1.
- App-wide: 4-14 cyan elements per screen, 31 hardcoded dark-cyan tints that
  render wrong in Dawn/violet, 18 font sizes, eyebrows used inconsistently,
  four card styles, plan name repeated in headers.
- Bugs: Profile says "Tap trash icon to delete" when no trash icon is shown;
  paywall adds a second status-bar inset (about 60pt dead space) and its close
  button lacks pressed style and hitSlop.

## Design rules (adopted)

1. One filled accent element per screen: the primary action. Other elements
   use text color or secondary text; eyebrows use secondary text color.
2. Say each fact once per screen (plan name, quota, step, task count).
3. At most one optional card on Today per day; teach-once tips wait until
   they are relevant.
4. Supporting copy at most two lines; no instructional hint rows.
5. Accent tints come from the theme (`withAlpha(theme.accent, a)`), never a
   hardcoded color; enforced by lint.

## Plan and acceptance

### A. Today

- A1 Habit first. The reminder primer moves below the habit while pending
  and is never shown above the day-complete card.
- A2 The "next-action" signal card is removed; "Ask Coach" becomes a link in
  the habit card. Reduce-friction and protect-pattern signal kinds keep their
  card.
- A3 Always-visible progress line: done count, streak (or "Day N"), and month
  consistency. No "View progress" toggle.
- A4 Habit card hierarchy: larger title; cue ("When") as a subtitle; backup
  step and "I did the 2-minute version" merged into one row; milestone eyebrow
  hidden when the plan has one milestone; no empty backup block.
- A5 One optional card: primer, widget hint, or recap/invite card, by
  priority. Widget hint shortened and shown only after 3 completed days.
  Weekly recap expires 3 days into the week.
- A6 One-line header ("Becoming <name>"); Today tab badge hidden while Today
  is focused.
- A7 Collisions: toast held while the milestone modal is up; review ask
  skipped while any celebration is showing and recorded only after it runs;
  toast text wraps and stays up longer for long messages.

Accept: new-user Mark Complete top edge at or above about 350pt; engaged
user sees streak above the fold; no two celebrations on screen at once.

### B. Journey

- B1 Selected-day list only when a non-today day is selected (or arrives via
  route params); tapping the selected day again clears it.
- B2 Milestones collapsed by default.
- B3 Until 7 planned days this month, show "Day N, N of N days" instead of a
  percentage ring.
- B4 Compact progress row: small ring plus streak, best, and rest days on one
  line.
- B5 Free users see one Premium card (merged Insights teaser and "Go
  further"); the contextual "Add · Premium" stays.
- B6 Drop the duplicate "Becoming <name>" eyebrow; calendar shows only the
  weeks the month needs.
- B7 Rhythm card shows only when a habit is worth simplifying; otherwise its
  status appears inline on the milestone row. Milestone detail keeps "On";
  "When" and "Too busy" move behind "Plan details".

Accept: single-milestone engaged user scrolls at most about 2 screens; free
user sees at most 2 Premium entry points.

### C. Coach, Profile, Paywall, Onboarding

- C1 Coach: filled "Talk to Coach" primary button; quota shown once in
  secondary text; one title; neutral weekly-read card; locked state uses the
  same card. CoachSheet eyebrows become sentence case.
- C2 Profile: remove the hint row; fold the hero into the active plan row and
  drop the stats row; settings become one grouped list with neutral icons and
  state-only subtitles; free users get one upgrade row above My plans; active
  plan shown with a checkmark; no hardcoded black on accent.
- C3 Paywall: fix the doubled top inset; close button gets pressed style and
  hitSlop; drop hero icon and subtitle; compare table cut to the real
  differences with neutral check icons; sentence-case "Save 30%". Price stays
  in the CTA and all Apple-required disclosure stays.
- C4 Onboarding: welcome drops the eyebrow and the duplicate title and trims
  copy; plan review uses one edit affordance per row, placeholder styling for
  an empty resolution, one step indicator, and no milestone jargon.

### D. App-wide

- D1 Journey and Coach headers drop the plan-name subtitle.
- D2 `withAlpha(theme.accent, a)` replaces every hardcoded cyan tint; ESLint
  bans the literal.
- D3 Eyebrow labels use secondary text color.

## Verification

Type check, lint, Prettier, and all tests green; new unit tests for pure
helpers (optional-card selector, early-ring rule, calendar week count,
`withAlpha`). After-screenshots of the same new and engaged states, in dark
and Dawn, compared against the before set. A report-only reviewer pass.

## Deferred

Consolidating the type scale into a six-style `ThemedText`, shared `Card` and
`ListGroup` components, replacing the 84 `Colors.dark/light` ternaries, a full
celebration queue in AppContext, gating Stories & Support by tenure.
