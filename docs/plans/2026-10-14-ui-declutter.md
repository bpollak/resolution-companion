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

### E. Home screen widget (added 2026-10-14 at Brett's request)

Findings: the widget leads with a "1/3" ring instead of the habit; medium
and large carry two or three filled accents; the 2-minute button truncates
and buttons are about 28pt tall; fixed `#0f0f1a` background, fixed white text,
no light variant, no tinted/clear rendering support; only a round Lock
Screen gauge. Bugs: no-plan users see "Rest is part of becoming"; rest days
show a 0/1 ring; widget streak can differ from Today (shield count); a quick
double tap can overcount until the next sync; placeholder copy matches no
real state.

- E1 Small: habit title first, progress line ("0/1 done · 12-day streak"),
  small ring as the only accent; rest and all-done states with their own
  copy.
- E2 Medium: title and progress line on the left, one 44pt check button on
  the right (the only accent), "2-minute version" as a secondary link.
- E3 Large: name line, progress line, up to three habit rows with check
  buttons; no big ring, eyebrow, or "N more" footer.
- E4 Lock Screen: round gauge with rest and done icons; new rectangular
  (title and progress) and inline families. Decision (Brett deferred to
  Claude, 2026-10-14): the rectangular widget opens Today instead of logging,
  because Lock Screen widgets get brushed by accident and an uncast vote
  breaks the honest streak. One-tap logging stays on Home Screen widgets,
  Siri, and the app.
- E5 Light and dark variants from asset colors, `.primary`/`.secondary`
  text, `widgetAccentable` on the accent only, tinted-mode fallbacks.
- E6 Bugs: explicit no-plan state, rest-day ring, streak passed from the
  app's progress snapshot, idempotent vote counting, realistic placeholder
  and previews, Siri replies without em dashes.
- E7 Bridge: additive optional fields (`hasPlan`, `planDay`, `shieldUsed`,
  `progressLine`) so older saved data still decodes.

Accept: the widget's first readable element is the habit; one accent per
family; legible in light, dark, and tinted; data matches Today.

### F. Tap and scroll responsiveness (added 2026-10-14 at Brett's request)

Findings (V8 benchmark on synthetic data, 3 daily habits since Jan 1):
`toLocaleDateString` with a weekday option runs about 5,000 times per Today
check-off inside progress, recap, insights, and widget builders
(`buildProgressSnapshot` 24.5 ms, `buildYearRecap` 74 ms; about 15x faster
with a `getDay()` lookup). Today rebuilds year and month recaps on every log
change even when hidden. React Compiler skips TodayScreen, JourneyScreen,
ProfileScreen, CoachSheetScreen, and AppProvider (refs written in render,
try/finally, throw, unpreservable memoization). One check-off re-renders
every mounted tab. Every tap reschedules all reminders and resyncs the
widget synchronously.

- F1 Weekday lookups use `getDay()` everywhere on the hot path; a regression
  test fails if the builders call `toLocaleDateString`.
- F2 Year and month recap builders run only when their card can show and
  reuse the progress snapshot's log index.
- F3 Remove React Compiler bailouts in the heavy screens (ref writes moved
  to effects, try/finally and throw moved into helpers, memo deps fixed);
  add a check that reports compiler bailouts.
- F4 Non-visible consumers (Journey, Insights, Coach) read deferred values so
  Today's checkmark commits first. Tab freezing settings stay as documented.
- F5 Journey calendar cells become memoized components with precomputed
  labels; focus-only state moves into small children.
- F6 Reminder rescheduling and widget sync are debounced off the tap path;
  subscription checks skip state updates when nothing changed.

Accept: zero `toLocaleDateString` calls in progress builders; a check-off
does no recap work when recaps are hidden; compiler reports no bailouts in
the four screens; tests and checks green. Device timing with Instruments on
a Release build is recommended before release (not possible headless here).

## Verification

Type check, lint, Prettier, and all tests green; new unit tests for pure
helpers (optional-card selector, early-ring rule, calendar week count,
`withAlpha`). After-screenshots of the same new and engaged states, in dark
and Dawn, compared against the before set. A report-only reviewer pass.

## Deferred

Consolidating the type scale into a six-style `ThemedText`, shared `Card` and
`ListGroup` components, replacing the 84 `Colors.dark/light` ternaries, a full
celebration queue in AppContext, gating Stories & Support by tenure.

## Results (2026-10-14)

Commits on `claude/review-fixes-2026-10-13`: dcab4b9 (plan), ac49bff
(A-D), 48dde14 (review follow-ups), 7576769 and d1bf787 (plan E, F),
6de6336 (widget and responsiveness), plus a final review fix commit.

Measured on the simulator (iPhone, 402x874pt), before and after:

