# Steps Release (1.7.0) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A person who knows their resolution but not the steps can talk with Coach, see the two or three steps that lead there, start with one, and add the next one later, on an app whose progress math, purchases, and server hold up under the New Year spike.

**Architecture:** The coach conversation and extraction prompt (client-owned, `client/lib/ai.ts`) gain a "steps and why" shape; unchosen steps are stored on the plan and surfaced in Journey; a Coach chip proposes one more step through the existing preview-then-apply card. Correctness fixes make history math read the schedule that was in force on each day. Server fixes are isolated to `server/db.ts`, the Apple webhook, deletion, and a daily AI budget breaker.

**Tech Stack:** Expo / React Native (TypeScript), Express + Drizzle/Postgres, Jest (`TZ=America/Los_Angeles`), Maestro flows in `qa/`.

**Spec:** `docs/superpowers/specs/2026-11-10-new-year-2027-design.md` (approved direction), amended by the Intent below. Findings that drive Tracks B and C: the 2026-11-27 review recorded under "Evidence".

## Intent (2026-11-27)

Brett's ask, 2026-11-27: full review and regression before a New Year promotional push, and reinforce one message in both the app and the marketing: people often know the overarching goal but not the smaller tasks that get them there, and a dialogue with the AI coach should break the goal down. After the review he said: "I totally leave it up to you on the best way to proceed, and then set a goal to accomplish your plan." That is the acceptance of this plan; the calls below are the builder's and can be changed by him.

**For whom:** a first-week New Year user who types a vague goal ("get healthier").

**The goal for this work (done means all of these are true):**

1. In a live onboarding chat, a vague goal produces a reply that names two or three concrete steps toward it, says in a few words why each helps, and recommends one to start with. Days and cue shown on the review screen are ones the person stated, or are visibly marked as suggestions.
2. The steps the person did not start with are kept and shown in Journey as "Next steps", and one tap adds one to the plan. This works for free users.
3. From Coach, "Help me add a next step" proposes one habit with a preview, and Apply adds it to the plan.
4. Editing a habit's days, or adding a habit to a milestone, never changes past streaks, shields, or milestone counts.
5. The review findings listed in Tracks B and C are fixed, each pinned by a test.
6. Site and store copy drafts carry the message "Know the goal but not the steps?" under the approved promise, ready for Brett's edit.
7. `npm run check:types`, `npm run lint`, `npm test`, `npm run check:a11y`, and the Maestro regression flows pass on a local simulator build of the branch, and a PR is open for Brett.

