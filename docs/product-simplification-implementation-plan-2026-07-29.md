# Core-Loop Simplification Implementation Plan

**Status:** Version 1.3, build 74 is live. The simplified source and website
refresh are committed and pushed. Version 1.3.1 build 75 has been uploaded for
the App Store screenshot and metadata refresh; Apple processing is pending.
The website deployment is queued during Railway's July 30 build and deployment
incident.

**Branch:** `agent/simplify-core-loop`
**Product decision record:**
`docs/product-simplification-audit-2026-07-29.md`

This file is the execution handoff. An agent should be able to resume the work
from this document without reconstructing the product decision.

## Objective

Make the app feel like one coherent loop:

1. Choose who you are becoming.
2. Complete today's actions.
3. See the evidence accumulate.
4. Ask Coach for help when stuck.

Each tab has one job:

- **Today:** act
- **Journey:** see progress
- **Coach:** get help

This is a reversible presentation simplification. Do not delete persisted data,
change schemas, alter entitlements, or remove routes in this pass.

## Worktree safety

The branch was created from commit `c57341d` (`Keep Plan Tune-Up controls
accessible`). The worktree already contained unrelated user-owned changes and
untracked assets before this pass.

Do not edit, stage, delete, or clean:

- `marketing/promo-video/src/shared.tsx`
- any untracked marketing campaign folders or assets
- files whose names end in ` 2.*`
- `ai-onboarding-plan-created.png`
- `ios/ResolutionCompanionAI 2.xcodeproj`

Use `git status --short` before staging. Stage only the files listed under
**Intended change set**.

## Invariants

- Keep the Today completion tap immediate and haptic.
- Keep completed actions visible and editable.
- Keep action notes optional.
- Keep Daily Context data and seven-day backfill available from Journey.
- Keep milestones fill-only and persona-scoped.
- Keep monthly recaps reachable through the unified story.
- Keep Plan Tune-Up preview/confirm behavior and accessibility.
- Keep free versus Premium coaching limits unchanged.
- Keep Profile as the administrative/settings destination.
- Do not add bottom-tab animation; it black-screens tabs on iOS.
- Do not un-memoize AppContext, action rows, or navigation options.

## Intended change set

### Product documentation

- `docs/product-simplification-audit-2026-07-29.md`
- `docs/product-simplification-implementation-plan-2026-07-29.md`

### Build metadata

- `app.json`
- `public/releases.json`

`expo.version` is now `1.3`. The 1.3 release-note record is marked submitted on
July 29, 2026. Do not roll it back or upload a build under an older closed
version train.

### Today

- `client/screens/TodayScreen.tsx`
- `client/components/DayCompleteCard.tsx`

Target state:

- Becoming identity, Today ring, action list, and one completion moment remain.
- Remove visible recap/invitation/observation cards.
- Remove streak, shield, and monthly consistency chips.
- Remove Daily Context and tomorrow preview from Today.
- Use one identity-framed completion toast; do not rotate competing metrics.
- Keep reminder maintenance and App Store review timing under the hood.

### Journey

- `client/screens/JourneyScreen.tsx`
- `client/screens/EvidenceTimelineScreen.tsx`

Target state:

- Show one **Your Story** destination.
- Preserve milestones and calendar/backfill.
- Hide the consistency hero, streak/shield stats, insight panel, annual story,
  witness promotion, and Journey paywall promotion.
- Render the existing chronological evidence timeline as **Your Story**.
- Preserve old routes for compatibility even when they are no longer promoted.

### Coach

- `client/screens/ReflectScreen.tsx`

Target state:

- Replace the dashboard-like home with one dominant **Start a conversation**
  action.
- Present **Review my week** and **Adjust my plan** as compact suggested
  starts, not separate feature sections.
- Remove the momentum hero and coaching article from the home screen.
- Keep a short past-conversation list.
- Keep the check-in allowance as quiet supporting copy and show upgrade only
  near or at the free limit.
