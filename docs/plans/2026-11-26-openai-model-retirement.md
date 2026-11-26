# Replace GPT-5 mini before its API shutdown

Date: 2026-11-26
Status: Accepted by Brett on 2026-11-26 ("Approved"); implementation authorized.
Baseline: `main` at `1f86e39a0469f454e4d4593123ee2051af261524`.

## Intent

Keep AI coaching and onboarding working for installed Resolution Companion
apps after OpenAI shuts down `gpt-5-mini` on December 11, 2026. Cover all AI
features using the same server model without requiring a native app update.

## Verified findings

- OpenAI's [deprecation notice](https://developers.openai.com/api/docs/deprecations)
  gives December 11, 2026 as the shutdown date for both `gpt-5-mini` and its
  dated snapshot. Its recommended replacement is `gpt-6.1-terra`.
- `client/lib/ai.ts` calls our server. `server/routes.ts` selects
  `process.env.AI_MODEL || "gpt-5-mini"`; the variable is **AI_MODEL**, despite
  the older codebase guide calling it OPENAI_MODEL.
- Seven Chat Completions call sites across `/api/chat`,
  `/api/extract-persona`, `/api/reflection`, `/api/milestone-proposal`, and
  `/api/plan-tune-up` share that model and hardcode `reasoning_effort: "minimal"`.
