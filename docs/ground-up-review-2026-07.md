# Resolution Companion AI — Ground-Up Review & Improvement Roadmap

**Date:** July 17, 2026
**Scope:** Full review of the shipped app and the 1.0.10 implementation branch — client UX, backend/AI, positioning, and GTM — benchmarked against leading apps in the habit-tracking, self-care companion, and AI-coaching categories (2025–2026 state).
**Focus weighting (per request):** Retention & engagement deep; monetization, AI, and foundation covered more briefly.
**Relationship to existing docs:** This extends `docs/enhancement-roadmap.md` (approved 2026-07-11) — it does not replace it. Roadmap item numbers from that doc are referenced as `ER#N`.

> **Implementation status (verified 2026-07-18):** every application and server item in §6, including all four Later bets, is implemented in the repository. A strict reconciliation with the approved enhancement roadmap also completed the post-milestone proposal, second-persona invitation, contextual Coach paywall, and now-applicable website rating proof. The exact 1.0.10 native artifact passed clean-install, maximum-text accessibility, later-bet, annual-recap, live-Coach, and native widget regressions. The remaining actions are commercial App Store Connect configuration: replacing the live one-week yearly offer with the planned month requires explicit approval to delete it, and lifetime/alternate-yearly products require final prices. The client is fail-safe and displays only Apple's real products and terms. See `docs/ground-up-implementation-audit-2026-07-18.md` and `docs/title-ii-accessibility-audit-2026-07-18.md`.

---

## 1. Executive summary

1. **The app is unusually well-built for a v1.** Zero TODO markers in the shipped surface, pervasive haptics and accessibility, optimistic updates, timezone-aware progress math, a genuinely thoughtful consent flow, and a defensible IAP stack with full JWS chain verification. This is not a prototype wearing an App Store icon.

2. **The positioning is real whitespace — and a direct competitor just validated it at 5× the price.** Atoms (the official Atomic Habits app) sells identity-based habits at $16.99/mo / $119.99/yr. Resolution Companion occupies the same identity thesis at $2.99/$24.99 with an AI coach Atoms doesn't have, and a privacy story (local-first, no accounts) that no AI competitor can match.

3. **The biggest retention gap is the ambient layer.** Every leading app in the category lives on the home screen, lock screen, watch, and in Health — Streaks completes habits from the widget, Duolingo credits its widget with a ~60% commitment lift, Finch's widget keeps the companion visible all day. Resolution Companion currently exists only when opened, plus one daily notification. This is the single highest-leverage investment (ER#3/#9/#10 confirm the team already suspects this).

