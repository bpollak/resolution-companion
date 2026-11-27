# App Store listing draft for 1.7.0

**Draft for Brett's edit; nothing is entered in App Store Connect by this task.**

Date: 2026-11-27. Plan: `docs/superpowers/plans/2026-11-27-steps-release-1.7.0.md`, Task D2.
Spec and approved promise: `docs/superpowers/specs/2026-11-10-new-year-2027-design.md`.

This copy describes 1.7.0, not the live 1.6.1. It should go into App Store
Connect only with the 1.7.0 binary. Lines that depend on a feature that could
still be cut are marked.

App name (unchanged): Resolution: Habit Tracker

## Subtitle (30 characters max)

- Option A: `New Year goals, step by step` (28 characters)
- Option B: `From a goal to daily steps` (26 characters)

Recommendation: Option A for the December and January window. It puts "New
Year" and "goals" in front of the store's search next to "Resolution" and
"Habit Tracker" in the name, and it carries the new message in a few words.
Switch to Option B in February, when people stop searching for "New Year".

## Promotional text (170 characters max)

`Know your New Year's goal but not the steps? Talk it through with Coach. See two or three steps that lead there, start with one, and add the next when you're ready.`

164 characters. Promotional text can be changed at any time without a new
build.

## Keywords (100 characters max, commas with no spaces)

With subtitle Option A:

`routine,coach,daily,planner,streak,motivation,journal,discipline,consistency,self,improvement,ai`

96 characters.

With subtitle Option B ("daily" moves to the subtitle, "new" and "year" move
here):

`routine,coach,planner,streak,motivation,journal,discipline,consistency,self,improvement,ai,new,year`

99 characters.

Neither list repeats a word from the app name (resolution, habit, tracker) or
from its subtitle, because the store already indexes those. These words were
chosen by judgment. Nobody has checked them against search volume data yet.

## Description, first paragraph

Your New Year's resolution, kept. With proof you can look back on.

Most of us know the goal. We don't always know the steps. Tell Coach what you
want in your own words, even if it's as loose as "get healthier." You talk it
through, Coach names two or three steps that lead there and says why each one
helps, and you pick one to start. The others wait in Journey until you're
ready for them.

Notes for the edit:

- The first line is the approved promise. "With proof you can look back on"
  is only honest if the free year look-back (plan Track E) ships in 1.7.0.
  If Track E is cut, drop the first line and open with "Most of us know the
  goal."
- Coach is an AI coach. The rest of the current description, including the
  line that says so and the subscription terms, stays as it is.

## What's New in 1.7.0

Know the goal but not the steps? This update is for that.

- Coach names the steps. Tell Coach your goal and it suggests two or three
  steps toward it, with a few words on why each helps. You choose one to
  start.
- Your next steps wait in Journey. The ones you didn't start with are kept
  there. Add one when you're ready.
- Coach can add a step. Ask "Help me add a next step," look at the preview,
  and add it to your plan.
- Your streak history stays put. Changing the days of a habit no longer
  changes the streaks you already earned.
- Your year look-back is free. Everyone can see it and share it. (Depends on
  Track E. Remove this line if Track E is cut.)

## Screenshot captions

Five screenshots, in this order. Each one is captured from the real app on
the simulator. The first is a real onboarding conversation, typed and
answered live. It is not a mock-up or an edited image, and the Coach reply
shown has to be the reply the app gave.

1. **Screen:** onboarding chat that starts from a loose goal, such as "I want
   to get healthier this year," and shows Coach naming the steps.
   **Caption:** `Know the goal, not the steps? Talk it through.` (46 characters)
2. **Screen:** plan review, with the first step, its days, and the two-minute
   version.
   **Caption:** `Start with one step. You approve it first.` (42 characters)
3. **Screen:** Journey, with the Next steps card.
   **Caption:** `The other steps wait until you're ready.` (40 characters)
4. **Screen:** Today, with the day's action and its two-minute version.
   **Caption:** `One small action today. Two minutes counts.` (43 characters)
5. **Screen:** the year look-back.
   **Caption:** `Look back on your year. It's free.` (34 characters)

Notes for the edit:

- Caption 3 needs the Next steps card from 1.7.0 (plan Task A3). Caption 5
  needs the free look-back (Track E). If Track E is cut, use the Coach screen
  with "Ask Coach when you're stuck." (28 characters).
- A screenshot built from seeded history should show a plan a real person
  could have, with no numbers that read as a result the app promises.

## Left out on purpose

- No ratings, download counts, success rates, or other statistics.
- No testimonials. Cohort stories come later, with written permission.
- No health, weight, or outcome claims.
- No price or offer changes. Prices stay at $2.99 a month and $24.99 a year.
