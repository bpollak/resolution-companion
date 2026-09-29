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