- Do not alter the in-session chat, streaming, memory, or save behavior.

### Profile

- `client/screens/ProfileScreen.tsx`

Target state:

- Add a quiet **Trusted witness** settings row that opens the existing
  `Witness` route, since it no longer appears as a Journey destination.
- Do not otherwise reorganize Profile in this pass.

### Regression coverage

- `client/lib/__tests__/profile-navigation.test.ts`
- `qa/maestro-regression.yaml`
- `docs/maestro/profile-simplification.yaml`

These assertions now match the simplified information architecture and cover
the Trusted Witness move.

## Work completed

- Created the product audit and simplified screen sketches.
- Created branch `agent/simplify-core-loop`.
- Simplified Today's visible hierarchy.
- Simplified `DayCompleteCard` to identity evidence only.
- Reduced Journey to one story destination, calendar/backfill, and milestones.
- Renamed the visible Evidence Timeline destination to **Your Story**.
- Replaced the Coach dashboard with one conversation entry and two compact
  suggestions while leaving the in-session experience unchanged.
- Moved Trusted Witness access into Profile.
- Updated unit and Maestro coverage for the new hierarchy.
- Bumped the local app version to `1.3`.

## Validation record

All checks below passed on July 29, 2026:

- TypeScript typecheck.
- Repository lint with zero errors.
- Accessibility static check.
- 34 Jest suites and all 249 tests under
  `TZ=America/Los_Angeles`.
- Prettier check on every intended source and documentation file.
- `git diff --check`.
- Expo Doctor, 18 of 18 checks.
- Local iOS simulator build.
- Fresh-install Maestro regression from onboarding through Today, Journey,
  Coach, Profile, and the paywall.
- Focused Profile regression, including opening Trusted Witness.
- Visual inspection on iPhone 17 Pro / iOS 26.5:
  - Today showed only the identity, daily ring, actions, and one completion
    card.
  - Journey showed one Your Story entry, the calendar, and milestones.
  - Coach showed one dominant conversation entry and two suggestions.

Simulator artifact:

- Path: `build/ios-sim-local.tar.gz`
- Size: 28 MB
- SHA-256:
  `bc565381b5fb2a4e6df31a22f94084de99048ce2ba85e8cca0e4e9ed404bdfbe`

The simulator build emitted a non-fatal version warning: the host app used
build `64` while the widget extension used build `73`. The artifact installed
and ran. The production IPA resolved that warning: both bundles use build `74`.

Production/TestFlight artifact:

- Version/build: `1.3 (74)`
- Path: `build/ios-local.ipa`
- Size: 24 MB
- SHA-256:
  `070407b9c657091d6cd3bb9cca419d41a271453f8a2a582fb06a4c8e39904b5e`
- Host bundle: `com.resolutioncompanion.app`, version `1.3`, build `74`
- Widget bundle: `com.resolutioncompanion.app.widget`, version `1.3`, build
  `74`
- Deep code-signature verification: passed
- EAS submission ID: `55cd097a-f3e9-48b5-b7c4-115674c6739e`
- EAS submission:
  `https://expo.dev/accounts/bpollak99/projects/evolve-app/submissions/55cd097a-f3e9-48b5-b7c4-115674c6739e`
- TestFlight:
  `https://appstoreconnect.apple.com/apps/6757996708/testflight/ios`
- Apple confirmation: version `1.3`, build `74` completed processing on July
  29, 2026.

App Store review submission:

- Status: `Waiting for Review`
- Submitted: July 29, 2026 at 2:13 PM PDT
- Submission ID: `f59bdef1-b220-4361-89c4-788e1cd2d5f2`
- App Store Connect:
  `https://appstoreconnect.apple.com/apps/6757996708/distribution/reviewsubmissions/details/f59bdef1-b220-4361-89c4-788e1cd2d5f2`
