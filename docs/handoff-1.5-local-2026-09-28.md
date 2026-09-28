# Handoff: 1.5 "New Year" release, cloud landing → local Mac mini session

From: the cloud Claude Code session that landed 1.5 (2026-09-28). To: the local
Claude Code session on Brett's Mac mini that takes it from here. Owner: Brett.

## Where things stand

- **Branch `claude/eager-newton-b0bbo5`** = `main` + one landing commit
  (`9099041`) + this doc. It is **draft PR #24** against `main`. CI (release
  check, typecheck, lint, format, server build) is green; no merge conflict; no
  review comments.
- **This branch is the one to build from.** Its app side (`client/`,
  `targets/`, `plugins/`, `modules/`, `app.json`, `eas.json`, `package*.json`,
  `assets/images/`, `qa/`) is byte-identical to `release/1.5-new-year` (the
  verified live 1.4.1 build-95 source plus the 1.5 work), except Prettier
  formatting in `app.json`. Its server and website are `main`'s, which is what
  Railway runs today.
- **Not built, uploaded, or submitted.** No simulator build, TestFlight
  upload, or App Store Connect change has happened from this branch.
- `app.json`: `expo.version` **1.5.0** (above the released 1.4.1). Build
  numbers come from EAS remote auto-increment; `build:local:ios` runs
  `release:sync:ios-build-number` first so the widget matches.

Background, in reading order:
1. PR #24's description (what was taken from where, and why).
2. `HANDOFF-1.5-new-year.md` on `origin/release/1.5-new-year` (the Mac mini's
   original plan; its sections 3–6 still apply).
3. `docs/plans/2026-09-28-new-year-release.md` (the accepted 1.5 plan and
   simulator verification) and `docs/app-store-1.5-new-year.md` (trial, In-App
   Event, listing copy, dates).

## Decisions already made in the landing (don't redo them)

- **Server stays `main`'s.** Every endpoint the 1.5 client calls exists there,
  and none of the 1.5 changes touch the client's requests (checked against live
  1.4.1 `f77421e`). `main`'s extraction schema requires exactly 3 milestone
  proposals; the 1.5 client's prompt already asks for "between 3 and 5 as
  required by the response schema" and preselects only the first. The release
  branch's looser 1–5 server change was deliberately not imported. No server
  deploy is needed for 1.5.
- **Kept from `main`:** `shared/plan-tune-up.ts` (`server/routes.ts` imports
  it), `scripts/check-accessibility.mjs` (`main`'s is the newer, stricter
  guard; the 1.5 client passes it), `scripts/render-social-cards.mjs`,
  `public/`, `server/templates/`, `marketing/`.
- **App icons:** `assets/images/` comes from the release branch (the original
  handoff's copy list missed it; `main`'s icons are older).
- **`public/releases.json`:** `main`'s file with the 1.5.0 `draft` entry on
  top so `release:check` passes.

## Verified in the cloud (Linux)

`npm ci`, `release:check`, `check:types`, `lint`, `check:format`,
`server:build` all pass; `TZ=America/Los_Angeles npx jest` → 43 suites, 312
tests pass. `npm run check:a11y` fails only on 5 website templates missing a
skip link to `#main-content`; that already fails on `main`, is not in CI, and
is not a 1.5 issue.

## Your next steps (Mac mini)

1. **Work outside iCloud.** Clone fresh to `~/Developer/resolution-companion`
   and `git switch claude/eager-newton-b0bbo5`. `~/Documents` is iCloud-synced
   with broken sync; evicted "dataless" files hang builds silently (see
   `CLAUDE.md`). Use Node 22:
   `PATH=/opt/homebrew/opt/node@22/bin:$PATH`.
2. `npm ci`, then `npm run check:types`, `npm run lint`,
   `TZ=America/Los_Angeles npx jest`, `npm run release:check`.
3. **Simulator:** `npm run build:local:sim`, install fresh, and walk it per
   section 3 of the original handoff: setup (starter chips, Coach asks for an
   outcome, inline "Review my plan"), plan review, Today (resolution line,
   reminder primer, one day-complete card, widget tip), Journey, the year card
   and teaser, the paywall (plans first), Coach (tall sheet, Done saves to Past
   Sessions). Compare with
   `~/Documents/resolution-companion-1.5/build/verify-1.5/`. Maestro flows are
   in `qa/`.
4. Report to Brett, then **stop for his go** before step 5.
5. **TestFlight (Brett's go only):** `npm run build:local:ios` then
   `npm run submit:local:ios`. Note that `submit:local:ios` ends with
   `release:mark-submitted`, which edits `public/releases.json`; commit that to
   this branch, never `main`.

## Gates and don'ts

- **Don't merge PR #24 or push to `main`** until Brett wants 1.5 announced.
  Railway auto-deploys `main`, and the website publicly renders
  `releases.json` drafts.
- No EAS cloud builds; local only.
- No TestFlight upload, App Store Connect change, or submission without
  Brett's go. ASC dates: yearly intro offer live by Nov 15; 1.5 submitted by
  Dec 5; In-App Event "New Year, Fresh Start" published Dec 12.
- Don't relax `client/lib/__tests__/copy-guard.test.ts`; fix the copy.
- Push fixes to this branch; PR #24 updates, and CI re-runs.

## Open items for Brett

- The work Mac's edits after build 95 (`client/screens/ProfileScreen.tsx`,
  `client/screens/ActionEditorScreen.tsx`, `client/lib/health.ts`, their tests,
  and an `android/` folder) are not in this branch. Only the work Mac has them.
  Decide whether they matter.
- The January 1 start path appears only from Nov 15. It is unit-tested
  (`new-year-plan.test.ts`, `notifications.test.ts`); check it on a device in
  late November.
- Optional: add skip links to the website templates so `check:a11y` passes
  (website work, separate from 1.5).