- Today, new user: Mark Complete top edge moved from about 655pt to about
  296pt; the habit is the first card; one optional card.
- Today, 33-day user: streak and month consistency visible without
  scrolling; weekly recap holds the single optional slot; no toast collision
  with the milestone modal.
- Journey, 33-day user: about 3.5 screens of scroll down to about 2;
  Premium entry points 4 to 2; Day N instead of 100% on day one; calendar
  sized to its weeks.
- Profile fits one screen; paywall top gap removed; Coach has one primary
  button.
- Widget (signed simulator build with App Group): habit first, one accent,
  follows light/dark; check-off from the medium widget logged in the app.
- Responsiveness (V8 benchmark): progress snapshot about 24 ms to 2 ms per
  check-off, year recap 76 ms to 1 ms, zero Intl calls in builders; React
  Compiler bailouts removed from the heavy screens and guarded in CI.

Verification: type check, lint, Prettier, `check:compiler` (42 files), and
492 tests pass. Three report-only reviews; all blockers and should-fix items
applied.

Not verified here: Lock Screen widgets and tinted/clear Home Screen modes
on device, Maestro flows (Maestro not installed), device timing with
Instruments on a Release build.

### G. Affordance and signifier pass (added 2026-10-14, Brett, build 105)

Brett: open circles that mean "completed" or "opens a drawer" have always
been hard to read, and the declutter pass did not catch it. The first audit
judged clutter and hierarchy, not what each glyph promises. Observed on
Journey (build 105): a milestone row with a leading open circle (looks like a
checkbox) that actually expands a drawer (chevron on the right); day-list
rows whose whole row toggles completion yet show a navigation chevron;
strikethrough on completed habits; the same count three times ("5/21", "5 of
21 days done", "5 days done"); a habit card nested inside the milestone card
with "Ask Coach" floating outside; a target-date countdown ("6 days left")
that reads as days remaining in the milestone.

Rules (apply app-wide):

- G1 A circle or check-circle is only ever a completion control the user can
  tap. Status is shown with a filled badge, progress bar, or text.
- G2 Chevron right means "opens another screen"; chevron down/up means
  "expands here". Never both on one row, and never on a row whose tap does
  something else.
- G3 No strikethrough for done items: check plus secondary color.
- G4 No card nested inside a card; one surface per object.
- G5 Each fact once per view.
- G6 Everything tappable looks tappable; nothing that looks tappable is not.
- G7 Countdowns say what they count ("Target Oct 20", "16 more days to go").

Accept: an audit table of every glyph/row pattern per screen with its rule
verdict; all violations fixed; simulator screenshots of Journey (collapsed,
expanded, day selected), Today (pending, completed rows), Profile, Coach;
Maestro flows touching changed labels re-run green.

#### G audit (2026-10-14)

Every glyph and row pattern, read against code (and build 105 for Journey).
Verdict is Pass, or the rule broken and the fix. "Accent text" counts as a
link signifier: in this app accent-colored words are tappable (Upgrade,
Adjust, See plans), so static accent text breaks G6.

| Screen / component | Pattern | What it meant | Verdict |
| --- | --- | --- | --- |
| Today, ActionCard | Filled "Mark Complete" button with a circle glyph | Tap to complete | Pass (G1: the circle is the completion control) |
| Today, ActionCard | "Too busy? Just: X · I did this" row | Logs the 2-minute version | Pass while pending. G6: a static copy of the row rendered on a done card. Fix: shown only while pending |
| Today, ActionCard | "Ask Coach" icon link | Opens Coach sheet | Pass |
| Today, CompletedActionRow | Filled check, strikethrough title, "Undo" | Row toggles back to pending | G3. Fix: no strikethrough; shared CompletionCheck plus secondary title |
| Today, CompletedActionRow | "2-minute version" / "Completed by Health" in accent | Static source note | G6. Fix: secondary color |
| Today, CompletedActionRow | Note icon (edit-3 / message-square) | Add or edit a note | Pass |
| Today, DayCompleteCard | Large filled check with burst | Celebration, not tappable | Pass (filled status badge, not a row glyph) |
| Today, DayCompleteCard | "This is how it starts." in accent (first day) | Static line | G6. Fix: text color |
| Today, DayCompleteCard / TomorrowLink | "Tomorrow: N habits ›" | Opens Journey on tomorrow | Pass (G2: opens another screen) |
| Today, signal card | Check-circle eyebrow for the "complete" kind | Status | G1. Fix: bare check |
| Today, PlanCountdownCard | "12 days to go" | Days until the plan starts | G7. Fix: "12 days until day one" |
| Today, primer / recap / invite / witness cards | x dismiss, arrow-right CTA | Dismiss, open | Pass |
| App-wide, Toast | Check-circle on success toasts | Status | G1. Fix: bare check |
| Journey, progress row | Ring, fire, award, shield stats | Static status | Pass |
| Journey, month header | Chevron left / right | Previous / next month | Pass (paired paging control, labeled) |
| Journey, calendar cells | Numbered marker (filled, ring) with corner check / minus / x / shield / moon | Day status; tap selects the day | Pass (calendar idiom; the marker carries a date, never an empty circle) |
| Journey, legend | Same corner glyphs | Key | Pass |
| Journey, selected-day rows | Circle / check-circle, chevron-right, strikethrough, milestone name on every row | Row toggles completion | G2 (chevron on a toggle), G3, G5 (milestone name repeated with one milestone). Fix: CompletionCheck as the only glyph, no chevron, secondary text when done, milestone name only with 2+ milestones |
| Journey, selected-day rows | Source note in accent | Static | G6. Fix: secondary |
| Journey, future-day rows | Accent calendar glyph | Not checkable yet | Pass; glyph now secondary so it reads as static |
| Journey, milestone header | Leading circle / check-circle | Status, while the row expands | G1. Fix: removed |
| Journey, milestone header | "Daily" badge from the first habit only | Cadence | G5 (repeated in the expanded rows) and wrong for multi-habit milestones. Fix: removed |
| Journey, milestone card | "5/21", "5 of 21 days done", habit "5 days done" | One count three times | G5. Fix: "5/21" in the header, per-habit count only with 2+ habits |
| Journey, milestone caption | "· 6 days left" | Time to the optional target date | G7. Fix: one line, "16 more days to go · Target Oct 20" (target only when set) |
| Journey, milestone complete | Check-circle and "Complete. Habit locked in" | Status | G1. Fix: filled "Complete" badge |
| Journey, milestone footer | Outlined "Edit" pill on the collapsed card | Opens editor | Moved into the expanded footer as a text button with "Ask Coach" (one control set per object) |
| Journey, ActionPlanCard | Inset card inside the milestone card | Habit detail | G4. Fix: flat habit rows (title, cadence) inside the same card |
| Journey, ActionPlanCard | "On: Every day. Each completed day fills this milestone" | Schedule plus repeated explanation | G5. Fix: cadence only |
| Journey, milestone | "Ask Coach about this milestone" floating below the card | Opens Coach | G4 / G6. Fix: "Ask Coach" text button in the card footer |
| Journey, "Plan details" | Chevron down / up | Expands cue and fallback in place | Pass (G2) |
| Journey, RhythmStatusLine / rhythm card | Check-circle for "Working well" | Status | G1. Fix: trending-up |
| Journey, rhythm rows | "Adjust" / "Adjust this habit →" | Opens habit editor | Pass |
| Journey, Insights (free) | Lock plus "See plans →" card | Opens paywall | Pass |
| Journey, Stories & Support | Rows with chevron-right | Open Year recap / Witness screens | Pass |
| Journey, StatChip | (component) | No consumers; progress row replaced it | No verdict; dead code |
| Coach lobby | Filled "Talk to Coach", locked card with "Upgrade" | Open sheet / paywall | Pass |
| Coach lobby | Weekly read with chevron down / up | Expands in place | Pass |
| Coach lobby, Plan Changes | "Applied" in accent on a static card | Status | G6. Fix: primary text color |
| Coach lobby, Past sessions | Chevron-right rows | Open the session view | Pass |
| Coach, past session view | Momentum "%" in accent where a header button sits | Static figure | G6. Fix: secondary |
| CoachSheet | Suggestion chips, plan-adjust chip | Send prompt / request preview | Pass |
| CoachSheet, plan preview | "Before:" value struck through | Old value being replaced | G3 vocabulary. Fix: label alone carries it |
| CoachSheet, evidence card | Bordered card (same border as the tappable chips), accent "90%" beside the accent "Done", and the same 90% again in the detail line | Static summary | G5 / G6. Fix: no border, value in text color and shown only when the detail does not already state it |
| CoachSheet, chat bubble icons | Copy / helpful / report | | Pass |
| Profile, upgrade row | Zap plus chevron | Opens paywall | Pass |
| Profile, My plans | Active plan check, trash on others, "+ Add" / lock | Selection mark, delete, add | Pass (check is a selection mark, no circle) |
| Profile, Premium row | Leading check-circle | Status | G1. Fix: star |
| Profile, Widget & Siri | Chevron-right | Shows a how-to alert | G2. Fix: no chevron |
| Profile, Health / Reminder / Appearance / Privacy / About, iCloud Backup | Chevron-right | Open sub-panels / screens | Pass |
| Profile > Privacy, Clear Local Data / Delete Account | Chevron-right | Confirm alert | G2. Fix: no chevron (red title signals the action) |
| Profile > About, Rate / Privacy Policy / Terms | Chevron-right | Leaves the app | G2. Fix: arrow-up-right |
| Profile > About | "Version 1.5.0" in accent | Static text | G6. Fix: secondary |
| Profile > Appearance | "Nothing unlocked yet" in a row card with an icon tile | Static note | G6. Fix: plain text |
| Profile > Appearance / Reminders / Privacy | Switch rows, reminder radio chips | Toggles, choice | Pass |
| ActionEditor, BenchmarkEditor | Header x / check | Cancel / Save (labeled) | Pass |
| ActionEditor, BenchmarkEditor | Uppercase section labels in accent | Headings | G6. Fix: secondary |
| ActionEditor | Day chips, filled when on | Checkbox role | Pass; hardcoded black ink replaced with theme.buttonText |
| BenchmarkEditor | "Target: Oct 20 · 6 days left" | Time to target | G7 (same phrase misread on Journey). Fix: "in 6 days" |
| BenchmarkEditor | Habit list Edit pill and trash; info / empty boxes | Edit, delete; static | Pass |
| Onboarding plan review | Square / check-square "Included in your plan" | Include toggle | Pass |
| Onboarding plan review | Edit icon that turns into a check while editing | Close the editor | G1 / G6 (check reads as a done mark). Fix: "Done" text |
| Onboarding | "Preview ›" | Opens step 2 | Pass |
| Onboarding | "Hide keyboard" with chevron-down | Dismiss keyboard | G2. Fix: keyboard-close glyph |
| Paywall | Plan cards with radio circles | Select plan | Pass (selection control, radio role) |
| Paywall | Compare table checks, close x, success check badge | Static / close / status | Pass |
| Month / Year recap | Decorative icons, Share | | Pass |
| Year recap (free) | Lock teaser card with no cue | Opens paywall | G6. Fix: trailing chevron-right |
| Milestone complete modal, AI consent modal, Witness, iCloud Backup | Award badge, external-link, x, buttons | | Pass |
| Widget (medium / large) | Filled accent circle with check | Logs the habit | Pass |
| Widget (medium / large / small) | DoneMark: filled check-circle | Static "done" | G1 (same shape as the tappable button beside it). Fix: bare secondary checkmark |
| Lock Screen rectangular | Leading circle before the habit | Widget opens Today, never logs | G1. Fix: removed |
| Siri App Shortcuts | checkmark.circle tiles | Perform the completion | Pass |

#### G results (2026-10-14)

All violations in the table are fixed in the working tree on
`claude/review-fixes-2026-10-13` (uncommitted). Shared vocabulary:
`client/components/CompletionCheck.tsx` (open circle pending, filled check
done) is the only circle glyph in list rows and appears only where the row
toggles completion (Today completed rows, Journey day list).

Journey milestones: header is title, "9/21", chevron (the whole header,
bar, and caption are one button with expanded state); one caption from
`formatMilestoneCaption` ("12 more days to go · Target Oct 20", or a tinted
"Complete" chip); expanded content is flat habit rows (title, cadence,
per-habit count only with 2+ habits, rhythm status with Adjust, Plan
details), then Edit and Ask Coach text buttons. The inline rhythm status
moved from the collapsed card into each expanded habit row so the collapsed
card stays four elements (B7 intent kept: status still inline on the
milestone). A solid "Complete" pill read as a button next to the filled
Add control, so it is a tinted chip in success color.

Verification: type check, lint, `check:compiler` (43 files), Prettier on
changed files, and 504 tests (new: `formatMilestoneCaption`,
`formatShortDate`, `dayListMilestoneLabel`; reworded `formatTargetCountdown`)
pass. Release simulator build with `qa/seed_marketing.py` plus a scratchpad
tweak (second habit and a target date on one milestone, two milestones
restarted recently) for Journey collapsed, expanded (one and two habits), a
past day selected and toggled, Today pending plus completed, Profile,
Privacy, About, Coach lobby and sheet.

Maestro on the final build, all PASS: maestro-regression,
maestro-stateful-regression (tab-first-tap, today-undo, editors-persistence,
editors-relaunch), ambient-coach, later-bets, \_self-setup-plan + engagement,
roadmap-completion, rewards, ai-onboarding. Selector updates: milestone
header labels now continue with the caption (`.* days done.*`); Edit lives
in the expanded footer, so editors-persistence expands first and, because
the card stays expanded after the editor, asserts the renamed habit without
re-tapping; ambient-coach expands the milestone before finding the rhythm
"Adjust" row. Not re-run (labels untouched): widget-prepare/verify,
accessibility, coach flows, subscription-status, marketing-shots;
year-recap and coach-offline remain blocked as documented.

Not verified visually: the widget's DoneMark and Lock Screen rectangular
changes (compiled in the Release build; seeing them needs a signed build
with the App Group), Dawn theme rendering of the tinted Complete chip.
