# Resolution Companion: independent UX review

Review date: September 5, 2026. Scope: recommendations only; no application code changes.

The app has a coherent foundation: Today helps people act, Journey preserves evidence of progress, and Coach helps them adapt. The most useful next step is to make those promises more literal. Let people approve a small starting plan, put its next action within easy reach, and make every button, progress label, and Premium claim match what the app actually does.

## Evidence and limits

This review inspected the current local screens, navigation, action components, consent flow, app context, scheduling, coaching, and telemetry code. The July UX plan and August ground-up analysis were treated as historical records and checked against implementation. The August 6 decisions to remove daily-context popups and retain one Coach lobby entry are respected.

Three screenshots captured during this review were visually inspected: [returning-user Today](/Users/bpollak/Documents/resolution-companion/build/ux-review-2026-09-05/01-today-returning.png) and [returning-user Journey](/Users/bpollak/Documents/resolution-companion/build/ux-review-2026-09-05/02-journey-returning.png), and [Premium comparison](/Users/bpollak/Documents/resolution-companion/build/ux-review-2026-09-05/03-premium.png). They show the existing Momentum Builder fixture in the installed iOS simulator app, version 1.3.6, build 86. The local app metadata identifies build 85; the installed binary has not been established as an exact build of the working tree. These screenshots establish the visible installed experience, not production release state or source-to-binary equivalence. The reviewed source was HEAD `2988352`, initially clean. [Runtime notes](/Users/bpollak/Documents/resolution-companion/build/ux-review-2026-09-05/runtime-notes.md) record the read-only navigation and its limits. No fresh install, Android session, live AI request, purchase, or assistive-technology run was performed.

**Code-confirmed** means the behavior follows from the cited local source. **Observed** means it was visible in the current screenshots or read-only simulator navigation. **Hypothesis** means the proposed effect on comprehension or retention needs research. No conversion lift, actual abandonment rate, accessibility certification, store entitlement result, or real-user behavior is claimed.

Apple's current [onboarding guidance](https://developer.apple.com/design/human-interface-guidelines/onboarding) supports brief, contextual introductions. Its [generative AI guidance](https://developer.apple.com/design/human-interface-guidelines/generative-ai) is relevant to explicit control over proposed changes. These principles inform the recommendations; the product-specific findings below come from the app itself.

## What to preserve

- Three clear destinations and consistent selected-tab treatment; no new tabs are needed.
- AI consent, a functioning local starter-plan path, and interrupted-interview transcript recovery.
- Immediate completion feedback, visible completion undo, a day-complete state, and compassionate missed-day framing.
- Fill-only milestones and evidence shown before contextual coaching.
- AI plan-change previews with explicit Apply/Keep controls, a plan-change history, and memory used by the live Coach sheet.
- The single Coach lobby entry, discovered widget/Siri entry points, and existing customization and backup controls.

The earlier requests for these capabilities are already substantially implemented. Recommending them again would obscure the remaining problems.

## Ranked findings

Effort is relative: **S** = copy or a narrow flow correction, **M** = a focused component/flow change, **L** = a multi-step product flow with persistence implications. Priority reflects likely user impact and confidence, not measured prevalence.

| Rank | Recommendation | Impact / confidence | Effort |
| --- | --- | --- | --- |
| 1 | Correct Premium promises and remaining-check-in messaging | High trust risk; code-confirmed mismatches | S |
| 2 | Make the restart button clearly mean logging a completed action | High daily-loop risk; code-confirmed, visible label | S–M |
| 3 | Make tomorrow links select tomorrow | Medium; observed and code-confirmed navigation gap | S |
| 4 | Let users approve a smaller first plan and its schedule | High; code-confirmed behavior, activation hypothesis | L |
| 5 | Offer a direct starter path and recoverable onboarding | High activation opportunity; code-confirmed flow, research needed | M |
| 6 | Give Coach explicit waiting, retry, and partial-save behavior | Medium; code-confirmed controls, runtime failure testing needed | M |
| 7 | Put the actual next action ahead of repeated framing on Today | Medium; observed viewport, task-speed hypothesis | M |
| 8 | Make Journey's assessments lead directly to a useful adjustment | Medium; observed and code-confirmed, design hypothesis | M |
| 9 | Make calendar states distinguishable without color | Medium accessibility risk; code-confirmed, device testing needed | S–M |

