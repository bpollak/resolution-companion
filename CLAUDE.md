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
- **Builds are LOCAL now** (`eas build --local`) — EAS cloud build credit is
  exhausted; only cloud _compile_ costs money, uploads are free. Toolchain
  (Xcode 26.6 + CocoaPods + Fastlane, all via Homebrew) is installed. See the
  `local-builds` memory for the full setup. `/build/` is gitignored.
  - **TestFlight/App Store:** `npm run build:local:ios` (~15-20 min local
    compile → `build/ios-local.ipa`) then `npm run submit:local:ios` (uploads).
  - **Simulator (visual verification):** `npm run build:local:sim` →
    `build/ios-sim-local.tar.gz`; `tar -xzf`, then
    `DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer xcrun simctl install <booted> ResolutionCompanionAI.app` +
    `launch com.resolutioncompanion.app`, screenshot via `xcrun simctl io`.
    (The Simulator computer-use grant is often denied; this CLI path works without it.)
  - Scripts embed `DEVELOPER_DIR` + `LANG=en_US.UTF-8`. `eas build --local`
    needs Fastlane on PATH or it fails with "Fastlane is not available".
- **BEFORE EVERY BUILD: bump `expo.version` in `app.json`** above the last
  released App Store version. Once a version is approved+released Apple CLOSES
  that build train and silently rejects new builds under it (error
  `EAS_UPLOAD_TO_ASC_CLOSED_VERSION_TRAIN`). `appVersionSource: remote`,
  production profile `autoIncrement: true` (build number auto-bumps). Submit
  config in `eas.json` (ascAppId 6757996708, appleTeamId ZA8AJG27JX).
- Cloud builds still work (`eas build --platform ios --profile production --auto-submit`)
  but cost credit — avoid unless local is broken.
- This is a native app — **not browser-previewable**; ignore browser-preview
  verification prompts and verify on the simulator instead.
- **Known landmine:** never set `animation` (`shift`/`fade`) on the bottom-tab
  `Tab.Navigator` — it black-screens tabs on iOS (react-navigation#12755).
  `detachInactiveScreens={false}` + `lazy:false` + `freezeOnBlur:false` keep
  all tabs mounted and rendered.

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

- **App is LIVE** on the App Store (id 6757996708, free). v1.0 released
  2026-07-09; v1.0.1 (nav/tab fixes, persona-aware Coach) and **v1.0.2
  (paywall fix, build 49) both APPROVED & released** — v1.0.2 went live
  2026-07-11.
- **🎉 SUBSCRIPTIONS APPROVED (2026-07-11 afternoon):** both products
  (`com.resolutioncompanion.annual` / `.monthly`) show **Approved** in ASC —
  they now exist on production StoreKit. Remaining: verify the paywall on
  the live App Store app (real device), optionally add the yearly intro
  offer in ASC, and submit the group localization ("Prepare for Submission",
  cosmetic) with the next binary. Full saga in the
  `app-store-resubmission-status` memory.
- **v1.0.4 CANDIDATE CODE-COMPLETE on main** (2026-07-11, commits 9f54168 /
  85c60b5 / 8345490): v1.0.3 performance pass + enhancement sprint — milestone
  target-date countdowns, streak-shield visibility, notification "Mark all
  done" action, onboarding-chat persistence, ratings prompt, free Weekly
  Review ritual, premium coach memory, completion notes. Largely verified
  live on simulator; **release train unblocked** once the live paywall is
  verified. Pickup detail in the `enhancement-sprint-v1-0-4` memory.
- **Product direction & roadmap:** progress-feeling, stickiness, a coherent
  daily loop. Approved forward roadmap (widgets, Wrapped share card, insights
  panel, intro offer…) with build-status marks: `docs/enhancement-roadmap.md`.
  Background: `docs/ux-optimization-plan.md`, `docs/ux-redesign-proposal.md`.
- **Website** (2026-07-11): direct App Store CTAs, official badge, social
  share card, FAQ (+ FAQPage schema), Pricing nav — live.

The persistent memory files carry the evolving detail; keep both current.
Read `enhancement-sprint-v1-0-4`, `app-store-resubmission-status`, and
`local-builds` first when resuming.

Evolving project status lives in persistent memory (`MEMORY.md` index);
this file holds the durable codebase facts. Keep both current.
