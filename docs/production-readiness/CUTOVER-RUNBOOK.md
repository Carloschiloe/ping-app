# Production cutover runbook — authorization required

Status: **not executable yet**. The historical Supabase project is inactive,
and no restore, variable change, migration, deployment, or production write
has been performed.

## Pre-cutover gates

- [ ] Historical project `wbigqhtuzfmpnxservlf` restored by its owner.
- [ ] Read-only inspector confirms URL/ref match and database connectivity.
- [ ] Encrypted schema, data, and Storage backups exist outside Supabase.
- [ ] Backup restore has been verified in a disposable target.
- [ ] Remote migration history and live schema snapshot are preserved.
- [ ] Reconciliation report has no `UNKNOWN`, `DIVERGED`, or unreviewed risk.
- [ ] Production env manifest is configured with production-only values; no
      staging ref, staging key, `PING_M7_DATABASE_URL`, or staging origin.
- [ ] `PING_ENVIRONMENT=production`, `PING_SEMANTIC_MODEL=gpt-6-luna`, and
      `PING_SEMANTIC_MODEL_FAMILY=modern_reasoning` are explicitly configured.
- [ ] RC SHA is verified as `ac7d72af5dfd4a9744a356eca6539bab75609b22`.

## Execution order

1. Put the service in the smallest safe maintenance mode available.
2. Apply only the reviewed forward migration set; never run `db reset`.
3. Verify DB health and aggregate schema checks.
4. Verify auth login/session, RLS cross-user denial, commitment read/write
   through canonical application paths, messaging, Storage and Realtime.
5. Deploy the RC to the production service only after the preceding gates are
   recorded.
6. Run the production smoke plan and inspect sanitized logs.

## Abort conditions

Abort and do not improvise if the project ref, schema hash, migration history,
backup evidence, RLS result, or runtime configuration differs from the gate.
Any provider, auth, database, or migration error is a stop condition until
diagnosed from evidence.