### 1. Align Premium's claims with current capabilities and quota

**Scenario.** A free user has used seven check-ins and opens the upgrade link. The paywall says all ten have been used. A separate row sells “Pattern discoveries,” including “First one” for free and “All” for Premium, although the factor-discovery experience was removed.

**Evidence.** The 7–9-use upgrade link passes `source: "coach-limit"` at [ReflectScreen.tsx:360](/Users/bpollak/Documents/resolution-companion/client/screens/ReflectScreen.tsx:360). Its fixed copy says all ten were used at [SubscriptionScreen.tsx:56](/Users/bpollak/Documents/resolution-companion/client/screens/SubscriptionScreen.tsx:56). The discovery comparison remains at [SubscriptionScreen.tsx:963](/Users/bpollak/Documents/resolution-companion/client/screens/SubscriptionScreen.tsx:963). The August 6 accepted removal is recorded in [ux-ground-up-analysis-2026-08.md:194](/Users/bpollak/Documents/resolution-companion/docs/ux-ground-up-analysis-2026-08.md:194); current Journey renders rhythms, calendar, milestones, Insights, and stories, with no factor-discovery surface. Rhythm labels alone do not fulfill the advertised free-first/Premium-all discovery contract. The installed paywall accessibility tree also exposed the discovery row, as recorded in the runtime notes. The 7–9-use mismatch remains source-only; the existing fixture had ten check-ins remaining.

**Recommendation.** Drive quota copy from the current count: “3 free conversations left this month” versus “Your 10 free conversations are used. More become available October 1.” Remove the discovery row unless a currently reachable feature supports that exact claim. Explain one check-in once: “One conversation, including follow-up messages.” Check whether “Plans” or “Personas” is the user-facing term and use it consistently across onboarding, Profile, and the paywall. Preserve clear pricing, restore, and store-management controls.

**Validation.** Walk every paywall entry at 0, 7, 9, and 10 used check-ins. Every count and benefit must agree with accessible product behavior. Ask users what they would receive by upgrading; compare their answers with the actual entitlement matrix. Correctness should come before optimizing purchase conversion.

### 2. Distinguish doing a two-minute action from recording that it is done

**Scenario.** After a lapse, someone taps “Do the 2-minute version,” expecting instructions or a short activity. The app immediately records the action as complete. On an ordinary day, the same small version is shown as text, but “Mark Complete” records a full completion.

**Evidence.** The restart label and `primaryKind: "kickstart"` are defined at [ambient-coach.ts:143](/Users/bpollak/Documents/resolution-companion/client/lib/ambient-coach.ts:143). [TodayScreen.tsx:778](/Users/bpollak/Documents/resolution-companion/client/screens/TodayScreen.tsx:778) routes that CTA directly to `handleToggle`. [ActionCard.tsx:80](/Users/bpollak/Documents/resolution-companion/client/components/ActionCard.tsx:80) sends no completion kind, while [TodayScreen.tsx:718](/Users/bpollak/Documents/resolution-companion/client/screens/TodayScreen.tsx:718) defaults to `full`. The current Today screenshot confirms the prominent “Do” wording.

**Recommendation.** For a logging action, use “I did the 2-minute version,” with an accessibility label naming the specific action. If “Try the 2-minute version” is preferred, show its instruction and a separate “Done” control before logging. Make the small-version completion choice consistently available on regular days, with one primary completion control per action and a quiet alternative. Both versions should retain equal habit credit; accurate kind tracking can make later coaching more useful.

**Validation.** Before tapping, ask users to predict what the button will do. All participants should understand whether a tap starts an activity or logs completion. Verify full, small-version, and undo flows preserve the correct status and badge. Watch mistaken completions rather than maximizing taps.

### 3. Carry the promised date into tomorrow navigation

**Scenario.** A person taps “Prepare for tomorrow” on a rest day, or the tomorrow link after finishing Today. Journey opens with today or its previously selected date, so the destination does not immediately answer the promise.

