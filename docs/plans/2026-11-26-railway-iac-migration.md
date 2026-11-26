# Preserve production configuration after Railway's Config as Code cutoff

Date: 2026-11-26
Accepted intent: Brett requested the Railway configuration follow-up now after
the legacy-file cutoff was identified. This authorizes an equivalent app-service
migration, publication, cutover, and verification within the constraints below.
Baseline: main `b48cd0f6a4a92a2a167eaa8ecd7ddd8f31fe9ec9`, successfully deployed
as `b2cc5e8f-5370-4208-bd9e-d1810773a677`.

## Outcome and scope

Replace the production app's legacy `railway.json` configuration before the
December 1 cutoff. Preserve Dockerfile builds, `/api/health`, the restart
policy, one US West replica, GitHub main source, custom domains including the
`www` port, all service variables, and the existing Postgres service and volume.
No native build, app behavior, subscription, model, or database change is in scope.

## Plan

1. Save a sanitized production baseline and inspect the official CLI's migration
   preview. Generate an app-only named IaC partial, with variables unmanaged,
   so omitted database/volume resources cannot be removed by this repository.
2. Commit the replacement `.railway/railway.ts`, its authoring dependency,
   ignored local migration/plan artifacts, a regression guard, and operational
   guidance. Preserve exact source/build/deploy/domain settings; the generated
   file is a starting point, not an accepted production diff.
3. Run typecheck, relevant regression checks, formatting, server build, and
   independent report-only review. Use the CLI's safe planning facilities.
4. The CLI refuses IaC planning while the service's legacy Config File path is
   set. After local verification, cut over only `app` and retain the undo
   snapshot locally. This changes the config-path metadata, not the running
   deployment. Preview immediately; undo if the proposed diff exceeds scope.
5. Apply a pinned, reviewed plan only when it preserves existing resources and
   credentials. Do not authorize destructive changes. If new/deleted resources,
   variable changes, billing changes, or unexpected settings appear, fix the
   local declaration or restore the old config path before proceeding.
6. Remove the old file from git only after cutover and successful equivalent
   settings application. Publish through a PR, require CI, and merge. No
   permanent automatic infrastructure-apply credential is introduced.
7. Verify a deployment built without the old file; confirm the active source,
   builder, health/restart settings, domains/TLS, unchanged database/volume
   identity, app health, and authenticated AI functionality. Re-plan afterward
   and require zero infrastructure drift.

## Constraints and rollback

- Project: resolution-companion; environment: production; service: app.
- Use the named `app` partial and unmanaged variables. Do not import secrets
  or let the spec manage Postgres, volumes, or unrelated services/projects.
- Do not pass `--include-variables`, `--decrypt-variables`, `--show-values`, or
  `--confirm-destructive`. Keep migration snapshots and pinned plans untracked.
- Keep the legacy file in the deployed revision until its Config File path is
  cleared and equivalent dashboard settings are established. Do not merge a
  deletion while Railway still expects that file.
- Before merging the removal, `railway config migrate undo` can restore the
  saved legacy path. The running model-migration deployment remains available
  as a rollback baseline. After removal, restore the file before restoring its
  Config File path. Do not roll back to the retired AI model.
- Production authorization covers this equivalent migration. Any expansion
  beyond these constraints requires Brett's review of the concrete diff.

## Sources

- [Railway Config as Code cutoff](https://docs.railway.com/config-as-code).
- [IaC migration, cutover, partial ownership, and pinned plans](https://docs.railway.com/infrastructure-as-code).
- Installed CLI: Railway 5.75.0. Preview generated with
  `railway config migrate --service app --variables unmanaged --show`.
