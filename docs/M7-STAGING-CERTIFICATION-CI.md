# M7 staging certification CI

This workflow is the controlled path for `codex/staging-beta` only:

`push -> quality gate -> Render deploy hook -> exact health SHA gate -> authenticated /agent/turn E2E -> evidence artifact`

It does not run for `main`, does not reference the production service, and does
not change Render auto-deploy configuration. The staging service must remain
separate from `ping-backend`; the workflow requests a deploy only after the
quality job succeeds.

## Exact gates

1. GitHub checks out the pushed commit and runs the backend build plus the
   focused M7 semantic/dialogue regression suite. The normal repository CI
   remains a separate quality signal for pull requests and `main`.
2. The deploy job verifies that `codex/staging-beta` still points to the
   workflow SHA before calling the staging-only Render deploy hook.
3. `/api/health` must report `ok: true`, `db_status: connected`,
   `deployment_marker: ping-backend-staging`, and the exact workflow SHA (or
   its seven-character health representation). A mismatch stops the job before
   E2E.
4. Only after that gate does the job run the authenticated E2E against
   `/api/agent/turn` and upload a short-lived evidence artifact.

The E2E uses a reusable staging identity and a temporary tombstoned group. It
does not create users, deactivate identities, execute production writers, or
copy secrets into artifacts. `backend/.m7-smoke-artifacts/` is ignored by Git.

## Required one-time owner configuration

Create the GitHub environment `m7-staging-certification` and add these
environment secrets. Values must belong only to Supabase project
`oonijgmddgyymhrlnvuu`:

- `RENDER_STAGING_DEPLOY_HOOK_URL`: a deploy hook created on Render service
  `ping-backend-staging`.
- `M7_STAGING_SUPABASE_URL`
- `M7_STAGING_SUPABASE_ANON_KEY`
- `M7_STAGING_SUPABASE_SERVICE_ROLE_KEY`

The service-role key is used only by the isolated E2E to select the existing
reusable test identity and verify/tombstone its temporary conversation. It is
never printed or persisted. No `ENCRYPTION_KEY` is required by this remote
client runner; that remains server-only on Render.

The variables have deliberately different roles:

- `SUPABASE_URL` and `SUPABASE_ANON_KEY`: public-client authentication
  against the staging Supabase project.
- `SUPABASE_SERVICE_ROLE_KEY`: staging-only fixture lookup and cleanup; it is
  never sent to Ping's HTTP API.
- `ENCRYPTION_KEY`: server-only Render configuration and not a client E2E
  requirement.

If the environment or any required secret is absent, the quality job can still
run, but the deploy/certification job must stop safely rather than deploy or
run `/agent/turn` without authenticated staging access.

## Evidence

The workflow artifact is retained for 14 days under the run and contains
sanitized turn summaries, checkpoints, cleanup verification, and the result.
It never contains API keys, bearer tokens, or Supabase secrets.