**Evidence (2026-11-27, main at 495e928, build 1.6.1 (112)):** 624/624 tests, types and lint clean; 17 of 18 Maestro flows pass (year recap blocked by the simulator's missing StoreKit entitlement). Live onboarding with "I want to get healthier this year" then "help me break it down" returned a single 10-minute walk and broke down the walk, not the goal; the plan showed Mon/Wed/Fri "in the morning", which the user never said. Screenshots: `build/native-regression-2026-11-27/vague-goal-walk/` (gitignored).

**Calls made here (builder's, change any):**

- One release. From the 2026-11-10 spec's Part 2, only item 4 (free look-back with the minimum-data guard) and the January 1 morning notification from item 2 are in 1.7.0, as Track E, because the public promise and the January 1 start depend on them. Items 1, 3, 5, 6 and the rest of 2 move to a January 1.7.1. Track E is the first thing cut if Dec 10 is at risk.
- "One habit to start" stays. The change is that the person sees the path, not that they start with three habits.
- A next step is added as a habit under the person's current milestone, inside the existing 5-habits-per-plan limit. No price, offer, or free/Premium boundary changes, except the look-back in Track E which the spec already approved.
- "Help me add a next step" costs one coach check-in, like plan adjustment does today.
- Free users may delete their only plan and start a new one (still one plan at a time).

## Global Constraints

- Branch: `claude/new-year-2027`. Each track is built in its own git worktree off that branch and merged back; never work in or copy the repo to iCloud.
- Human gates stay Brett's: merging to `main` (deploys production), every App Store Connect action, `npm run db:push`, publishing any public copy. This plan stops at "PR open, build ready".
- No schema migration in this release. Server fixes must work with the tables as they are.
- Prices do not change. No paywall is added to onboarding.
- Telemetry is counts per device per day by event name; never remove a name from `server/telemetry-events.ts`; new names are added to both the client and server allowlists.
- `client/context/AppContext.tsx` value and mutators stay memoized. Time math stays local-date based and tested under `TZ=America/Los_Angeles`.
- Every tappable is a `Pressable` with a pressed style and `hitSlop`; follow "UI conventions" in `CLAUDE.md`. Never set `animation` on the bottom-tab navigator.
- User-facing words: "resolution", "step", "habit", "milestone", "Coach". Never "persona", "benchmark", "elemental action", or "vote" in new copy. No em dashes in any copy. No guilt or loss framing.
- The coach never invents facts about the person. Anything the model proposes that the person did not say is labelled as a suggestion.
- If a test fails, fix the code, not the test. When UI text a Maestro flow selects on changes, update the flow in `qa/` in the same task and keep its behavioral assertion.
- Use plain `node` / `npx`. Tests: `npm test`. Types: `npm run check:types`. Lint: `npm run lint`. Format: `npm run format`.
- Every commit message ends with `Co-Authored-By: Claude Fable 5.2 <noreply@anthropic.com>`.

## Review Focus

1. A plan saved by 1.6.1 has no schedule history and no stored next steps. It must load, compute the same streak it showed before the update, and show no empty "Next steps" section. Pinned in Tasks B1 and A3.
2. The model returns extraction JSON without the new `why` fields, or with fewer than three steps. The review screen must still render and Start must still work. Pinned in Task A1.
3. A person previews after one vague message. The plan must not present guessed days as their own words. Pinned in Task A1.
4. A free user at the 5-habit limit taps Add on a next step. They get a plain message, not a silent no-op or a paywall dead end. Pinned in Task A3.
5. Apple sends EXPIRED for an old period after a renewal has been stored. The payer must stay Premium. Pinned in Task C2.

---

## Track A: Goal to steps (client, plus prompt and schema on the server)

### Task A1: Coach names the steps; extraction carries why

**Files:**

- Modify: `client/lib/ai.ts` (onboarding system prompt near lines 60-90, `EXTRACTION_PROMPT` near 97-128)
- Modify: `server/persona-extraction.ts` (JSON schema; new fields optional)
- Modify: `client/lib/onboarding-plan.ts` (draft shape, sanitising)
- Modify: `client/screens/OnboardingScreen.tsx` (render the opener locally in `beginChat`; inline "Review my plan" button must not depend on the last message lacking "?")
- Test: `client/lib/__tests__/onboarding-plan.test.ts`, `server/__tests__/persona-extraction.test.ts`, `client/lib/__tests__/ai-prompts.test.ts` (create)

**Interfaces:**

- Produces: each draft step (today's "benchmark" entry in the draft) gains `why?: string` (one sentence, at most 140 characters) and `scheduleSource: "stated" | "suggested"`; the draft gains no other fields. `sanitizeDraft` defaults a missing `why` to `undefined` and a missing `scheduleSource` to `"suggested"`.

Behavior:

- Conversation prompt: after at most one clarifying question for a vague goal, the coach names two or three concrete steps that lead to the stated goal, each with a few words of why, recommends one to start with, and asks which fits. It then confirms days (and may ask one question about what usually gets in the way) before saying the plan is ready. One question per reply stays. Plain sentences, no lists longer than three short lines.
- If the person asks to "break it down", the coach breaks down the goal into steps, not the mechanics of a single habit.
- Extraction: step 1 is the one the person chose; steps 2 and 3 are the other named steps. `why` ties each step to the resolution in the person's words. `scheduleSource` is `"stated"` only when the person gave the days.
- The fixed opening question is rendered locally with no network call; the consent gate is unchanged.

- [ ] Write failing tests: `sanitizeDraft` keeps `why`, truncates past 140 characters, defaults `scheduleSource`; a draft with one step and no `why` passes validation; the schema test accepts payloads with and without the new fields; a prompt test asserts the onboarding prompt contains the "two or three steps" and "never state days the person did not give" instructions and no banned vocabulary.
- [ ] Implement; run `npm test -- onboarding-plan persona-extraction ai-prompts`; expect PASS.
- [ ] Commit.

### Task A2: Review screen shows the path

**Files:**

- Modify: `client/components/OnboardingPlanReview.tsx`
- Modify: `client/lib/copy.ts` (new strings live here), `qa/maestro-regression.yaml`, `qa/maestro-ai-onboarding.yaml`, `qa/maestro-accessibility.yaml` if selectors change
- Test: `client/lib/__tests__/copy.test.ts`

**Interfaces:**

- Consumes: `why`, `scheduleSource` from A1.

Behavior:

- Intro line: "Start with one step. The others wait for you in Journey."
- Under each step title, the `why` line when present.
- When `scheduleSource` is `"suggested"`, the days row reads "Suggested: Mon · Wed · Fri" with "Change" beside it; when `"stated"`, unchanged.
- "See 2 other ideas" becomes "See 2 more steps toward this" (count-aware).
- A visible text button "Ask Coach to change this" returns to the chat through the existing back path.
- The primary button text stays "Start with 1 habit" (count-aware) so the regression selector contract holds.

- [ ] Add copy constants with tests for count-aware strings; implement; update flows; commit.

### Task A3: Keep the other steps; "Next steps" in Journey

**Files:**

- Modify: `client/lib/storage.ts` (plan record, `commitOnboardingPlan`, backup/restore validation), `client/lib/onboarding-plan.ts` (`approvePlan`)
- Modify: `client/context/AppContext.tsx` (two memoized mutators), `client/screens/JourneyScreen.tsx`
- Create: `client/lib/next-steps.ts`, `client/components/NextStepsCard.tsx`
- Modify: `client/lib/telemetry.ts`, `server/telemetry-events.ts` (events `next_step_added`, `next_step_dismissed`)
- Test: `client/lib/__tests__/next-steps.test.ts`

**Interfaces:**

- Produces, in `client/lib/next-steps.ts`:
  - `type NextStep = { id: string; title: string; why?: string; frequency: string[]; kickstart?: string; cue?: string; source: "onboarding" | "coach" }`
  - `nextStepsFromDraft(draft, selectedIds: string[]): NextStep[]`
  - `canAddNextStep(actionCount: number): { ok: true } | { ok: false; reason: "habit_limit" }` (limit 5)
- Produces, on the app context: `addNextStep(stepId: string): Promise<{ ok: boolean; reason?: "habit_limit" | "no_milestone" }>` and `dismissNextStep(stepId: string): Promise<void>`; the active plan exposes `nextSteps: NextStep[]` (empty array when absent).

Behavior:

- On approve, unselected steps are stored on the plan as `nextSteps` instead of discarded.
- Journey shows a "Next steps" card only when `nextSteps` is non-empty: title, why, days, an "Add to my plan" button and a quiet "Not for me". Add creates a habit under the current unfinished milestone (the first by order; if none, the most recent), with `createdAt` now, schedules its reminder through the existing path, and removes the step from the list.
- At the habit limit, Add shows: "Your plan holds five habits. Finish or remove one, then add this."
- Plans with no `nextSteps` key behave exactly as today.

- [ ] Failing tests for the three pure functions, including a 1.6.1-shaped plan with no key; implement; verify Journey renders nothing for an empty list; commit.

### Task A4: Coach can propose and add a step

**Files:**

- Modify: `client/screens/CoachSheetScreen.tsx` (chip list `PROMPTS`, preview card reuse), `client/lib/ai.ts` (one-step proposal call; first-message rule near 534/627; coach context), `client/lib/coach.ts`
- Modify: `client/screens/TodayScreen.tsx`, `client/screens/JourneyScreen.tsx` only where they open the sheet, to pass the habit or milestone it was opened from
- Modify: `client/lib/telemetry.ts`, `server/telemetry-events.ts` (events `coach_step_proposed`, `coach_step_applied`)
- Test: `client/lib/__tests__/coach.test.ts`, `client/lib/__tests__/ai-prompts.test.ts`

**Interfaces:**

- Consumes: `NextStep`, `addNextStep` semantics from A3.
- Produces: `proposeNextStep(context: { resolution: string; existingHabits: string[]; userMessage?: string }): Promise<NextStep>` in `client/lib/ai.ts`, using the existing `/api/extract-persona` route with a one-step prompt and the existing validation.

Behavior:

- New chip: "Help me add a next step". It sends the request, shows the proposal in the existing preview card (title, why, days marked suggested, 2-minute version) with "Add to my plan" and "Not now". Apply runs the same add path as A3; "Not now" saves it to `nextSteps` so it is not lost.
- The coach system prompt says plainly what Coach can and cannot change, and where to add a habit by hand.
- When the person's first message asks for help, the first reply helps; the "ask about their experience" opener applies only when they did not ask for anything.
- The coach is told which habit or milestone the sheet was opened from, and the plan's milestone titles.
- "Adjust my plan" is not offered until the habit has 7 scheduled days of history.

- [ ] Failing tests: prompt builder includes origin habit and milestone titles; first-message rule branches on a help request; adjust chip hidden under 7 scheduled days; proposal parsing rejects an empty title. Implement; commit.

### Task A5: In-app framing

**Files:** `client/screens/TodayScreen.tsx` (empty state near 1526), `client/screens/OnboardingScreen.tsx` (welcome near 577-664, starter chips), `client/screens/BenchmarkEditorScreen.tsx:351-356`, `client/lib/onboarding-plan.ts:60`, `client/lib/starter-plan.ts`, `client/lib/copy.ts`; flows in `qa/` that select on changed text.

Behavior:

- Empty Today and welcome keep the heading "What's your resolution?". Sub-line becomes: "Know the goal but not the steps? Talk it through with Coach and leave with the first one."
- Welcome step 1: "Talk with Coach. Share the goal. Coach helps you find the steps."
- Milestone editor hint and placeholder lose "persona"; validation "Give your future self a name." becomes "Give this plan a name."
- Self-setup: after the person types a resolution or taps a starter chip, the three starter habits come from a small table keyed by chip (fitness, weight, money, reading, sleep, stress, learning), falling back to today's generic three.

- [ ] Tests for the starter table (every chip has three habits with valid weekdays); implement; update flows; commit.

## Track B: Client correctness

### Task B1: History math reads the schedule in force on each day

**Files:**

- Create: `client/lib/schedule-history.ts`
- Modify: `client/lib/progress.ts` (`computeStreak`, `computeLapse`, `computeWeekStats`, `computeMilestoneProgress`, momentum), `client/lib/recap.ts`, `client/lib/journey-date.ts`, `client/lib/insights.ts`, `client/lib/storage.ts` (`updateAction`, tune-up apply, backup validation)
- Test: `client/lib/__tests__/schedule-history.test.ts`, additions to `progress.test.ts`, `recap.test.ts`

**Interfaces:**

- Produces: an action gains `frequencyHistory?: { from: string; frequency: string[] }[]` (ascending by `from`, local date keys). `isScheduledOn(action, dateKey: string, weekday: string): boolean` returns the membership for the entry in force on `dateKey`; with no history it uses `action.frequency`. `withFrequencyChange(action, newFrequency: string[], todayKey: string): Action` appends an entry for today, first seeding an entry from the action's start date with the old frequency when history is empty; a second change on the same day replaces that day's entry.
- Every history loop that tests `action.frequency.includes(day)` for a past date calls `isScheduledOn` instead.

Behavior pinned by tests:

- Mon/Wed/Fri habit with a 5-scheduled-day streak, edited to daily today: streak is unchanged, no shield is spent, `missedDays` is 0.
- Removing a weekday keeps past completed logs on that weekday in calendar and recap counts.
- `computeMilestoneProgress` skips a habit on days before its `createdAt` unless a completed log exists: a milestone at 15/21 stays 15/21 after a second habit is added.
- An action with no `frequencyHistory` computes exactly what it does on `main` (run the existing suites unchanged).

- [ ] Failing tests; implement helper; replace call sites; `npm test`; commit.

### Task B2: Day rollover, purchase restore, data clearing, small fixes

**Files:** `client/context/AppContext.tsx` (progress memo near 287; clear-all near 861; grace lookup near 414; milestone completion writes near 897-938), `client/screens/SubscriptionScreen.tsx` (385-464, 591), `client/lib/storage.ts` (`clearAll`, coach quota month near 881/891), `client/screens/ProfileScreen.tsx` (reminder switch near 1198; delete rule near 577-604), `client/lib/widget.ts` (154-161), `client/lib/notifications.ts`; tests alongside in `client/lib/__tests__/`.

Behavior, each with a test where the logic is pure:

- The progress snapshot recomputes when the local date changes while the app is in memory.
- The paywall's Restore asks StoreKit whenever native IAP is available, including after a failed validation and in the "already owned" branch (read availability from a ref, not the mount closure). A paid user whose validation timed out is never told "No Purchases Found" without a StoreKit query.
- "Clear All Data" cancels all scheduled notifications and removes every key the app writes (enumerate by the app's key prefixes, not only `STORAGE_KEYS`), including the witness name and reward and reminder keys.
- Launch entitlement check performs the past-expiry lookup when stored `expiresAt` is within the last 30 days, even if local state is already free.
- The Daily Reminders switch shows off, with a "Turn on in Settings" hint, when iOS permission is denied.
- A free user can delete their only plan after a confirmation and lands on the empty Today state.
- Widget `dayPlans` for a future-start plan cover the 7 days from the plan start.
- The free coach quota month uses the local month.
- Two milestones completing in one pass are written in sequence.

- [ ] Failing tests; implement; `npm test`; commit per bullet group.

## Track C: Server

### Task C1: Stay up under load

**Files:** `server/db.ts`, `server/index.ts`, `server/rate-limit.ts`, `server/routes.ts` (AI quota near 342-430), `DEPLOYMENT.md`; tests in `server/__tests__/`.

Behavior:

- The pg pool has an `error` listener that logs and does not crash; `connectionTimeoutMillis` 5000 and a 10 second statement timeout; `unhandledRejection` is logged; SIGTERM closes the server and pool.
- A daily AI budget breaker: when today's total in `ai_usage_daily` reaches `AI_DAILY_REQUEST_CAP` (default 20000), AI routes return 503 with `Retry-After` and a plain message; the total is cached for 30 seconds. Documented in `DEPLOYMENT.md`.
- Quota is charged only after input validation passes, and refunded when the upstream call fails before any text is sent.
- Rows in `rate_limit_windows` older than one day are deleted opportunistically (at most once a minute).
- Deleting a device's data does not reset its AI usage counters.

- [ ] Failing tests (breaker trips and recovers; quota not charged on invalid input; prune query issued); implement; commit.

### Task C2: Apple webhook and deletion

**Files:** `server/routes.ts` (webhook near 1481-1625; deletion near 1248-1261; feedback near 859-893), tests `server/__tests__/apple-webhook.test.ts` (create).

Behavior:

- Any failure after the outer signature verifies returns 500 so Apple retries; an unconfigured database returns 503.
- Stale guard without new columns: EXPIRED, GRACE_PERIOD_EXPIRED, and DID_RENEW are ignored when the notification's `expiresDate` is earlier than the stored `currentPeriodEnd`.
- Updates apply to every row sharing the `providerTransactionId`, not the first.
- SUBSCRIBED and REFUND_REVERSED set the row active with the transaction's expiry.
- Device data deletion also deletes that device's `ai_content_reports`.
- Feedback: `name` at most 120 characters, `type` from the existing set, `message` at most 5000; name and email are not logged.

- [ ] Failing tests for each bullet with a mocked verifier and db; implement; commit.

## Track D: Site and store copy (drafts for Brett's edit)

### Task D1: Site

**Files:** `server/templates/landing-page.html`, `new-year.html`, `feedback.html`, `privacy.html`, `terms.html`, `release-notes.html`, `public/llms.txt`, `public/llms-full.txt`, `server/__tests__/site-templates.test.ts`.

Behavior:

- Every template has a skip link to `#main-content`; `npm run check:a11y` passes.
- `/new-year` loads `site.js` and the shared stylesheets, wraps its steps in `steps-grid`, shows the plan screenshot, and its mobile menu works. "From mid-November" is removed everywhere.
- Home subhead, "How it works" step 1, meta description, JSON-LD `featureList`, one FAQ entry on `/feedback`, and one key fact in `llms.txt` carry the message, using "one small daily step to start", never "a full plan". The home H1 is not changed in this task; the promise H1 goes live only with Track E.
- Tier lists in `llms-full.txt` match the home page.

- [ ] Add template tests (skip link present in every template; no "mid-November"; new-year includes `site.js`); implement; run `npm run check:a11y`; commit.

### Task D2: Store listing draft

**Files:** create `docs/launch-2027/store-listing-1.7.0.md`.

Content: subtitle (30 max), promotional text (170 max), keyword field (100 max, counted), first description paragraph, "What's New" for 1.7.0, and screenshot captions led by a real onboarding chat. Plain, humble wording; no invented numbers or testimonials. Marked "Draft for Brett's edit; nothing is entered in App Store Connect by this task."

## Track E: Look-back and January 1 (cut first if the date is at risk)

### Task E1: Free look-back with a minimum-data guard

**Files:** `client/lib/recap.ts` (300-391), `client/screens/YearRecapScreen.tsx`, `client/components/YearRecapCard.tsx`, `client/screens/SubscriptionScreen.tsx` (compare table), `qa/maestro-later-bets.yaml`; tests in `recap.test.ts`.

Behavior: the year story is free in full, including sharing. With fewer than 60 days since the plan start it is titled "Your first N weeks" and omits month-ranking and active-month lines. The closing card is one sentence in the person's plan name with one number. The paywall table no longer lists the year story.

### Task E2: January 1 morning notification

**Files:** `client/lib/notifications.ts` (634-639), `client/components/PlanCountdownCard.tsx`; tests in `notifications.test.ts`.

Behavior: choosing a January 1 start asks for notification permission with a plain reason; one notification is scheduled for 8:00 AM local on the start date ("Day one. Your first step is ready."), inside the existing 60-notification budget, cancelled if the plan is deleted or its start changes.

## Integration and verification (builder of record)

- [ ] Each track is reviewed report-only by a different agent before merge; findings are fixed in the track's branch.
- [ ] Merge tracks into `claude/new-year-2027`; set `expo.version` to `1.7.0` in `app.json`; add the 1.7.0 entry to `public/releases.json` as "in development".
- [ ] `npm run check:types && npm run lint && npm run check:format && npm test && npm run check:a11y`.
- [ ] `npm run build:local:sim`, install on the QA simulator, run the Maestro order in `docs/plans/2026-10-14-native-regression.md`, plus a live vague-goal onboarding walk with screenshots proving goal items 1 to 3.
- [ ] Record results in `docs/plans/2026-11-27-native-regression.md`; open the PR to `main` and stop for Brett.

## Not in this plan

- The production build, upload, and App Store submission (after Brett's phone check and go).
- Spec Part 2 items 1, 3, 5, 6 (1.7.1), and Part 3 outreach.
- Server-owned prompts and purchase-to-device binding (larger change; tracked as a follow-up after the spike).
