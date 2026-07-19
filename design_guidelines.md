# Design Guidelines: Resolution Companion AI

Resolution Companion is an identity-based behavior-change app. The interface
should make daily action feel light, progress feel earned, and missed days feel
recoverable. Copy emphasizes "becoming" and "casting a vote," never shame,
rank, or perfection.

## Product and privacy model

- No login is required. Persona, action, reflection, and progress data live in
  device-local AsyncStorage.
- The server stores the minimum needed for anonymous subscription validation,
  feedback, AI processing, and daily aggregate product-event counts.
- AI is opt-in. The local starter plan, action tracking, Journey, widgets,
  Siri, Health auto-votes, and recaps must remain useful without AI consent.
- Profile is settings, opened from the header gear. It is not a tab.

## Navigation architecture

The bottom bar has three eagerly mounted tabs:

1. **Today** — the daily action loop, progress ring, recovery prompts, and
   timely recap or coach-observation cards.
2. **Journey** — consistency calendar, milestones, streak shields, premium
   insights, and recap history.
3. **Coach** — weekly review, identity-science micro-notes, and AI coaching.

Onboarding, benchmark/action editors, subscription, monthly recap, and Profile
are stack or modal routes. Tab changes must stay instant and must never use the
React Navigation bottom-tab `animation` option, which black-screens tabs on
iOS. Keep all tabs mounted (`detachInactiveScreens={false}`, `lazy:false`,
`freezeOnBlur:false`).

## Core experiences

### Onboarding

- Introduce the identity model and free/premium boundary before asking for AI
  consent.
- AI interview copy must explain what is sent and why. Declining AI offers a
  complete local starter plan; it is not a dead end.
- The generated persona, benchmarks, and elemental actions remain editable
  before the user begins.

### Today

- Lead with the active persona and the day's completion ring.
- Each scheduled action has a full-completion control and an explicit
  two-minute kickstart floor.
- Completed rows may show their source, such as **Health** or **2-minute vote**.
  Include that source in the parent checkbox accessibility label; decorative
  badge children are not separate accessibility elements.
- Celebrate day completion, earned shields, comebacks, and milestone progress.
  A miss may spend an earned shield but never erases historical progress.
- Contextual notification and review asks occur only after demonstrated value.

### Journey

- Calendar states distinguish completed, protected, missed, rest, and future
  days without relying on color alone.
- Streak shields are earned through clean scheduled action-days, visible as an
  inventory, and explained when earned or used. Free holds one; Premium holds
  two.
- Milestones only fill. Do not drain, regress, or visually punish progress.
- Premium insights turn history into a useful recommendation instead of a raw
  dashboard. Monthly recaps remain an emotional narrative first.

### Coach

- The coach follows a motivational-interviewing spine: reflect, ask permission
  before advice, evoke the user's reasons, and affirm identity evidence.
- Weekly Review is the free ritual. Premium memory and longer coaching should
  be demonstrated by value, not described only as a feature list.
- Micro-notes are compact, evidence-informed, and useful on rest days.
- If AI consent is absent, never imply that an AI-generated observation or
  personalized coach message exists.

### Month in Votes

- Use a six-card story: votes, consistency, best rhythm, comeback/floor,
  resilience/shields, and a forward-looking coach line.
- Generate a single consent-gated coach line and cache it by persona/month;
  always have an offline template fallback.
- Every card must render cleanly for the native share sheet. Shared output is
  outbound only; there is no feed or account requirement.

### Ambient surfaces

- Widget state mirrors the next action, the remaining actions, and seven days
  of plans through the App Group. A stale snapshot rolls forward locally.
- Widget actions optimistically advance and persist a source plus completion
  kind for later reconciliation.
- App Intents support "I did my kickstart" and named-action logging.
- Health auto-votes are labeled transparently. They count as real identity
  votes without pretending the user tapped in-app.

## Interaction rules

- Every tappable is a `Pressable` with immediate opacity or scale feedback.
- Small targets use at least 8–12 points of `hitSlop` and an appropriate
  `pressRetentionOffset` so thumb drift does not cancel a tap.
- Meaningful actions use haptics. Animation clarifies state; it never delays
  input or becomes a prerequisite for understanding.
- Main scroll views use `decelerationRate="fast"` and bottom padding derived
  from `useBottomTabBarHeight()`.
- Time and progress calculations are Pacific-aware and tested under
  `TZ=America/Los_Angeles`.

## Design system

- Dark-first, high-contrast surfaces with cyan `#00D9FF` as the core accent.
- Success is bright green, warning is amber, and missed/error is coral; always
  pair state colors with labels, icons, or shape.
- Cards use 16-point corner radii and restrained elevation. Prefer flat,
  layered surfaces over ornamental shadows.
- Use themed tokens from `constants/theme.ts` and `useTheme`; do not add
  one-off colors when a semantic token exists.
- Dawn is an earned light-theme reward. It is a full theme, not a single-screen
  inversion. Violet is a contrast-safe earned accent; Aurora celebrations and
  the native alternate Home Screen icon are earned cosmetics too. Reward
  unlocks are permanent and user-controllable in Profile.
- Active tabs use filled versus outline icons, tint, and a spring-scale change.

## Accessibility

- Interactive targets are at least 44×44 points.
- Provide concise VoiceOver/TalkBack labels and state for every control.
- Dynamic type must not hide primary actions or completion state.
- Do not expose decorative nested labels as competing accessibility targets.
- Maintain readable contrast in both Midnight and Dawn themes and verify
  critical flows in the native simulator.

## Anti-patterns

- No guilt escalation, streak terror, leaderboards, public feeds, or punitive
  companion mechanics.
- No pre-value hard paywall or clawing back previously free functionality.
- No more than one notification per day; personalize the hook rather than the
  volume.
- No claims that data is private, AI-generated, delivered, or Health-derived
  unless the underlying state proves it.
