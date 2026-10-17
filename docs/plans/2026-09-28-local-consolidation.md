# Local codebase consolidation

Requested by Brett on September 28, 2026: consolidate recent updates into
`/Users/brettpollak/Documents/resolution-companion`.

## Intent and plan

The clean primary checkout is at `a5b9a2a`, matching freshly fetched
`origin/main`. Recent app and server updates remain in open PRs. Integrate
existing work locally on `codex/consolidate-local-2026-09-28`:

1. Merge PR #24 (`claude/eager-newton-b0bbo5`, `2e9d861`), which contains the
   accepted 1.5 plan, app consolidation, date fixes, and recovered build 98
   HealthKit fix. Preserve main's current website and server foundation.
2. Merge PR #25 (`claude/elegant-maxwell-hqkcjx`, `e47936e`), containing
   telemetry compatibility, anchorless tune-ups, and release structured-data fixes.
3. Apply PR #26's distinct documentation commit (`b6c8763`); its preceding
   website/version commits are already represented on main.
4. Install locked dependencies and run typecheck, Jest in Pacific time, lint,
   formatting, release checks, accessibility checks, and server build.
5. Record the integration result and any pre-existing failures here.

## Scope and acceptance

The requested directory must contain the combined updates with a clean,
committed working tree. Other worktrees remain intact. Existing review and
release gates remain in force: local consolidation does not publish to GitHub,
merge remote PRs, deploy Railway, upload a binary, or submit to Apple.

The older `release/1.5-new-year` branch is a source archive superseded by
PR #24's deliberate app-only landing; merging it wholesale would regress
the current server and website. The HealthKit salvage branch is represented
by PR #24's `2e9d861` adaptation. Both existing local worktrees are clean.

No new product behavior is designed in this consolidation. Native simulator
and physical-device release verification remain separate from source and
automated-check verification.

## Result

All integrations completed without conflicts:

- `05abab9`: merge PR #24 through `2e9d861`.
- `9186ab3`: merge PR #25 through `e47936e`.
- `0d220e1`: apply PR #26's distinct documentation change.

The integrated app paths are byte-identical to PR #24, and `server/` is
byte-identical to PR #25. Website templates, website assets, and discovery
text files match freshly fetched `origin/main` (`a5b9a2a`). The 1.5 draft
release entry is retained. Existing worktrees had no uncommitted changes.

Installed dependencies with `npm ci` using Node 22.23.1. Verification:

- Typecheck: passed.
- Jest: 45 suites, 319 tests passed under `America/Los_Angeles`.
- Lint: passed with no warnings after excluding `.claude/worktrees/**`.
  The initial run incorrectly linted the two nested checkouts against this
  checkout's dependencies and aliases; the narrow exclusion fixes that scope.
- Formatting and `git diff --check`: passed.
- Release check: passed for 1.5.0, draft status, five App Store notes.
- Server bundle: passed.
- Accessibility: five existing failures, one missing skip link in each of
  landing-page, release-notes, feedback, privacy, and terms templates.
  Both those templates and the accessibility checker are unchanged from main.

No native build or simulator run was performed during this source-consolidation
task. Remote branches, open PRs, production, and Apple submissions were not
changed. The branch remains local, with main still at `a5b9a2a`.

The leading status notes in AGENTS.md, CLAUDE.md, and the previous handoff now
point here so older July status and the resolved missing-HealthKit note do not
misdirect the next session. The user-requested directory is the active checkout.
