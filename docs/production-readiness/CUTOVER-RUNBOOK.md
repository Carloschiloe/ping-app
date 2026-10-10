# Production cutover runbook — authorization required

Status: **not executable yet**. The historical Supabase project is restored
and externally reported `ACTIVE_HEALTHY`; the supplied snapshot is recorded,
but no migration, variable change, deployment, or production write has been
performed from this preparation branch.

## Pre-cutover gates

- [x] Historical project `wbigqhtuzfmpnxservlf` restored by its owner and reported `ACTIVE_HEALTHY`.
- [x] External read-only snapshot confirms URL/ref, legacy inventory, security
      state, Auth baseline and Storage baseline.
- [ ] Optional live catalog replay confirms exact expressions before execution.
- [ ] Encrypted schema, data, Storage metadata, and all 48 Storage binaries exist outside Supabase.
- [ ] Backup evidence explicitly says `BACKUP_CREATED=YES` and
      `BACKUP_VERIFIED=YES`; the gate rejects either value when absent.
- [ ] Backup restore has been verified in a disposable target.
- [x] Remote migration history is recorded as absent/0 in the supplied snapshot;
      the live schema snapshot is preserved in `production-snapshot-20261010.json`.
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

## Bridge package

The current legacy-to-RC package is a guarded candidate only:

- `supabase/production-reconciliation/production-bridge-precheck.sql`
- `supabase/production-reconciliation/20261009_production_legacy_to_rc_bridge.sql`
- `supabase/production-reconciliation/production-bridge-postcheck.sql`
- `docs/production-readiness/production-forward-package.json`

The bridge handles the demonstrated Auth/profile and function-boundary fixes,
and contains a gated deny-by-default treatment for the 11 legacy tables that
currently lack RLS: it enables RLS without guessed policies and revokes direct
client table privileges. The ordered forward package creates the additive RC
objects after the bridge. It is still not authorized for execution until the
external backup and live schema/policy/grant prechecks pass.

## Abort conditions

Abort and do not improvise if the project ref, schema hash, migration history,
backup evidence, RLS result, or runtime configuration differs from the gate.
Any provider, auth, database, or migration error is a stop condition until
diagnosed from evidence.