**Evidence.** The rest CTA is defined at [ambient-coach.ts:115](/Users/bpollak/Documents/resolution-companion/client/lib/ambient-coach.ts:115). Its handler at [TodayScreen.tsx:778](/Users/bpollak/Documents/resolution-companion/client/screens/TodayScreen.tsx:778), the day-complete link at [TodayScreen.tsx:1216](/Users/bpollak/Documents/resolution-companion/client/screens/TodayScreen.tsx:1216), and the footer at [TodayScreen.tsx:1309](/Users/bpollak/Documents/resolution-companion/client/screens/TodayScreen.tsx:1309) navigate to `JourneyTab` without a date. [JourneyScreen.tsx:599](/Users/bpollak/Documents/resolution-companion/client/screens/JourneyScreen.tsx:599) initializes month and selected date to today; [MainTabNavigator.tsx:56](/Users/bpollak/Documents/resolution-companion/client/navigation/MainTabNavigator.tsx:56) declares no Journey parameters. Read-only simulator navigation reproduced this: “View 1 action scheduled for tomorrow in the calendar” opened Journey with Saturday, September 5 selected and its 0/2 details visible, while Sunday, September 6 remained unselected.

**Recommendation.** Pass an explicit date intent, select the correct month/day, and bring that day's actions into view. Alternatively, show a small tomorrow preview directly on Today. Preserve a prior calendar selection for ordinary tab switches while honoring an explicit tomorrow link.

**Validation.** Test tomorrow from an ordinary day, a rest day, and a completed day, including month and year boundaries and an already-open Journey tab. The visible date and scheduled actions must always match tomorrow.

### 4. Approve the plan before it becomes a recurring commitment

**Scenario.** A person asks for one manageable writing habit on weekdays. The AI returns one suitable action. The app pads the result to three actions using defaults, and if onboarding occurs on a rest day it adds that weekday to the first action's recurring frequency. The person lands on Today without reviewing the additions.

**Evidence.** [OnboardingScreen.tsx:498](/Users/bpollak/Documents/resolution-companion/client/screens/OnboardingScreen.tsx:498) extracts a plan, pads it to `MIN_ACTIONS_PER_PERSONA`, saves it, and resets navigation to Today. The minimum is three, and the maximum is five. [starter-plan.ts:8](/Users/bpollak/Documents/resolution-companion/client/lib/starter-plan.ts:8) adds the install weekday to `frequency`, so the change is recurring, despite the comment describing an install-day guarantee. [starter-plan.ts:27](/Users/bpollak/Documents/resolution-companion/client/lib/starter-plan.ts:27) supplies generic momentum, mindfulness, and physical-wellness defaults. Interview readiness is set after two user turns at [OnboardingScreen.tsx:485](/Users/bpollak/Documents/resolution-companion/client/screens/OnboardingScreen.tsx:485), independent of whether a feasible action and schedule have been established.

**Recommendation.** Add a compact plan review: “Here is a starting point. Keep only what fits.” Show the identity name, action, days, and two-minute version, with a clear “Start with this action” choice. Allow one action to be enough. Mark extra ideas as optional suggestions, including any defaults added because extraction was sparse. For a rest-day install, offer a one-time practice action without silently changing weekly availability. Apply the same preview-first principle already used in Coach.

**Validation.** Use interviews specifying one habit, unavailable weekends, an unusual cadence, and an incomplete answer. The accepted plan must contain no unapproved actions or recurring days. In a small usability study, ask participants to describe exactly what they have committed to before starting. Measure first-action completion and seven-day return against a baseline; a retention benefit is a hypothesis, not a promised outcome.

### 5. Make the non-AI route visible before asking for AI consent

**Scenario.** A new user wants a simple habit tracker or has an unreliable connection. They pass through three intro pages, including a Free/Premium explanation, then discover the starter plan only after declining consent and confirming a second alert. An AI startup failure gives a generic error rather than a clear alternative.

**Evidence.** The three pages and their ordered Continue/Get Started path are at [OnboardingScreen.tsx:71](/Users/bpollak/Documents/resolution-companion/client/screens/OnboardingScreen.tsx:71) and [OnboardingScreen.tsx:771](/Users/bpollak/Documents/resolution-companion/client/screens/OnboardingScreen.tsx:771). Starter-plan creation is behind consent decline at [OnboardingScreen.tsx:279](/Users/bpollak/Documents/resolution-companion/client/screens/OnboardingScreen.tsx:279). Startup and reply errors show generic alerts at [OnboardingScreen.tsx:435](/Users/bpollak/Documents/resolution-companion/client/screens/OnboardingScreen.tsx:435) and [OnboardingScreen.tsx:488](/Users/bpollak/Documents/resolution-companion/client/screens/OnboardingScreen.tsx:488). The existing interrupted-interview restore is a strength.