4. **The second gap is the story loop.** The app computes rich progress data but never tells it back as a story, and nothing in the app is shareable. "Wrapped"-style narrative recaps (500M+ shares in a day for Spotify; Strava's Year in Sport) and Oura/Whoop-style "score + narrative + one recommendation" insights are both absent from the entire habit category — a no-guilt, identity-framed monthly recap would be the missing insights panel, the missing share loop, and on-brand with monthly clean slates simultaneously.

5. **Retention cannot currently be measured.** There is no telemetry of any kind — no activation, retention, paywall-conversion, or crash visibility. Before investing in retention features, instrument the funnel (privacy-respecting, on-brand) or every subsequent decision is a guess. Similarly, all user data is device-local with no backup: device loss = total data loss, which is a silent retention killer for the most invested users.

**Recommended sequence:** Phase 0 measure (telemetry + trial) → Phase 1 ambient layer (widget + App Intents) → Phase 2 story loop (Month in Votes + insights) → Phase 3 coach depth + reward layer. Detail in §6.

---

## 2. Ground-up assessment

Grades reflect craft _and_ strategic completeness, referenced to code observed on `main`.

| Area               | Grade | Summary                                                                                                                                                                                                                                                                                                 |
| ------------------ | ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Onboarding         | A−    | AI interview with real SSE streaming, consent gating, transcript persistence/resume, graceful no-consent local starter plan. Weakness: completion is turn-count-based, not substance-based.                                                                                                             |
| Daily loop (Today) | A−    | Tight loop: progress ring, identity-framed toasts, kickstart floors, day-complete celebration, contextual permission/review asks. Weakness: it's the _only_ loop — no ambient surface backs it up.                                                                                                      |
| Progress (Journey) | B+    | Calendar with shield states, streak connectors, milestones with fill-only progress. Weaknesses: 21-day target is fixed while the user-chosen target date is cosmetic (a quiet promise mismatch); `computeBenchmarkProgress` sits unused awaiting the insights panel (ER#7).                             |
| AI Coach           | B+    | Persona-aware prompts, premium memory (last 2 session digests + 7 days of notes), free Weekly Review ritual, momentum score. Weaknesses: streaming is simulated (fetch + 30ms/char replay — ER backlog); no proactive arc between sessions; free tier is a counter, not a taste of memory.              |
| Paywall            | B+    | Honest live-store pricing math, StoreKit 2/JWS, restore fallbacks, required disclosures, distinct states. Weaknesses: no trial (the single biggest data-backed conversion lever); contextual coach-limit paywall exists but the moment isn't designed.                                                  |
| Notifications      | B+    | Genuinely clever local engine: anchor-derived buckets, adaptive lapsed/streak copy, "Mark all done ✓" action, self-healing chain, suppress-when-done. Weakness: one hook for all users; no keying to what each user actually responds to.                                                               |
| Design system      | A−    | Coherent dark-first identity, reanimated micro-interactions, disciplined haptics, strong a11y. Weaknesses: light mode fully built but hard-locked off (`useTheme` returns dark unconditionally); completion notes use bare `Alert.prompt`; `design_guidelines.md` still documents the old 5-tab layout. |
| Backend/infra      | B     | Deliberately thin and mostly right for local-first. Real debts: API secret ships in the bundle (quota fails _open_ on DB error), in-memory rate limits are single-instance, client computes its own entitlement expiry with no launch-time re-sync, no telemetry, no backup/sync, no client UI tests.   |

**Strengths worth protecting** (these _are_ the brand): streak shields with visible grace states; kickstart floors on every action; milestones that only fill; monthly clean slate; consent-first AI; no accounts; ≤1 notification/day; identity framing in every copy string.

---

## 3. Positioning map

Three competitor clusters, and where Resolution Companion sits:

- **The integrators** (Streaks, Habitify): own the OS — widgets, watch, Health, Siri — but have zero intelligence and zero emotional layer. Streaks' $4.99-once pricing is beloved precisely because it signals honesty.
- **The companions** (Finch, Fabulous, Me+): own feelings. Finch (~$12M+ ARR) engineered no-guilt into mechanics — the bird is auto-fed and can never suffer; streak repairs are _earned_; premium is almost entirely cosmetic. Fabulous is the cautionary tale: behavior-science pedigree eroded by pre-value paywalls and feature clawbacks — its most common recent review complaint.
- **The AI coaches** (Headspace Ebb, Rocky, ChatGPT-as-coach): own the conversation but are all cloud-account-based and under privacy scrutiny; Rocky's pivot to B2B suggests a standalone consumer AI coach is a hard sell without a daily loop to live in.

**Resolution Companion's three defensible whitespace claims:**

1. **The provably-private AI coach that knows your becoming.** Every AI competitor stores your inner life on their servers; every private app is dumb. "An AI coach with perfect memory of who you're becoming — and the memory lives on your phone" is an intersection nobody occupies and neither cluster can easily reach.
2. **No-guilt insight storytelling.** Habitify has charts, Atoms has analytics — nobody in the category has _story_. Oura/Whoop-grade narrative + Wrapped-grade shareability, framed as identity progress rather than metrics.
3. **The kickstart floor as an OS-level system.** "Never take a zero" is currently an in-app text field. Made ambient (one-tap widget floor-logging, Health auto-votes, Siri), it becomes the category's first effort-adaptive tracker: the app that meets you at 2 minutes on your worst day, everywhere on your phone. Streaks owns integrations; Finch owns feelings; nobody owns the floor.

**Pricing position:** $2.99/$24.99 sits well below category medians (~$12.99/mo typical; Finch $69.99/yr; Routinery $39.99/yr; Atoms $119.99/yr). That's a legitimate "honest price" wedge à la Streaks — lean into it explicitly ("no dark patterns, cancel anytime, less than one coffee") rather than leaving it implicit. It is arguably _under_-priced for an AI product; §5 covers options.

---

## 4. Improvement experiences — Retention & engagement

Seven designed experiences. Each names the borrowed pattern, the adaptation that protects the positioning, the surfaces it touches, and the retention mechanism. Ordered by recommended build sequence, not importance — E1 and E2 are the two big bets.

### E1. "Cast Your Vote" widget system _(Streaks × Duolingo × Finch — expands ER#3)_

**Pattern:** Streaks lets users complete habits directly from small/medium/large home-screen and lock-screen widgets. Duolingo's widget — "the streak's watch face," with a deep rotating art library — drove roughly a 60% commitment increase and can change constantly without feeling like spam "since the user chose to put it there." Finch's widget works as ambient companionship, not nagging.

**Experience:**

- _Home screen (interactive, App Intents):_ today's ring + the next scheduled action with two tap targets — **full completion** and the **kickstart floor** ("Just 2 min: put on shoes"). One tap logs the vote without opening the app; the ring fills in place. This makes the kickstart floor a physical button on the phone — the positioning, made tangible.
- _Rotating identity copy_ (computed locally, refreshed daily): "2 votes today for Writer You" · "Runner You is 68% formed this month" · after a miss, never guilt — "Any day can be day one. Today counts." The copy library escalates _warmth_, never desperation; Duo's guilt-escalation art direction is explicitly the anti-pattern.
- _Lock screen:_ minimal circular ring (votes cast / scheduled) + one-word identity label. _Watch complication_ later, same data source.
- _Empty/rest states:_ rest days show a calm "Rest is part of becoming" face — the widget must never look like an accusation.

**Touches:** new iOS widget extension target + App Intents; shared data via App Group (AsyncStorage values mirrored to `UserDefaults(suiteName:)`); `client/lib/progress.ts` math reused for ring/copy inputs. This is the same native-extension workflow ER#10 (Health) is parked behind — building it unblocks E5.
**Mechanism:** moves the daily decision from "open the app" to "glance at the phone" — the single most proven retention surface in the category. Also the prerequisite infrastructure for Siri/Health.

### E2. "Month in Votes" — the no-guilt Wrapped _(Spotify Wrapped × Strava Year in Sport × Oura — expands ER#4 + ER#7 together)_

**Pattern:** Wrapped's formula is narrative arc + identity flattery + designed-for-story cards + a share button on every card that's never forced (500M+ day-one shares in 2025). Oura/Whoop's insight pattern is _score + narrative + one recommendation_, never raw dashboards.

**Experience:** On the 1st of each month — exactly when the consistency score resets — the clean slate gets a closing ceremony before the fresh start:

- A 5–7 card swipe-through story, generated on-device from `DailyLog` data: **votes cast** ("41 votes for Consistent Morning Mover"), **consistency portrait** (best day-of-week, best time), **the comeback moment** ("On July 12 you came back after 3 days away — that's the whole skill"), **floor saves** ("Kickstarts saved 6 days this month"), **shields earned/used**, and **one coach-written line** looking forward (a single `/api/reflection` call, or template fallback offline).
- Every card renders share-ready (react-native-view-shot → share sheet) — outbound image only, no accounts, no feed, nothing inbound. Perfectly compatible with local-first; the share card _is_ the growth loop the app currently lacks entirely.
- Celebrates comebacks and floors as first-class stats — the no-guilt inversion of Wrapped's "top 1%" flattery. A rough month still produces a warm story ("28 votes, 2 comebacks. Still becoming.").
- **December: "The Year You Became"** — premium annual edition (ER#4's December idea), the natural January acquisition moment for a resolutions app.
- The same data views, kept persistent, become the **Insights panel** (ER#7): day-of-week heatmap and momentum sparkline framed as the ongoing version of the monthly story — finally employing the unused `computeBenchmarkProgress` in `client/lib/progress.ts`.

**Touches:** new recap module + card renderer; `WeeklyRecapCard` precedent on Today for the entry point; Journey gets the persistent Insights section (premium).
**Mechanism:** monthly reactivation spike (Wrapped/Year-in-Sport reliably re-engage lapsed users), the app's first viral surface, and an emotional payoff that makes the monthly clean slate feel like a feature instead of a reset.

### E3. Earned-forgiveness economy _(Duolingo repair economy × Finch earned repairs — completes ER#14)_

**Pattern:** Duolingo monetizes forgiveness (freezes, earned repairs, Streak Society perks). Finch's twist fits this brand better: streak repairs are _earned by consistency_ — forgiveness as a reward, not an insurance product.

**Experience:** The shield mechanic (`computeStreak`, one bridge per rolling 7 days) already exists but arrives silently. Reframe it as earned and visible:

- When a week of consistency banks a shield: toast + Journey moment — "Your consistency this week earned a shield 🛡". When one is spent: "Your shield covered Tuesday. Streak intact — that's what it was for." (Copy exists in spirit; the _earning_ event is what's new.)
- Premium: hold up to **2 shields** (ER#14's partial item), positioned as "extra grace, earned the same way" — never sold as anxiety insurance.
- Weekly Review and Month in Votes both report shields earned/used as celebrated stats.

**Touches:** `client/lib/progress.ts` (shield-earn event detection), Today/Journey copy, one paywall row.
**Mechanism:** converts the existing safety net into a visible variable-reward loop; deepens the anti-Duolingo brand promise while borrowing Duolingo's economics.

### E4. Portfolio-of-hooks notifications _(Duolingo — extends `client/lib/notifications.ts`)_

**Pattern:** Duolingo's real notification lesson isn't volume — it's that continuity pushes go to streak-holders, league pushes to competitors, friend pushes to social users: each user gets the hook they've invested in.

**Experience:** Keep the ≤1/day covenant. Add local hook selection on top of the existing adaptive engine (which already branches on lapsed/streak state):

- Score which surface each user responds to — logged after notification-tap vs. organic open (all locally stored): **momentum users** get identity-progress nudges ("Runner You: 82% this month"), **coach users** get invites ("Your coach noticed something about your Tuesdays"), **calm users** keep the gentle default, **lapsed users** always get the no-guilt reopen ("The plan can bend. 2 minutes counts.").
- Rotate copy within the winning hook (the existing engine already varies copy; make the _category_ adaptive too).
- Track response rates locally; fall back to calm default when signal is weak.

**Touches:** `client/lib/notifications.ts` + a small local response-tracking store; no server, no push infra needed.
**Mechanism:** raises the value of the single daily notification instead of adding more — the only notification strategy consistent with the brand.

### E5. Health auto-votes + Siri kickstart logging _(Streaks — re-sequences ER#9/#10 behind E1)_

**Pattern:** Streaks' stickiest feature set: Apple Health auto-completes habits (steps, workouts, mindful minutes) and Siri Shortcuts log by voice. HealthKit is on-device — perfectly aligned with local-first.

**Experience:**

- During action creation/editing, movement-ish actions offer "auto-complete from Health" (workout logged, step threshold, mindful minutes). Copy: "Health cast this vote for you" — the day is saved without opening the app, which _strengthens_ "never take a zero."
- App Intents: "Hey Siri, I did my kickstart" / "mark my morning run done" — plus Action-Button and Shortcuts automation support for free.
- Auto-votes appear in Today as pre-completed rows with a Health badge; Month in Votes counts them ("Health cast 9 votes for you").

**Touches:** HealthKit entitlement + read categories; the App Intents layer built in E1; `ActionEditorScreen` gains the auto-complete option.
**Mechanism:** zero-effort completions materially protect streaks and shields — retention that runs even when motivation doesn't. Build after E1 proves the extension workflow (as ER#10 already intends).

### E6. Coach with a motivational-interviewing spine _(Headspace Ebb × Atoms lessons)_

**Pattern:** Ebb is explicitly built on motivational interviewing — an evidence-based behavior-change method — and Headspace's headline KPI is that 64% of users "felt heard." Atoms' moat is a daily 60-second lesson drip from James Clear. Rocky's consumer struggles show an AI coach needs a daily loop to live inside — which this app has.

**Experience:**

- _Prompt spine:_ restructure coach prompts in `client/lib/ai.ts` around MI's shape — reflect back, ask permission before advising, evoke the user's own reasons, affirm identity. Market it: "trained to coach, not chat." This is the differentiation against free ChatGPT-as-coach, alongside the coach's exclusive access to real habit data.
- _Proactive weekly arc:_ the coach currently only speaks when spoken to. Give it one weekly proactive observation surfaced as a Today card (locally triggered, pattern-based: "You've completed every Tuesday for 4 weeks — Tuesday You is real"), tappable into a session. This is what "someone in your corner" means mechanically.
- _Identity-science micro-notes:_ a 60-second daily/every-other-day note (habit science, self-compassion research, identity psychology) — a bundled content library, no API cost, Atoms-style drip as a premium sweetener and a reason to open on rest days.
- _Enabling fix:_ real SSE for `/api/reflection` (ER backlog) — the 30ms/char simulated typewriter in `client/lib/ai.ts` makes the coach feel slower than it is; perceived responsiveness is coach-quality UX.
- _Free-tier taste:_ let free users experience memory once ("Last month you said mornings were the fight — still true?") before the counter gates — selling memory by demonstration, not description.

**Touches:** `client/lib/ai.ts` prompts, `ReflectScreen`, a Today coach-observation card, server SSE for reflection, content bundle.
**Mechanism:** deepens the moat feature (the coach is why this isn't "another tracker") and gives premium memory an experiential sales pitch.

### E7. Milestone reward layer _(Finch cosmetics — un-drainable rewards)_

**Pattern:** Finch Plus (~$9.99/mo) is almost entirely cosmetic — people pay to love their bird. The market decisively rewards un-punishable, reward-only progression (even Finch's pet can never suffer).

**Experience:** Milestone completions (currently a one-time modal, then nothing) start unlocking small permanent cosmetics: accent color variants of the 5-color gradient set, alternate app icons, celebration styles, coach tone flavors ("more direct" / "more gentle") — and the **fully-built, currently hard-locked light theme** (`client/hooks/useTheme.ts` returns dark unconditionally while a complete `Colors.light` palette sits dead) ships as an early unlockable: "Dawn theme — unlocked by your first milestone." Rewards only accumulate, mirroring fill-only milestones. Keep it small (2–3 unlockables per milestone tier); this is seasoning, not a pet game.

**Touches:** `useTheme` unlock plumbing, an unlockables store in `client/lib/storage.ts`, `MilestoneCompleteModal` reveal moment, alternate-icon config in `app.json`.
**Mechanism:** gives the 21-day milestone grind a payoff beyond the modal, adds light collection psychology with zero guilt surface, and finally monetizes the dead light-theme code as delight.

### Anti-patterns — explicitly do not copy

| Anti-pattern                                                          | Seen in                             | Why it's poison here                                                                                                                                                                                                                                                                                        |
| --------------------------------------------------------------------- | ----------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Loss-aversion streak terror (escalating guilt art, streak-loss dread) | Duolingo                            | It works (7-day streak → 2.4× continuation) but is the exact thing this brand is the refuge from. Copy the widget craft and repair economy; never the emotional mechanism.                                                                                                                                  |
| Shared-consequence social (party damage)                              | Habitica                            | Documented anxiety; users avoid the feature because letting the team down is stressful. Any future social layer must be witness/celebration-only (Duolingo's Friend Streak +22% completion is the acceptable shape — a later Phase 3 bet, done as a privacy-preserving one-person "witness" with no feeds). |
| Leaderboards / leagues                                                | Duolingo, Habitica                  | Reintroduces metric-identity ("rank 12") over self-identity ("a runner"), and requires accounts/servers — breaks local-first.                                                                                                                                                                               |
| Pre-value hard paywall, feature clawbacks                             | Fabulous, Me+, Routinery            | The highest-volume complaint across the category; fatal for a trust-positioned app. Paywall only after the identity-setup aha moment.                                                                                                                                                                       |
| Punitive companion death                                              | Forest-era mechanics                | The market voted: even Finch's bird is un-killable.                                                                                                                                                                                                                                                         |
| Notification volume                                                   | Duolingo (survives on character IP) | A coach that nags is a deleted app. The ≤1/day covenant is a feature — E4 raises its value instead.                                                                                                                                                                                                         |

---

## 5. Secondary findings (brief)

**Monetization**

- **Add a trial — the single biggest missing lever.** Paywalls with trials convert ~10.9% vs 3.6% without; health & fitness leads categories at ~35% trial-to-paid; longer trials (17–32 days) convert ~42.5% vs 25.5% for under-4-day. A **1-month free trial on yearly** matches the clean-slate rhythm perfectly — "try a full month free" — and follows Atoms' 28-day pattern. ER#13 already plans this (ASC config only); it also gates the paused Meta ads campaign, so it's doubly urgent.
- Price is a wedge but likely under-priced for AI: test $29.99–39.99/yr for new cohorts (grandfather existing), or keep price and win on trust + volume. Consider a **lifetime tier** (~$49.99–64.99, cf. Habitify) — the privacy-first audience overlaps heavily with the subscription-fatigued audience Streaks proves will pay once.
- Make "honest pricing" explicit paywall copy: no dark patterns, cancel anytime, direct contrast to the category's review toxicity.

**Foundation prerequisites (in priority order)**

1. **Telemetry** — currently zero visibility into activation, retention, conversion, AI cost, or crashes. A privacy-respecting, on-brand approach (e.g., self-hosted PostHog or aggregate-only event counts keyed to the existing anonymous deviceId; disclosed in the privacy policy) is a prerequisite for every retention bet above being evaluable.
2. **Entitlement re-sync at launch** — `AppContext` computes expiry locally (+1 month/year) and never re-checks the server until the paywall opens; expired premium can persist indefinitely. One `GET /api/subscription/status` on cold start fixes it.
3. **Real SSE for `/api/reflection`** (enables E6; removes the artificial 30ms/char delay).
4. **Backup** — device loss = total loss of all personas/logs/reflections today. iCloud key-value or CloudKit-private-database backup of the AsyncStorage domain preserves local-first (user's own iCloud, no app accounts) and protects exactly the long-tenured users retention work creates.
5. Noted, lower urgency: bundle-shipped API secret with fail-open quotas; single-instance in-memory rate limiting; `design_guidelines.md` stale (5-tab layout); duplicated momentum math (`storage.ts` vs `progress.ts`); no client UI tests.

---

## 6. Prioritized roadmap

Reconciled with `docs/enhancement-roadmap.md` (ER#). Impact ratings are for retention specifically.

| Phase                             | Item                                                                | ER#         | Effort | Impact        | Notes                                                                       |
| --------------------------------- | ------------------------------------------------------------------- | ----------- | ------ | ------------- | --------------------------------------------------------------------------- |
| **0 — Measure** (days–1 wk)       | Privacy-respecting telemetry (activation/retention/paywall funnels) | new         | S      | enabling      | Prereq for judging everything below                                         |
|                                   | 1-month free trial on yearly (ASC intro offer)                      | #13         | XS     | high ($)      | Also unblocks the Meta ads campaign                                         |
|                                   | Launch-time entitlement re-sync                                     | new         | XS     | med ($)       | One API call in AppContext                                                  |
| **1 — Ambient layer** (2–4 wks)   | E1 "Cast Your Vote" widgets + App Intents (home, lock, interactive) | #3/#9       | L      | **highest**   | The proven category retention surface; builds the native-extension workflow |
|                                   | E4 portfolio-of-hooks notifications                                 | new         | S      | med           | Pure client work on existing engine                                         |
| **2 — Story loop** (2–3 wks)      | E2 "Month in Votes" recap + share cards                             | #4          | M      | **high**      | Monthly reactivation + first viral surface                                  |
|                                   | Insights panel from the same data views                             | #7          | S      | med           | Premium; uses dormant `computeBenchmarkProgress`                            |
|                                   | E3 earned-shield visibility + premium 2-shield                      | #14         | S      | med           | Mostly copy + one event                                                     |
| **3 — Coach & rewards** (3–5 wks) | E6 MI prompt spine + proactive weekly observation + real SSE        | new/backlog | M      | high          | The moat feature                                                            |
|                                   | Identity-science micro-notes drip                                   | new         | M      | med           | Content bundle; premium sweetener                                           |
|                                   | E7 milestone reward layer (incl. light "Dawn" theme unlock)         | new         | M      | med           | Ships dead light-theme code as delight                                      |
|                                   | E5 Health auto-votes + Siri                                         | #10/#9      | M      | med-high      | After E1 proves extension workflow                                          |
| **Later bets**                    | One-person "witness" accountability (celebration-only)              | new         | L      | high if right | Duolingo Friend Streak shape, privacy-preserving; needs careful design      |
|                                   | "The Year You Became" annual premium wrapped                        | #4          | S      | seasonal      | Build with E2; ship December                                                |
|                                   | iCloud backup                                                       | new         | M      | med           | Protects long-tenured users                                                 |
|                                   | Lifetime tier / yearly price test                                   | new         | XS     | med ($)       | New cohorts only                                                            |

Each row is written to be handed off as a standalone implementation task.

---

## Appendix: key sources

**Codebase:** `client/` screens & libs (`TodayScreen.tsx`, `JourneyScreen.tsx`, `ReflectScreen.tsx`, `OnboardingScreen.tsx`, `SubscriptionScreen.tsx`, `lib/progress.ts`, `lib/notifications.ts`, `lib/ai.ts`, `lib/iap.ts`, `lib/storage.ts`, `hooks/useTheme.ts`, `context/AppContext.tsx`), `server/routes.ts`, `shared/schema.ts`, `CLAUDE.md`, `docs/enhancement-roadmap.md`, `APP_STORE_READINESS.md`, `design_guidelines.md`, `marketing/mid-year-reset/`.

**Competitive (2025–2026):** Streaks (App Store; productivity.directory; The Sweet Setup) · Atoms (atoms.jamesclear.com; Fast Company; Toolfinder) · Finch (official Finch Plus pricing/benefits docs; UX teardowns; HerCampus) · Fabulous critiques (The Behavioral Scientist; ChoosingTherapy) · Habitify/Habitica/Way of Life (Zapier; dailyhabits.xyz; Habitica wiki "Damage to Player") · Me+ (App Store/Play/Sensor Tower) · Headspace Ebb (headspace.com UK announcement) · Rocky.AI · Replika market data (~$82M H1-2025 companion-app spend) · Duolingo mechanics (Deconstructor of Fun; Duolingo blog: Friend Streak, widget; Apptitude teardown) · Strava Year in Sport (TechRadar) · Oura/Whoop insight patterns · Spotify Wrapped 2025 (Brand Hopper case study) · Trial/pricing benchmarks (RevenueCat State of Subscription Apps 2025; Adapty health & fitness benchmarks; Business of Apps).