- Release method: automatically release after App Review approval
- Rollout: release the update to all users immediately; no phased release
- Rating: keep the existing App Store summary rating
- Version-specific What's New and App Review notes were updated for the
  simplified daily loop.

This pass did not select tester groups, change subscription configuration, or
deploy the public release-notes page.

## Commands to repeat

Use Node 22; Node 25 made Jest and ESLint startup abnormally slow in this
worktree. Run from `/Users/bpollak/Documents/resolution-companion`:

```sh
PATH="/opt/homebrew/opt/node@22/bin:$PATH" npm run check:types
PATH="/opt/homebrew/opt/node@22/bin:$PATH" npm run lint
PATH="/opt/homebrew/opt/node@22/bin:$PATH" npm run check:a11y
PATH="/opt/homebrew/opt/node@22/bin:$PATH" TZ=America/Los_Angeles npm test
git diff --check
git status --short
git diff --stat
```

The ignored duplicate Xcode project causes Expo to select the wrong project if
left in place. Preserve it, move it to a temporary directory for the build,
and restore it even if the build exits:

```sh
duplicate_project="ios/ResolutionCompanionAI 2.xcodeproj"
holding_dir="$(mktemp -d)"
restore_duplicate() {
  if [ -d "$holding_dir/ResolutionCompanionAI 2.xcodeproj" ]; then
    mv "$holding_dir/ResolutionCompanionAI 2.xcodeproj" "$duplicate_project"
  fi
}
trap restore_duplicate EXIT INT TERM
mv "$duplicate_project" "$holding_dir/"
PATH="/opt/homebrew/opt/node@22/bin:$PATH" npm run build:local:ios
```

Follow the simulator install/launch procedure in `AGENTS.md`, then run:

```sh
JAVA_HOME=/opt/homebrew/opt/openjdk@17 \
PATH="/opt/homebrew/opt/openjdk@17/bin:/opt/homebrew/opt/node@22/bin:$PATH:$HOME/.maestro/bin" \
DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer \
maestro test qa/maestro-regression.yaml

JAVA_HOME=/opt/homebrew/opt/openjdk@17 \
PATH="/opt/homebrew/opt/openjdk@17/bin:/opt/homebrew/opt/node@22/bin:$PATH:$HOME/.maestro/bin" \
DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer \
maestro test docs/maestro/profile-simplification.yaml
```

Do not use browser preview for this native app.

## Agent continuation

No implementation, upload, or App Review submission work remains for this
pass. Version 1.3, build 74 is Waiting for Review.

If asked to continue:

1. Refresh the live App Store review state; do not rely on this dated handoff
   for current status.
2. Do not cancel or withdraw submission
   `f59bdef1-b220-4361-89c4-788e1cd2d5f2` without explicit authorization.
3. After approval, verify version 1.3 is available publicly and that automatic
   release completed.
4. Add build 74 to specific internal or external tester groups only if the user
   requests that distribution.
5. Review `git status --short`, then stage and commit only the intended change
   set above.
6. Deploy `public/releases.json` only if asked to update the public Release
   Notes page.

Do not include the unrelated marketing edit, duplicate files, generated
marketing assets, or `ai-onboarding-plan-created.png` in a commit.

## Completion criteria

- [x] A returning user reaches the first Today action without encountering a
      recap, promotion, secondary score, or context form.
- [x] Today exposes only one progress measure: today's
      completed/scheduled count.
- [x] Journey exposes one story destination plus milestones and
      calendar/backfill.
- [x] Coach exposes one dominant conversation action and two compact
      suggestions.
- [x] Trusted Witness remains reachable from Profile.
- [x] Existing persisted data opens without migration.
- [x] Typecheck, lint, tests, and diff checks pass.
- [x] TestFlight version 1.3, build 74 completed Apple processing.
- [x] App Store version 1.3, build 74 was submitted and is Waiting for Review.
- [x] No unrelated file was edited by this pass.
- [ ] Only intended files are staged or committed. Nothing has been staged or
      committed yet.
