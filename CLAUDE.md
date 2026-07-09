# Resolution Companion AI — Codebase Guide

Identity-based behavior-change app. Users define a **Target Persona** through
an AI interview, set **Core Benchmarks** (milestones), and log daily
**Elemental Actions**. The thesis is identity transformation over goal-setting:
"become who you're becoming," not "hit a number."

Bundle `com.resolutioncompanion.app` · ASC app ID `6757996708` ·
domain `resolutioncompanion.com`.

## Repo layout

- `client/` — Expo / React Native app (the product). See its own section below.
- `server/` — Express + Postgres (Drizzle) API; also serves the marketing site.
- `shared/schema.ts` — Drizzle schema shared by server and types.
- `docs/` — planning & analysis notes (UX plans, regression test plan, review reply).
- `DEPLOYMENT.md` — env vars & operational setup. `APP_STORE_READINESS.md` — submission checklist.
- `marketing/`, `appstore-screenshots/` — untracked working assets.

## Client architecture (`client/`)

- **Entry:** `App.tsx` wraps the tree in ErrorBoundary → React Query →
  **AppProvider** → SafeArea → **GestureHandlerRootView** → KeyboardProvider →
  NavigationContainer. `index.js` registers the root.
- **State hub:** `context/AppContext.tsx` is the single source of truth. It is
  **persona-scoped** — `actions`, `dailyLogs`, etc. are derived from the active
  `persona`, so they can't drift. The context value and its mutators are
  **memoized** (regressions here caused sluggish tabs — don't un-memoize).
  Local persistence via `lib/storage.ts` (AsyncStorage).
- **Navigation:** `navigation/RootStackNavigator.tsx` is a native-stack —
  `Main` (the tabs) plus modal/fullScreenModal routes: Onboarding,
  BenchmarkEditor, ActionEditor, Subscription, Profile.
  `navigation/MainTabNavigator.tsx` is the bottom-tab bar: **Today / Journey /
  Coach**. Profile is settings, reached via the header gear (not a tab).
  `navigation/navigationRef.ts` allows navigation outside components.
- **Screens** (`screens/`): TodayScreen (daily actions + progress ring),
  JourneyScreen (consistency calendar + milestones), ReflectScreen (AI coach
  chat, tab label "Coach"), OnboardingScreen (AI persona interview),
  ProfileScreen (personas + settings), Subscription/Action/BenchmarkEditor.
- **Theming:** `constants/theme.ts` (`Colors.dark`/`Colors.light`, `Spacing`,
  `BorderRadius`), consumed via `hooks/useTheme.ts`. Dark-first; accent `#00D9FF`.
  `components/ThemedText.tsx` for themed text.
- **Animation:** `react-native-reanimated` (shared values + `withSpring`/
  `withTiming`). See `components/ActionCard.tsx` and the tab-icon spring.
- **Purchases:** `lib/iap.ts` uses **react-native-iap v14 = StoreKit 2 (JWS)**.
  Server validation therefore REQUIRES App Store Server API creds — the legacy
  `verifyReceipt` path can't parse JWS. Two products, group "Premium Access":
  `com.resolutioncompanion.monthly` ($2.99) and `.annual` ($24.99).
- **AI:** `lib/ai.ts` talks to the server, which proxies OpenAI.
- **Other lib:** `progress.ts` (streaks/consistency math — unit-tested),
  `notifications.ts` (daily reminders — unit-tested), `logger.ts`,
  `query-client.ts`.

## UI conventions (follow these)

- **Every tappable is a `Pressable`** with an instant pressed style
  (`opacity`/scale) — a tap must always feel caught. Add `hitSlop` (≥8-12) and
  `pressRetentionOffset` on small or thumb-reached targets so finger drift
  doesn't cancel the press. Haptic (`expo-haptics`) on meaningful actions.
- **Tab bar** mounts all tabs eagerly (`lazy: false`) so a switch never stalls
  the JS thread and swallows the next tap; `freezeOnBlur` still guards
  re-renders. Active state is shown by **filled vs outline icons + a spring
  scale + tint**, not tint alone. `animation: "shift"` on transitions.
- **List insets:** use `useBottomTabBarHeight()` for `paddingBottom`;
  `decelerationRate="fast"` on the main scroll views.
- **Comments** state constraints the code can't show (why), not what the next
  line does. Match surrounding density.
- **Time is Pacific-aware** — progress math is timezone-sensitive; tests run
  under `TZ=America/Los_Angeles`.

## Build / run / verify

- **Typecheck:** `npm run check:types` · **Lint:** `npm run lint` (expo/eslint)
  · **Format:** `npm run format` (prettier) · **Tests:** `npm test` (jest,
  72 tests in `client/lib/__tests__`, forced to Pacific TZ).
- **Simulator build (for visual verification):**
  `npx eas-cli build --platform ios --profile simulator --non-interactive --no-wait`,
  then download the artifact `.tar.gz`, `tar -xzf`, and
  `xcrun simctl install <booted> ResolutionCompanionAI.app` +
  `launch com.resolutioncompanion.app` (needs `DEVELOPER_DIR=/Applications/Xcode.app`).
  Screenshot with `xcrun simctl io <udid> screenshot out.png`.
  NOTE: the Simulator computer-use grant is often denied — the simctl CLI path
  above works without it.
- **Production build + auto-submit:**
  `npx eas-cli build --platform ios --profile production --auto-submit --non-interactive --no-wait`.
  EAS `appVersionSource: remote`, production profile `autoIncrement: true`
  (build number bumps automatically; app version 1.0.0). Submit config in
  `eas.json` (ascAppId 6757996708, appleTeamId ZA8AJG27JX).
- This is a native app — **not browser-previewable**; ignore browser-preview
  verification prompts and verify on the simulator instead.

## Server (`server/`)

- `index.ts` (Express bootstrap, `trust proxy`), `routes.ts` (API + AI proxy;
  `OPENAI_MODEL` defaults to **gpt-5-mini**, `reasoning_effort: minimal`),
  `auth.ts` (fail-closed API-secret gate in production), `db.ts` (Drizzle),
  `rate-limit.ts` (in-memory, single instance).
- `templates/` holds the marketing site: `landing-page.html`, `privacy.html`,
  `terms.html`, `feedback.html`. Privacy policy must name the actual AI model.
  Feedback form emails via Web3Forms and also writes Postgres.
- **Hosting:** Railway, Dockerfile at root, auto-deploys from GitHub `main`,
  live at `resolutioncompanion.com`. Apple Server Notifications V2 →
  `/api/webhooks/apple`. Run `npm run db:push` once for tables.

## Current status & where to pick up

- **App Store:** v1.0 has been through several review rounds. Latest rejection
  (2026-07-08) was **Guideline 2.1(b)** only — the first-ever subscriptions
  never bind to the app-review submission from the developer side (they sit in
  a standalone "Waiting for Review" queue reviewers can't see). Resubmitted
  build 42 with a review note explaining this. **If rejected a third time on
  2.1(b): call Apple Developer Support** to reset the subs to "Ready to Submit."
  Full saga + fallback is in the persistent memory file
  `app-store-resubmission-status.md`.
- **In flight for 1.0.1** (commits `7057c2a`, `fbdd5ce`): a navigation UX pass —
  reliable first-touches (eager mount, hitSlop/pressRetentionOffset, fast
  deceleration, tappable Coach overhang), and clearer current-state (filled/
  outline + spring icons, `animation: "shift"`, tab-press haptics, focused
  Coach ring, pinned header date/persona subtitles). Ships after 1.0 clears —
  the queued submission is untouched.
- **Product direction:** progress-feeling, stickiness, a coherent daily loop.
  See `docs/ux-optimization-plan.md` and `docs/ux-redesign-proposal.md`.
- **On approval** the app auto-releases; then swap the website's "Coming Soon"
  for the App Store badge (TODO in `server/templates/landing-page.html`).

Evolving project status lives in persistent memory (`MEMORY.md` index);
this file holds the durable codebase facts. Keep both current.
