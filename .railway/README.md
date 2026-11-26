# Resolution Companion production configuration

`.railway/railway.ts` is the supported Railway IaC declaration. It owns only
the `app` service through the named `app` partial. Postgres and its persistent
volume remain outside this partial. Variables are unmanaged, so credentials
stay in Railway. Do not add them to this file.

Application commits to GitHub `main` still deploy automatically. Railway does
**not** evaluate this authoring file during those builds. Apply infrastructure
changes explicitly with the authenticated Railway CLI after reviewing a plan.
CI checks the declaration's resource and settings constraints without cloud
credentials; it does not apply infrastructure changes.

Use Railway CLI 5.75.0 or newer with the pinned authoring SDK from `npm ci`:

```sh
railway link --project de4ae7a6-3bca-493a-85d1-13a1eee6c134 --environment production --service app
npm run check:railway
railway config plan --environment production --out build/production.plan.json
```

Review the complete plan. Require zero deletions and no variable, database,
volume, billing, or unrelated-service changes. Existing domain ports, source,
Dockerfile builder, health path, restart policy, and replica placement must be
preserved. Have an independent reviewer inspect significant changes.

After production approval, apply that exact plan:

```sh
railway config apply --environment production --plan build/production.plan.json --yes
railway config plan --environment production --detailed-exit-code
```

Do not use `--confirm-destructive` to bypass an unexpected deletion. A pinned
plan rejects environment drift or a changed `.railway/` source tree; create
and review a new plan when either changes. The `build/` directory and local
`.railway/*.json` artifacts are ignored. Never use variable-decryption or
variable-export flags for this workflow.

After applying and deploying, verify both domains over HTTPS, `/api/health`,
authenticated AI requests, active source/deploy settings, and unchanged
Postgres/volume identity. Keep the deployed revision and config baseline for
rollback; see `docs/plans/2026-11-26-railway-iac-migration.md`.
