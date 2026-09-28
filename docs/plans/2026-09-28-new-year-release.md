# Resolution Companion 1.5 "New Year" release plan

Status: accepted by Brett 2026-09-28 ("I really like all of these suggestions. Create a plan and then
begin working through all of them as a goal.")
Source review: simulator walkthrough of live 1.4.1 (build 95) as a fresh New Year's user, 2026-09-28.
Owner: Brett. Builder: Claude Code. Base: `codex/ux-review-improvements` (1.4.1 source, work-Mac repo).

## Intent

Make the app as good as possible for the New Year's window (planning in December, starting in
January), when people search for a resolution app. A first-time user should say their resolution
in their own words, get a plan that keeps their real goal, start today or on January 1, turn on a
reminder they understand, and see the home-screen widget before they leave. The existing product
thesis stays: identity ("who you're becoming"), start small, no streak guilt, honest pricing.

## Scope (19 items from the review)

### A. New Year front door (highest impact)

1. **Resolution-first onboarding.** Empty-state headline and the setup intro ask for a resolution
   in plain words. Onboarding chat shows tappable starters (Get fit, Save money, Read more, Sleep
   better, Less phone time, Learn a skill, Something else) before the first message.
   *Accept:* a new user can finish step 1 without typing; tapping a starter sends it.
2. **Keep the user's outcome.** When the user states an outcome ("lose 15 pounds"), the plan shows
   it as the milestone ("Lose 15 lb") with the habit as the daily step; the milestone never just
   repeats the habit. Optional target date uses the existing preset chips.
   *Accept:* extraction test covers "lose 15 pounds" → milestone title keeps the outcome; the plan
   review renders it.
3. **Start date: today or January 1.** Plan review offers "Start today" and, from Nov 15 to Jan 1,
   "Start January 1". Before the start date, Today shows a countdown and the first habit preview;
   no misses accrue; reminders begin on the start date.
   *Accept:* progress math ignores days before `startDate` (unit tests, Pacific TZ).
4. **Yearly free trial ready.** Paywall shows the trial when StoreKit reports it (code exists);
   plan cards move above the feature table; yearly shows its saving vs monthly.
   *External (Brett):* create the introductory offer in App Store Connect before December.
5. **Reminder primer.** Before the iOS permission prompt, one screen asks "Want a nudge?" with the
   habit's natural time pre-filled (for example 7:30 PM for "after dinner"); "Not now" defers.
   *Accept:* the system prompt only appears after "Turn on"; declining is remembered.
6. **Surface Widget, Siri and Health** on the first day-complete card (one card, dismissible,
   shown once), not only in Settings.
7. **"The Year You Became" as a marketing loop.** Locked state shows a sample story preview. A free
   one-card "Your year so far" share image is available to everyone in December and January;
   the full story stays Premium.

### B. Bugs and polish

8. Launch white flash: dark splash/background color to match the app.
9. Journey ring: "September Consistency" label fits inside the ring (shorter label, scaled text).
10. Calendar: days before the plan's start date render plain, not as rest days.
11. Plan review: "See other ideas" scrolls the revealed ideas into view; footer no longer covers
    "Add a habit of your own".
12. Coach quality (server prompts): never invent anchors or details; ask or leave blank; never
    suggest another app; no em dashes; end-of-interview message offers an in-chat "Review my
    plan" button instead of "tap Preview at the top right".
13. Coach sheet opens full height.
14. Closing Coach autosaves (no Save/Discard/Keep talking alert); a small "Saved" toast.
15. Day-one starters: no "last week" prompts until 7 days of history.
16. First Coach reply delivers one concrete suggestion (no yes/no dead end); starter-chip
    conversations still count as one check-in, unchanged.
17. Copy: "You completed all 1 scheduled action" → singular/plural; "+100 today" replaced with a
    clear line; em dashes removed from user-facing copy; habit title not shown twice on a card.
18. Vocabulary budget: user-facing terms limited to habit, milestone, and "who you're becoming".
    Replace Evolution, Persona (in copy), Evidence, Votes, Shields → "rest days you've earned",
    Micro-reads → "Quick reads".
