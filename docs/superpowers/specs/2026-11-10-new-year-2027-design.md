# New Year 2027 push: design

Date: 2026-11-10 · Status: direction approved by Brett in chat ("Yes, write it
up"); this document awaits his approval before any plan or code.

## Intent

Brett's ask (2026-11-10): fix what is broken now, then make this the best app
a person could want for accomplishing their 2027 goals, and get people on
board, engaged, and loving it before the holidays, when people start looking.

In his words, the thing that makes it compelling: a person can look back a
year after creating their resolution and say "this really helped me get
there, it helped me be a better person." He believes few apps deliver that
retrospective, and that a few influential people telling that story honestly
would be huge. He wants marketing offloaded to agents, and it must not look
like AI slop, because people will not act on slop. Value comes first; ratings
and word of mouth follow from people who got something real. He has little
time and asked that research, not his own guesses, set the direction.

## Why this shape (evidence, 2026-11-10)

Three research passes ran before this was written. Their evidence is mostly
vendor and founder-reported, so it sets direction and is not proof.

- The constraint is distribution, not product. 1.6.0 is live with 3 ratings.
  The roadmap in `docs/enhancement-roadmap.md` is nearly all built.
- Category winners each have one wedge. This app has many features and no
  single stated promise. Nobody in the category owns "evidence over time that
  you became someone."
- App Store search is the base channel for indie habit apps; a few creator
  stories are the step change. Product Hunt and press rank low.
- People who notice AI in brand content are about four times more likely to
  trust the brand less. Real faces, real voice, real screenshots hold trust.
- A code audit found small breakages and five first-week friction points
  (listed under Part 1 and Part 2 with file references).
- The two purchase-path bugs from the 2026-10-13 review are fixed and shipped
  (verified 2026-11-10; 54 purchase and entitlement tests pass).

## The bet

One promise, everywhere a stranger meets the app:

> Your New Year's resolution, kept. With proof you can look back on.

Identity ("who you are becoming") stays as the mechanism inside the app. It
is not the headline, because it reads as abstract on a store page.

## Goals

1. Nothing embarrassing at peak: the known breakages are gone by Nov 17.
2. A new user gets a real win in their first session, on any day of the week.
3. A person who plans in November or December for a January 1 start has
   something to do, and hears from the app, before and on January 1.
4. The look-back is real, free, and shareable, and it is honest for someone
   with three weeks of history.
5. Strangers can find the app during Dec 26 to Jan 15, and what they find
   states the promise and shows real people.
6. We can see the funnel: install, plan approved, first action, day 7.
7. Brett spends about 2 hours a week. Agents do the rest and wait at his gates.

Measures, to be checked on Dec 20 and Jan 15:

- 25 App Store ratings by Dec 20 (from 3).
- Featuring nomination submitted by Nov 14.
- 1.7.0 approved by Dec 15.
- At least 15 founding-cohort members finish the 21 days; at least 5 give a
  quotable story with written permission.
- At least 2 creator posts live by Jan 5.
- Funnel numbers exist for every step in goal 6.

## Non-goals

- New feature areas. No social feed, no friends, no challenges engine, no
  Android work, no web app.
- A paywall inside onboarding (see "Calls made here").
- Steel City Gameday and Horse Racing Companion.
- Email capture or a waitlist. The app is live; send people to the store.
- Rebuilding the coach or the recap screens beyond what is listed.

## Anti-goals (these make it a failure even if it ships)

- Guilt, shame, or loss-framed mechanics. The existing principles in
  `docs/enhancement-roadmap.md` stand: no streak guilt, milestones only fill.
- Public copy that reads as machine-written. Every public word gets Brett's
  final edit; nothing auto-posts to a new channel without his say.
- Testimonials that are scripted, invented, paraphrased into claims the
  person did not make, or published without written permission.
- Free access given to a creator or cohort member without clear disclosure
  (FTC material-connection rule).
- Health or outcome claims the app cannot support.
- Shipping from uncommitted edits, or any copy of the repo in iCloud.

## Constraints

- Human gates stay human: merges to `main` (Railway deploys production from
  it), every App Store Connect action, sending any message, any spend.
- App Review slows over the holidays. 1.7.0 must be in review by Dec 10.
- Builds are local only (`eas build --local`); upload by the headless path in
  `CLAUDE.md`. Bump `expo.version` before each build.
- Process per `wiki/conventions/ai-native-sdlc.md`: accepted plan before
  code, self-verification (types, lint, tests, simulator) before handoff.
- Persona-scoped state in `client/context/AppContext.tsx` stays memoized.
- Time math stays Pacific-aware and tested under `TZ=America/Los_Angeles`.

## Part 1: Fix now (target: merged and 1.6.1 submitted by Nov 17)

Server and site (deploys on merge to `main`):

1. `www.resolutioncompanion.com` fails TLS (cert is `*.up.railway.app`).
   Fix: add the `www` custom domain to the resolution-companion Railway
   service, or remove the `www` DNS record. Railway console is Brett's gate;
   the builder prepares exact steps and verifies with `curl -sI`.
2. `releases.json` still says 1.6.0 is "submitted". Mark it released
   2026-10-24.
3. `server/templates/landing-page.html`: "Version 1.5" appears twice and
   "© 2026" is hardcoded (line 569). Render the year at request time and
   read the version from `releases.json`.

Client (ships as 1.6.1):

4. Ratings prompt. Today it fires 4 seconds after the 7th day-complete
   celebration, and only a manual final check-off on Today counts
   (`client/screens/TodayScreen.tsx:116, 196-204, 1040, 1318-1352`); widget,
   notification, and Health completions never count, and the celebrate flag
   is never reset. New behavior: count completed days from stored daily
   logs, whatever path logged them. Ask once after the 2nd fully completed
   day, and never in the same session as onboarding or a paywall. Add a
   "Rate the app" row in Profile that opens the App Store write-review page.
5. Reminder primer pairs the chosen time with the first habit's cue
   ("8:00 PM, around 'after morning coffee'",
   `client/components/ReminderPrimerCard.tsx:33`). The fix exists on local
   branch `claude/primer-routine-bucket` (commit 4969ef0), unpushed, applies
   cleanly to `main`. Bring it in and check it on the simulator.
6. Funnel telemetry gaps (`client/lib/telemetry.ts`; server allowlist in
   `server/routes.ts`). Add events for: AI consent accepted and declined,
   self-setup chosen, plan approved (with start today vs January 1), first
   action completed, primer answered (on, not now), review prompt requested,
   coach session started, weekly review started. Add a `source` to
   `paywall_viewed`. Counts only, per device per day, as today; no content.

## Part 2: New Year release 1.7.0 (in review by Dec 10)

Each item names the behavior. Layout, copy drafts, and internals are the
builder's, within the UI conventions in `CLAUDE.md`.

1. A win on day one. If the plan's first scheduled day is not today
   (`TodayScreen.tsx:1566-1625` shows only a "next scheduled day" link),
   Today offers the habit's 2-minute version as a "start now" action. It
   records a completion for today, shows the normal celebration, and does
   not change the schedule or create a missed day tomorrow.
2. January 1 planners. Today they see a static countdown for up to 6.5 weeks
   and get no notification, even on January 1 (`PlanCountdownCard.tsx`,
   `client/lib/notifications.ts:634-639`). New behavior:
   - Choosing a January 1 start asks for notification permission at that
     moment, with a plain reason.
   - Until the start date, the countdown card offers an optional warm-up:
     the 2-minute version, any day, counted as practice. Nothing before the
     start date can count as missed.
   - At most one notification a week before the start, and one on the
     morning of January 1.
3. A stronger reminder ask. The ask is a passive card shown for at most 3
   days (`client/lib/today-layout.ts:36, 52-59`) and it is the only return
   hook. Move the ask into plan review: "When should we nudge you?" with the
   time suggested from the habit's cue, editable, and a clear "Not now". The
   passive card stays as the fallback for people who said not now.
4. The look-back, free and honest.
   - "The Year You Became" is free in full, including sharing. Premium keeps
     coach memory, insights, extra identities, and the second shield.
   - Minimum-data guard: with fewer than 60 days of history, show a "Your
     first N weeks" edition. No "December led the year", no "1 active month"
     (`client/lib/recap.ts:300-391`).
   - The closing share card is an identity statement with one number, in
     the person's own persona words, for example "I became a runner. 143
     votes." No comparison to other users (there is no such data).
5. A letter to your future self. One optional field at the end of plan
   review: "What do you want to be able to say a year from now?" Stored on
   the device with the persona. Shown again on the recap's closing card, and
   on the one-year anniversary of the start date. Editable from Profile.
   Never sent to the server and never used in prompts.
6. One free milestone at a time. Free users cannot add any milestone today;
   completing the first one leads straight to the paywall
   (`MilestoneCompleteModal.tsx:298-306`,
   `BenchmarkEditorScreen.tsx:109-111`). Free users may hold one active
   milestone, so they can add the next after finishing one. A second
   concurrent milestone stays Premium.
7. Billing grace (server, `server/routes.ts:1491-1566`). Handle
   `DID_FAIL_TO_RENEW` so a payer in Apple's billing grace period keeps
   Premium until the grace period ends; handle `SUBSCRIBED`; ignore
   notifications older than the stored row by `signedDate`; return a 5xx
   when the event cannot be saved so Apple retries.
8. Store listing in the binary's metadata window: release notes and "what's
   new" copy for 1.7.0 state the promise.

## Part 3: Getting found (Nov 10 to Jan 15)

Roles: agents research, list, draft, cut, schedule, and report. Brett
records, edits, approves, sends, and submits.

1. Featuring nomination (this week). Agent drafts the App Store Connect
   nomination for the 1.7.0 release; Brett submits by Nov 14.
2. Store listing. New subtitle, keywords, and screenshots led by the
   promise; one "New Year" custom product page with its own keywords; one
   in-app event starting Dec 26. Screenshots come from the real app on the
   simulator. Agent prepares everything; Brett enters and submits it.
3. Founding cohort. About 30 people, a 21-day run from Nov 30 to Dec 20, on
   the live app. Recruited by Brett from his own network and one LinkedIn
   post. In return: a free year of Premium by App Store offer code, stated
   openly. Agent drafts the invite, the three check-in notes, and the
   closing request for a story with a written permission line. Brett's own
   story is the first one told.
4. Creators. Agent builds a list of 60 small creators (about 2k to 50k
   followers) in habit, productivity, study, faith, ADHD, and midlife
   reinvention niches, with a personal first line for each. Brett sends
   about 40 from his own accounts over two weeks. Offer: a free year of
   Premium, 30 days of real use before any post, no script, disclosure
   required. An optional flat fee needs Brett's approval per creator.
5. One content pipeline. Keep the weekly content pack and the X arc. Stop
   the separate weekly "Mid-Year Reset" batch job; mine its backlog for the
   best pieces. Source material becomes Brett's voice memos, cohort stories,
   and real screenshots. One 10-minute voice memo a week from Brett.
6. Apple Search Ads. Build the "New Year 2027" exact-match group now, kept
   paused. Turn on Dec 20 only if ratings are at 15 or more, capped at about
   $10 a day. Spend is Brett's approval.
7. Reddit. One honest founder story in late December from Brett's own aged
   account, rewritten in his words, following each sub's rules. Agents find
   "what app do you use" threads and draft replies for him.

## Calls made here (mine, not Brett's; change any of them)

- Two releases: a small 1.6.1 by Nov 17 so the cohort gets a working ratings
  prompt and we collect funnel data before 1.7.0 is designed in detail.
- No onboarding paywall. Benchmarks say it converts better, but it fights
  "value first" and we have no funnel data yet. Revisit in January.
- The recap becomes free in full. It is the sharing loop, and Strava drew a
  backlash for gating its recap.
- Cohort and creator access is a free year by offer code, not "lifetime". A
  lifetime product may not exist in App Store Connect, and offer codes need
  no build.
- The letter stays on the device. Simpler and private; the cost is that it
  is lost with the device if there is no backup.
- No email capture, no waitlist, no Product Hunt, no press.
- Ratings prompt after the 2nd completed day. Earlier than a typical ask,
  because first-week users are the ones we have.

Added after a builder read the draft (2026-11-10):

- Two plans, not one. Parts 1 and 2 get an engineering plan in this repo.
  Part 3 gets its own launch runbook. The posting jobs and the weekly content
  pack run from Brett's assistant on the Mac mini, and the "Mid-Year Reset"
  batch is a scheduled task on the work Mac; neither lives in this repo.
  Drafts that wait on Brett go in a tracked folder, `docs/launch-2027/`.
- The website follows the promise. The landing-page hero and `/new-year`
  are rewritten around the promise and deployed with 1.7.0, copy approved by
  Brett before merge. A "real people" section is added only when cohort
  stories with permission exist (after Dec 20). Until then, no testimonials.
- The cohort starts today, not January 1. The invite says so. Their 21 days
  run on the live app, so they log real days and can reach the ratings ask.
- "Start now" is a real vote. It counts as a completed day, appears in
  history, and counts toward the ratings ask and the recap number.
- Warm-up before a January 1 start is practice. It is stored and shown as
  its own line in the recap ("warm-up votes"), and it does not count toward
  streaks, consistency, the share-card number, the ratings ask, or the
  60-day guard. The 60 days run from the start date.
- "One free milestone at a time" means a free user can add a milestone only
  when they have no unfinished one. Milestones a free user already holds
  from onboarding stay; nothing is removed or locked.
- The free year is an offer code on the existing annual product: free for
  one year, then it renews at the normal price unless cancelled. The invite
  and the disclosure say exactly that. Codes are redeemed through the App
  Store, so no client work is needed.
- The billing-grace work adds columns to the production subscriptions
  table. The builder writes the migration; Brett runs `npm run db:push`.

## Decisions that are Brett's

1. Pricing. DECIDED by Brett 2026-11-10: prices stay at $2.99 a month and
   $24.99 a year. Raising them now is premature; utilization and people
   getting value come first. Pricing is reviewed at the Jan 15 check, using
   the funnel and usage numbers this work makes visible. No price change,
   price test, or New Year price offer is in scope before then.
2. The annual intro offer. Code shows "1 week free" when App Store Connect
   has a free-trial intro offer on the annual product. Confirm it is
   configured, and choose one week or one month.
3. An App Store Connect Sales and Reports key, so installs and revenue are
   known. Without it the Jan 15 review has no baseline.
4. Confirm the Meta "Mid-Year Reset" campaign is paused.
5. Billing Grace Period in App Store Connect. If it is off, either turn it
   on or say so; with it off, the grace part of Part 2 item 7 is cut and
   only the other webhook fixes remain.
6. Create the free-year offer codes on the annual product by Nov 27 (about
   30 for the cohort, 40 for creators).
7. Stop the "Mid-Year Reset" scheduled task on the work Mac.

## Left to the builder

- Screen layout, component structure, copy drafts, animation, and test
  design for every Part 2 item.
- How the "start now" and warm-up completions are stored, provided streak
  and missed-day math stay correct and tested.
- Notification wording and scheduling internals within the existing 60
  notification budget.
- Whether Part 2 lands as one branch or several.

## Sequence

| Week of | Product                       | Getting found                            | Brett (about 2 hours)                      |
| ------- | ----------------------------- | ---------------------------------------- | ------------------------------------------ |
| Nov 10  | Part 1 fixes, plan for 1.6.1  | Nomination draft, creator list           | Submit nomination; fix `www` in Railway    |
| Nov 17  | 1.6.1 submitted; 1.7.0 plan   | Listing copy, cohort invite              | Voice memo; invite cohort; approve listing |
| Nov 24  | 1.7.0 build                   | Creator first lines; cohort opens Nov 30 | Send 20 creator messages                   |
| Dec 1   | 1.7.0 build, simulator checks | Cohort check-ins                         | Send 20 more; reply to creators            |
| Dec 8   | 1.7.0 in review by Dec 10     | Product page, event, clips               | Film 3 short clips; submit listing         |
| Dec 15  | Hold for review fixes         | Cohort stories, Search Ads group         | Approve stories and posts                  |
| Dec 22  | Monitor                       | Posts go out; Reddit story               | Post; turn on ads if ratings allow         |

## Not verified

- Whether the annual free-trial offer is live in App Store Connect.
- Real install, conversion, and revenue numbers.
- A real purchase on a physical device since 1.5.0.
- Every benchmark above marked as vendor or founder-reported.