- [GPT-6.1 Terra](https://developers.openai.com/api/docs/models/gpt-6.1-terra)
  supports Chat Completions, streaming, and structured output. Supported
  reasoning levels include `low`, but not `minimal`. No current route uses
  function tools, so this migration does not require a Responses API rewrite.
- Existing completion budgets range from 256 to 2048 tokens and include
  reasoning. A model-name-only configuration change leaves incompatible
  reasoning settings and risks empty or truncated output.
- A fresh HTTPS request to production `/api/health` returned `status: ok`.
  This checks server reachability, not model inference. The fresh production
  privacy page still names GPT-5 mini.
- The saved Railway credential returned HTTP 403 on a read-only variables
  lookup. Production AI_MODEL, upstream configuration, and deployed revision
  remain unverified. Do not report the checked-in default as confirmed runtime
  configuration or treat the public privacy page as runtime evidence.

## Accepted implementation

1. Set the server default to `gpt-6.1-terra` and use a shared, typed request
   configuration with `reasoning_effort: "low"` at all seven call sites. Retain
   `AI_MODEL` as an explicit operator override; document that overrides must
   support the configured reasoning level and output formats.
2. Preserve each endpoint's existing request/response shape, JSON validation,
   SSE framing and `[DONE]` marker, disconnect cancellation, timeouts, quotas,
   and token metering. Keep both legacy and current reflection/tune-up paths.
3. Add regression coverage that exercises the routes with a mocked provider
   and verifies compatible model parameters, nonempty SSE/JSON responses,
   strict persona output, and both older-client response paths. Keep empty
   or truncated provider output from being accepted as a successful reply.
4. Using synthetic inputs only, compare GPT-5 mini and the replacement through
   the configured provider: onboarding chat, persona extraction, streamed and
   nonstreamed reflection, milestone suggestions, and both tune-up formats.
   Record latency, token usage, finish reason, valid parsed output, and a
   supportive, relevant coaching response. Adjust completion budgets only
   where these checks demonstrate insufficient room for reasoning plus output.
5. Update the model name and revision date in the privacy template, correct
   the model guidance in AGENTS.md, and document AI_MODEL in DEPLOYMENT.md.
   Keep the published model disclosure aligned with the actual deployment.

## Acceptance and verification

- Regression tests pass, including nonempty output, structured persona
  parsing, and legacy client compatibility; run the full Jest suite in Pacific
  time, typecheck, lint, formatting for changed files, and server build.
- Synthetic provider requests succeed on every response mode without changing
  app contracts. Record observed latency and token cost before recommending
  production deployment; no quality or cost equivalence is assumed.
- Verify an installed app's Coach and onboarding behavior against a local or
  preview backend where available. Report any unavailable native checks.
- Obtain production configuration access and confirm the actual deployment
  source and AI_MODEL override. A remaining `gpt-5-mini` override must be removed
  or replaced during the approved cutover, or it will defeat the new default.
- After Brett approves deployment, verify deployed revision/configuration,
  authenticated streaming and structured output with synthetic content,
  health, metering model, and cache-busted privacy disclosure. Health alone
  does not establish that coaching works.

## Authorization and rollback

Brett accepted this plan on 2026-11-26 with "Approved" after reviewing the
investigation and proposed migration. Implementation and verification on this
branch are authorized. Production deployment remains a separate human gate;
no deployment or App Store submission is authorized by this acceptance.

After acceptance, implement on this branch and present the verified diff for
deployment approval. Before cutover, preserve the prior deployed revision and
configuration. Reverting to GPT-5 mini is only a temporary option **before**
December 11; after shutdown, rollback must retain a supported model and its
compatible request parameters. Do not add an untested automatic fallback.

## Implementation and verification (2026-11-26)

- Implemented locally: shared typed `OPENAI_CHAT_OPTIONS` selects
  `gpt-6.1-terra` with low reasoning effort, while retaining AI_MODEL overrides.
  All seven provider calls and model usage records use the shared configuration.
- Empty, whitespace-only, unterminated, filtered, and truncated replies take
  the existing error path. Streaming still forwards content immediately, but
  sends an error instead of `[DONE]` when the final output is incomplete.
  Already-streamed partial text cannot be retracted; existing clients reject
  the error frame. JSON paths retain their established error response formats.
- Added 44 real-route HTTP tests, plus two comparison-harness HTTP tests that
  use the real OpenAI SDK against a **synthetic** provider. Cover all seven
  response modes, strict persona output, auth, error handling, per-attempt
  metrics, preserved upstream 401 responses, and credential-safe error output.
- Full Pacific-time test suite: **64 suites, 624 tests passed**. Typecheck,
  lint, formatting for changed TypeScript, server bundle, and diff checks pass.
- Rendered the local privacy page in headless Chrome and visually inspected
  the updated date and GPT-6.1 Terra disclosure. Local screenshots:
  `build/model-migration-privacy.png` and
  `build/model-migration-privacy-full.png` (gitignored).
- Independent report-only agent review found no production-route blocker.
  Its comparison-harness finding was fixed: cancel provider work on proxy
  disconnect, isolate metrics per attempt, and preserve upstream error status.
  The reviewer confirmed the fixes and reported no additional code findings.

### Outstanding before deployment

- The Railway CLI confirms the saved login has expired: "Your saved login is
  no longer valid (grant request is invalid)." Reauthentication requires Brett
  to run `npx --yes @railway/cli login`. No server provider key is available in
  this checkout or shell. The real comparison was **not run**; the script
  correctly refuses to run without AI_INTEGRATIONS_OPENAI_API_KEY.
- After authentication, verify production configuration and run
  `npx tsx scripts/verify-ai-migration.ts > build/ai-migration-live.json` with
  the server provider credentials injected only into the child environment.
  It compares all seven routes on the old/new model through a local SDK proxy,
  without production database access. Review the recorded synthetic responses,
  finish reasons, latency, and per-attempt token usage; calculate costs from
  current provider prices. Existing budgets are unchanged pending evidence,
  especially the 256-token milestone budget.
- No simulator was booted, no native app was rebuilt, and no new native UI
  verification is claimed. The changed server contracts are covered by HTTP
  tests; actual installed-app behavior still needs the model-backed check.
- No branch was pushed, no PR was created, and no production configuration,
  deployment, or App Store state was changed. Obtain deployment approval only
  after the outstanding model and configuration checks pass.

### Production browser inspection (2026-11-26, after Brett confirmed sign-in)

- Verified the signed-in Railway dashboard and the `app` service in the
  `resolution-companion` project's `production` environment. The service owns
  `resolutioncompanion.com`, has one replica in US West, and is online.
- Active successful deployment: `a30b775f-7490-46ab-88a3-154b7acec609`, titled
  "Mark 1.6.1 released and refresh llms files to current version", via GitHub.
  This is the title of baseline main commit `1f86e39`; the deployment's exact
  source SHA has not yet been independently read back.
- Its nine service variables include AI_INTEGRATIONS_OPENAI_API_KEY but no
  AI_MODEL or AI_INTEGRATIONS_OPENAI_BASE_URL override. The deployed baseline
  therefore uses GPT-5 mini through the default OpenAI endpoint. No variables
  were changed and no credential values were displayed or saved to files.
- Browser sign-in did not renew CLI access. A CLI OAuth renewal was opened
  and limited to the bpollak workspace and Resolution Companion project.
  Its consent also requests workspace administration, SSH-key management,
  and persistent access. Awaiting Brett's confirmation before Authorize;
  the expired grant's exact permissions could not be verified. Live model
  comparison is still pending. No new access grant or deployment was made.
