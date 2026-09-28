# Handoff: Resolution Companion 1.5 "New Year" release

From: Claude Code session on the Mac mini, 2026-09-28. To: the agent landing 1.5 (a cloud
session that works from GitHub). Owner: Brett.

**Where things are on GitHub (`bpollak/resolution-companion`):**
- `release/1.5-new-year`: this branch. The verified live 1.4.1 app source plus the full 1.5
  release, and this file. Its history is unrelated to `main` (the 1.4.1 source was a snapshot).
- `main`: the server, the marketing website, and older (July) app code. Railway deploys `main`.

**Also true:** the Mac mini checkout `~/Documents/resolution-companion` has 4 local commits not
yet on GitHub (website 1.4.1 rename work and an `app.json` version bump, 2026-09-28). You can't
see them; don't recreate them. Brett or the Mac mini session pushes them separately.

Your job: land the 1.5 app on top of `main`'s server and website on a branch, verify what can be
verified off the Mac, and stop at Brett's gates.

## 0. Read this first: `main`'s app code is not the live app

`client/` on `main` is the **July 29 app code** (and the Mac mini's local `main` now labels it
1.4.1 in `app.json`). The App Store's 1.4.1 (build 95) was built from a different, never-committed tree on
the work Mac (`/Users/bpollak/Documents/resolution-companion`, branch
`codex/ux-review-improvements`, base `2988352`), snapshotted with source hashes into
`~/Documents/resolution-release-1.4.1` on the Mac mini. `main`'s `client/` differs from that live
source in 81 files.

**Never build, upload, or submit from `main`'s `client/`.** It would ship an older app.

## 1. What is ready

Branch `release/1.5-new-year` = the verified 1.4.1 build-95 source (`f77421e`) plus the whole
1.5 release (the commit after `f77421e` onward). On the Mac mini it also lives in
`~/Documents/resolution-companion-1.5` and as `~/Documents/resolution-companion/handoff/release-1.5-new-year.bundle`.

Read in this branch:
- `docs/plans/2026-09-28-new-year-release.md`: the accepted plan (19 items), review round, and
  simulator verification. Brett accepted the plan on 2026-09-28.
- `docs/app-store-1.5-new-year.md`: trial, In-App Event, seasonal listing copy, dates.
- `public/releases.json`: 1.5.0 entry (status `draft`), passes `npm run release:check`.

State at handoff: `npm run check:types` clean, `npm run lint` clean, 314 jest tests pass
(`TZ=America/Los_Angeles`), local simulator build 1.5.0 walked end to end (screenshots in
`~/Documents/resolution-companion-1.5/build/verify-1.5/`). An independent report-only review
found no high-severity issues; its six medium findings are fixed.

What 1.5 changes for users: resolution-first onboarding with one-tap starters; the person's
resolution is kept, shown on Today, and given to Coach; milestones name progress toward the goal;
a "Start January 1" choice from Nov 15 to Dec 31 with a countdown and no pre-start misses; a
reminder primer before the iOS permission prompt; the widget/Siri/Health tip where people see it;
a free shareable year card with a Premium teaser; paywall leads with the plans; Coach opens tall,
saves on close, and avoids "last week" on day one; plain vocabulary (habit, milestone, who you're
becoming); a trimmed Journey; em dashes blocked by a test and cleaned from model output.

## 2. How to land it

The histories are unrelated (the release tree was a snapshot), so land it by tree, not by merge.
Keep `main`'s **server, website, and marketing**; take the **app** from this branch.

```bash
git fetch origin main release/1.5-new-year
git switch -c release/1.5-landing origin/main
# App side from the release branch (live 1.4.1 + 1.5):
git checkout origin/release/1.5-new-year -- client targets plugins modules shared \
  app.json eas.json package.json package-lock.json babel.config.js tsconfig.json \
  eslint.config.js .easignore qa scripts CLAUDE.md AGENTS.md design_guidelines.md \
  docs/plans/2026-09-28-new-year-release.md docs/app-store-1.5-new-year.md
```

Then reconcile by hand, in this order:

1. **Server: keep `main`.** Every endpoint the 1.5 client calls exists on `main`'s
   `server/routes.ts` (`/api/chat`, `/api/extract-persona`, `/api/reflection`,
   `/api/milestone-proposal`, `/api/plan-tune-up`, `/api/iap/validate`,
   `/api/subscription/restore`, `/api/telemetry`, `/api/ai-content-reports`), and it is the server
   the live 1.4.1 app already uses. The release branch's `server/` is older website templates plus
   an `ambient-plan-tune-up.ts` -> `plan-tune-up.ts` rename; do not import it. All 1.5 prompt
   changes live in `client/lib/ai.ts` and ship in the app binary, so no server deploy is needed.
   Do confirm the extraction request still fits the server's strict JSON schema
   (`server/persona-extraction.ts`): 1.5 did not add fields.
2. **`public/`: keep `main`** (the Mac mini's pending website commits also land there), then add the 1.5.0 entry
   from the release branch's `public/releases.json` at the top. It is `draft`, but the website
   shows draft entries (labeled Draft, `server/index.ts`) and serves `/releases.json` publicly,
   so this entry must not reach `main` until Brett wants 1.5 announced.
3. **`scripts/`, `qa/`, `package.json`:** take the release versions (they carry the 1.4.x build,
   release-check, and Maestro flows), then diff against `main` for anything website-only you need
   to keep.
4. **Work Mac edits after build 95** (dated Sep 9 in the iCloud mirror
   `~/Library/Mobile Documents/com~apple~CloudDocs/Documents/resolution-companion`, reads hang):
   at least `client/screens/ProfileScreen.tsx`, `client/screens/ActionEditorScreen.tsx`,
   `client/lib/health.ts`, `client/lib/__tests__/health-native-module.test.ts`,
   `client/lib/__tests__/profile-navigation.test.ts`, and an `android/` folder. Ask Brett whether
   those matter; if yes, copy them from the work Mac and merge by hand. 1.5 edited only copy
   strings in `ProfileScreen.tsx` and `ActionEditorScreen.tsx`.
5. Delete stray `* 2` duplicate files (for example `.gitignore 2`), which are iCloud copies.

## 3. Verify before you tell Brett it's ready

```bash
npm ci
npm run check:types
npm run lint
TZ=America/Los_Angeles npx jest
npm run release:check
npm run build:local:sim   # Mac only; never an EAS cloud build
```

Off the Mac, run everything above except the simulator build. On the Mac mini, install the simulator build fresh and walk: setup (starter chips, Coach asks for an outcome,
inline "Review my plan"), plan review (resolution, "toward" milestone, the person's own anchor),
Today (resolution line, reminder primer, one day-complete card, widget tip), Journey (ring label,
blank pre-start days), the year card and teaser, the paywall (plans first), and Coach (tall sheet,
Done saves to Past Sessions). Compare against the screenshots in
`~/Documents/resolution-companion-1.5/build/verify-1.5/`.

The January 1 path only appears from Nov 15 (unit-tested in
`client/lib/__tests__/new-year-plan.test.ts` and `notifications.test.ts`). Check it on a device
in late November.

## 4. Gates (Brett's go for each)

- Push your landing branch to GitHub as a branch and open a PR for Brett. **Never push to `main`
  without Brett**: Railway auto-deploys `main` (server + website), and the website publishes
  `public/releases.json`, including drafts.
- Simulator verification, TestFlight and App Store Connect need the Mac mini (Xcode, signing,
  Brett's sessions). Hand those back to the Mac mini session.
- TestFlight: bump the build number, `npm run build:local:ios`, then `npm run submit:local:ios`.
  Before building, confirm `expo.version` is above the last released App Store version (1.5.0 is).
- App Store Connect (steps in `docs/app-store-1.5-new-year.md`): yearly introductory offer live by
  Nov 15; 1.5 submitted by Dec 5; In-App Event "New Year, Fresh Start" published Dec 12.

## 5. Don'ts

- No EAS cloud builds (Brett's standing rule: local builds only).
- Don't overwrite `server/` or `public/` from the release branch wholesale.
- Don't relax `client/lib/__tests__/copy-guard.test.ts`; fix the copy instead.
- Don't submit, upload, or change App Store Connect without Brett's go.

## 6. Open items

- Decide on the work Mac's post-release edits (section 2, step 4).
- The reminder primer's "Not now" is remembered (no nagging); Profile still turns reminders on.
- Session record: Hermes memory 2026-09-28 ("Resolution Companion 1.5 New Year release built and
  verified locally").