19. Journey: trim to identity, month ring, calendar, milestones, then secondary sections
    (Insights, Stories & Support, Premium); remove the "Next Steps / Go to Today" card.

### C. Store and marketing (Brett's gates)

- App Store In-App Event "New Year, fresh start" (late Dec to mid Jan).
- Promotional text and first screenshot for January ("Keep your resolution past February").
- Submit the 1.5 build by Dec 5; Apple's review slows around the holidays.

## Out of scope

Android release, new premium features, pricing changes, account system.

## Verification (every workstream)

- `npm run check:types`, `npm run lint`, `npm test` (jest, Pacific TZ) green.
- New unit tests for items 2, 3, 5, 10, 15, 17.
- Local simulator build; fresh-install walkthrough of the New Year path; seeded-history
  walkthrough (`qa/seed_history.py`) for Journey, recap and lapse screens; Maestro regression.
- Screenshots of each changed screen before handoff.
- Independent report-only review of the full diff before any TestFlight build.

## Gates

- Code on branch `release/1.5-new-year`; nothing to `main` (Railway auto-deploys the server and
  website from `main`).
- Server prompt changes (item 12, 16) ship only when Brett says go (production).
- TestFlight upload and App Store submission: Brett's go.
- App Store Connect intro offer, In-App Event and metadata: Brett's go.

## Milestones

| Date | Milestone |
|---|---|
| Oct 10 | A1, A2, A3, B8 to B11, B17 done and verified in simulator |
| Oct 24 | A4 to A7, B12 to B16, B18, B19 done |
| Oct 31 | Full regression, independent review, TestFlight on Brett's go |
| Nov 15 | Start-January-1 option appears; ASC intro offer live |
| Dec 5 | 1.5 submitted to App Review |
| Dec 26 to Jan 15 | In-App Event live |

## Source-of-truth concern (flagged before code)

- GitHub `main` holds July app code (1.4.0 label) plus the marketing site; the live 1.4.1 app came
  from the work Mac's uncommitted tree (`/Users/bpollak/Documents/resolution-companion`, branch
  `codex/ux-review-improvements`, base 2988352) and was snapshotted with hashes into
  `~/Documents/resolution-release-1.4.1`.
- This branch starts from that verified snapshot (build 95 source). The work Mac tree also has
  post-release edits dated Sep 9 (at least `ProfileScreen.tsx`, `ActionEditorScreen.tsx`,
  `lib/health.ts`, `health-native-module.test.ts`, `profile-navigation.test.ts`, and an `android/`
  folder). The iCloud mirror hangs on read, so those are reconciled later from the work Mac.
- Before any TestFlight build, Brett chooses the single source of truth and the branch is pushed to
  GitHub so the app code stops living only on one machine.

## Review round 1 (2026-09-28, independent report-only review)

No high-severity findings. Fixed:
- Today only schedules habits that have started (a January 1 plan shows the countdown, not
  checkable rows); tomorrow's list follows the same rule; countdown flips at local midnight.
- Coach gets a "plan starts on X" context instead of a negative day count.
- Reminders open their 14-day window on the plan's start, so a December-made plan still gets
  its January 1 reminder.
- A failed Coach save no longer traps the sheet: the next close leaves without saving.
- Habits added before the start date start with the plan.
- `deriveResolution` handles curly apostrophes, "I'd like to", "I'm going to", abbreviations,
  greetings; a one-tap starter followed by a specific outcome keeps the specific one.
- "Review my plan" appears only once Coach stops asking; "Something else" starter added.
- Leftover jargon (paywall Plans row, Coach's rest-day wording, year card), January opens last
  year's story, pricing cohort ignores future start dates.

Decisions recorded:
- "Not now" on the reminder primer is remembered (no nagging); Profile still turns reminders on.
- The free year card is available all year (it's the person's own data), not only Dec to Jan.
- Anchors keep a plain time cue when the person gave none (the server schema requires one).
- Prompts ship inside the app binary, so the prompt gate is the TestFlight/App Store gate.
