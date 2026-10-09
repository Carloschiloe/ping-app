# Production readiness gate for RC `ac7d72a`

This directory is preparation evidence only. It does not change `main`, the
certified staging branch, Render configuration, Supabase, or production data.

## Current boundary

- Certified RC: `ac7d72af5dfd4a9744a356eca6539bab75609b22`
- Historical production service: `ping-app`
- Historical production project: `Ping`, ref `wbigqhtuzfmpnxservlf`
- Historical project status: inactive; production health is therefore not
  recoverable until an explicitly authorized restore/reactivation.
- Staging project: `Ping Staging V2`, ref `oonijgmddgyymhrlnvuu`, independent
  from production.
- Current production live SHA: `b6b7175f9b87abfa5fda422931f8e4c4fa92f5c8`

The production inspector requires the historical ref and exact hostname. It
uses a read-only PostgreSQL transaction and refuses the staging ref. It never
prints credentials, rows, message content, or database URLs.

## Migration decision rule

The 33 SQL files in the RC are the canonical forward chain for a fresh
database. They are not evidence that 33 migrations are pending in historical
production. The migration manifest is conservative:

1. `baseline_v2` is `BASELINE_ONLY` and must not be applied to the historical
   project without a schema comparison and an explicit transition plan.
2. A migration is not approved from a filename or file-count difference.
3. A real read-only snapshot of schema objects and
   `supabase_migrations.schema_migrations` is required.
4. Any policy, function, trigger, type alteration, data update, or destructive
   operation remains `REQUIRES_REVIEW` or `DESTRUCTIVE_OR_DATA_RISK` until its
   live impact and rollback are demonstrated.

## Safe sequence after authorization

1. Restore/reactivate the historical Supabase project only through its owner
   control plane; do not point production at staging.
2. Run the read-only inspector and save its aggregate schema/migration output
   outside the repo.
3. Produce an encrypted schema/data/Storage backup outside Supabase and pass
   `validate-backup-gate.mjs`.
4. Reconcile migration history and live schema. Do not apply `baseline_v2`
   blindly. Write a reviewed forward-only transition plan.
5. Apply only approved migrations in a maintenance window, with a rollback
   plan that is data-safe. Prefer additive, idempotent changes; never use
   `db reset` on historical data.
6. Verify health, auth, RLS isolation, commitments, messaging, storage,
   realtime, and safe error behavior before promoting the RC.

## Commands (all fail closed by default)

```text
node scripts/production-readiness/build-migration-manifest.mjs --write
node scripts/production-readiness/test-offline.mjs
node scripts/production-readiness/inspect-production-readonly.mjs
RUN_POST_RESTORE_INSPECT=YES node scripts/production-readiness/production-post-restore-inspect.mjs
node scripts/production-readiness/reconcile-migrations.mjs --manifest ... --remote-history ... --remote-schema ... --project-ref wbigqhtuzfmpnxservlf
node scripts/production-readiness/validate-backup-gate.mjs BACKUP_EVIDENCE.json
node scripts/production-readiness/production-preflight.mjs
```

The last four commands require operator-supplied evidence/secret presence and
do not create or mutate remote resources.

`production-post-restore-inspect.mjs` is the single post-restore read-only
orchestrator. It requires an explicit `RUN_POST_RESTORE_INSPECT=YES`, rejects
the staging ref, checks DNS, probes Supabase REST, checks Render health, and
then runs the database inspector. It never runs DDL, migrations, restore or
deploy.

The legacy-to-RC candidate is deliberately outside the migration chain at
`supabase/production-reconciliation/`. Its precheck and postcheck are
read-only SQL files; the bridge requires backup/preservation gates and
explicit authorization. It must never be copied into
`supabase/migrations/` automatically.