**Recommendation.** Replace the required feature carousel with one useful choice: “Build a plan with Coach” and “Start with one habit.” Request AI consent only for the Coach path. Keep pricing and optional explanatory content available without making them required steps. On a failed reply, retain the unanswered message with “Retry” and “Continue without AI”; route either choice into the plan review from finding 4. The shorter introduction follows [Apple's onboarding guidance](https://developer.apple.com/design/human-interface-guidelines/onboarding).

**Validation.** Run fresh-install tasks online, offline, and with AI declined. A person should reach an editable, meaningful first action without accepting AI. Compare time to an accepted plan and first actual completion; do not count a plan-created event alone as activation.

### 6. Make Coach's network state and save behavior understandable

**Scenario.** A person sends an important reflection over a slow connection. The input disables, but no waiting bubble appears before the first text chunk. A failure says to try again without an inline retry. Pressing Save while a response streams saves completed message objects, excluding the visible partial response.

**Evidence.** [CoachSheetScreen.tsx:359](/Users/bpollak/Documents/resolution-companion/client/screens/CoachSheetScreen.tsx:359) clears the input and starts loading. Its catch at line 412 shows an alert, without a message-level retry state. The only chat loading output is conditional on nonempty `streamingText` at [CoachSheetScreen.tsx:745](/Users/bpollak/Documents/resolution-companion/client/screens/CoachSheetScreen.tsx:745). The composer disables at line 858. [CoachSheetScreen.tsx:541](/Users/bpollak/Documents/resolution-companion/client/screens/CoachSheetScreen.tsx:541) saves `messages`, and the Save button at line 676 has no loading guard. The existing save/discard interception and preview-before-apply controls are valuable; this finding concerns their edges.

**Recommendation.** Show an immediate “Coach is thinking…” state, an accessible Stop action, and an inline retry on the unanswered message that preserves what was typed. Keep error state alongside the affected message rather than only in an alert. Make Save during streaming explicitly finish/stop and save the visible partial answer, or briefly explain that it will wait for the response; never imply partial text has been saved when it has not. Maintain the current rule that a failed response does not consume a free conversation.

**Validation.** Exercise delayed first token, interrupted stream, failed retry, Stop, Save during streaming, and dismiss/reopen. Verify transcript fidelity and quota behavior. Ask users to distinguish “waiting,” “failed,” and “saved” from the screen alone. The frequency of these conditions on production networks remains unmeasured.

### 7. Let Today lead with something the person can actually do

**Scenario.** A returning user opens the app for a quick check-off. On the inspected screen, the identity heading, three stats, large restart panel, duplicate date, and instructional action content consume the initial viewport. The ordinary action's “Mark Complete” control sits partly behind the tab bar until scrolling.

**Evidence.** This is visible in the current [Today screenshot](/Users/bpollak/Documents/resolution-companion/build/ux-review-2026-09-05/01-today-returning.png). The ordering is explicit in [TodayScreen.tsx:1152](/Users/bpollak/Documents/resolution-companion/client/screens/TodayScreen.tsx:1152): persona, signal/stats, date/action count, then the action list. The same small-version instruction appears in the signal and the action card. The list has bottom clearance, so this is an initial-viewport prioritization issue, not a claim that the action is unreachable.

**Recommendation.** Keep the supportive restart message, but integrate it with the first action instead of repeating that action's instructions. Aim for one visible action with its completion control in the first viewport at default text size. Move monthly percentage and continuity into a compact, optional progress row; the header already supplies the date. Use plain copy such as “Welcome back. Start with this small step.” Preserve the ability to inspect all actions and undo.

**Validation.** Compare the current and revised screen on a small supported iPhone and a large one, including larger text. Time “record the action you just did” and “find the easier version.” The hypothesis is lower search and scroll effort, not that all content must fit without scrolling at every accessibility size.

### 8. Make Journey's assessments actionable and explain their window accurately

**Scenario.** Journey says three habits are “Worth simplifying.” The person cannot tap those rows to simplify them. They must pass instructional content and the calendar, find the matching milestone, then edit or ask Coach.

**Evidence.** The current [Journey screenshot](/Users/bpollak/Documents/resolution-companion/build/ux-review-2026-09-05/02-journey-returning.png) contains only the rhythm and Next Steps cards in the first viewport. [JourneyFramingCard.tsx:54](/Users/bpollak/Documents/resolution-companion/client/components/JourneyFramingCard.tsx:54) renders each rhythm as a noninteractive `View`. The card says “last 28 scheduled days” at line 51, but [ambient-coach.ts:53](/Users/bpollak/Documents/resolution-companion/client/lib/ambient-coach.ts:53) examines the prior 28 calendar days and counts scheduled occurrences inside them. A three-times-weekly habit therefore has about 12 opportunities, not 28. Milestones and their controls follow the calendar at [JourneyScreen.tsx:1321](/Users/bpollak/Documents/resolution-companion/client/screens/JourneyScreen.tsx:1321).

**Recommendation.** Prioritize one useful observation with a direct “Adjust this habit” link that opens the matching action or its contextual Coach sheet. Show all rhythms on demand. Say “Scheduled actions in the last 4 weeks”; with little data, say “Still learning your rhythm” and avoid an evaluative 0/0 state. Keep calendar/history and milestone progress easy to reach, with the long Next Steps instructions shown only when needed near the relevant control. This is a refinement of Journey's existing role, not a new destination.

**Validation.** Give users the task “This habit is too hard. Make it easier.” Measure unaided completion, navigation steps, and whether users can explain the denominator for a weekly schedule. Follow with the separate task “Find what I did last Tuesday” to ensure progress/history remains accessible.

### 9. Give calendar completion a second visual channel

**Scenario.** A person with reduced color discrimination scans Journey to see which days were fully versus partly completed. Both states are a filled circle with the day number; their visible distinction is green versus amber.

**Evidence.** [JourneyScreen.tsx:1188](/Users/bpollak/Documents/resolution-companion/client/screens/JourneyScreen.tsx:1188) changes background color for complete/partial cells. The children at line 1202 render the date and, only for shielded days, a shield icon. The legend at [JourneyScreen.tsx:1226](/Users/bpollak/Documents/resolution-companion/client/screens/JourneyScreen.tsx:1226) also uses same-shaped colored dots for complete and partial. Screen-reader labels already announce completion counts at line 1147 and should be preserved.

**Recommendation.** Add distinct complete/partial marks or fill patterns while keeping the existing counts and selection styling. Use the same symbols in the legend, with a specific state for rest days. Verify the design in grayscale and with increased contrast rather than adding a lengthy explanation. Review visible and accessibility button labels together when changing restart controls. Apple's [VoiceOver evaluation criteria](https://developer.apple.com/help/app-store-connect/manage-app-accessibility/voiceover-evaluation-criteria/) support labels that communicate each control's purpose.

**Validation.** In grayscale, users should identify complete, partial, missed, rest, selected, and shielded days correctly. Run VoiceOver and TalkBack through selecting a date and undoing a completion. Large-text, contrast, and motion behavior still need a focused native accessibility pass; historical test results are not a current certification.

## Suggested sequence and research plan

First correct the verifiable mismatches: Premium copy, the restart verb, the rhythm window, and tomorrow navigation. These are narrow improvements with objective acceptance criteria. Next prototype a shorter first-run flow with plan approval and a smaller Today/Journey presentation. Test those before changing navigation structure or adding features. Coach failure handling and calendar state differentiation can proceed as focused reliability/accessibility work.

Use five to eight task-based sessions spanning a first-time user, a returning user after a lapse, a free user near quota, and an assistive-technology user. Observe whether each person can choose one realistic habit, explain its schedule, log the small version, recover from a missed week, change an unsuitable action, and understand Premium. Include users who prefer not to use AI. Do not reintroduce the removed daily-context questionnaire as a research shortcut.

The existing telemetry vocabulary records onboarding, first action, action/day completion, Coach, and plan-tune-up events in daily aggregates at [telemetry.ts:7](/Users/bpollak/Documents/resolution-companion/client/lib/telemetry.ts:7). No production baseline was accessed in this review. Establish one before making numerical retention or conversion claims, and preserve the existing privacy constraints. Qualitative task failures and exact-state regression checks are the immediate evidence available for prioritizing these changes.
