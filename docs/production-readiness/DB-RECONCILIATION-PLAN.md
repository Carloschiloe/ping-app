# Historical production database reconciliation

## Before restore

The only safe next external action is for the owner to restore/reactivate the
existing Supabase project `wbigqhtuzfmpnxservlf`. Do not create a replacement
project and do not point production at staging.

## Read-only evidence after restore

Capture, outside the repository and without row contents:

- project ref and database endpoint host;
- database version and extension inventory;
- public table/column/type/index/constraint inventory;
- RLS enabled state and policy inventory;
- function/trigger/publication inventory;
- Storage bucket names and policy metadata;
- `supabase_migrations.schema_migrations` versions and checksums when present;
- aggregate row counts for protected domain tables.

The inspector in `scripts/production-readiness/inspect-production-readonly.mjs`
requires the production ref and a real database URL, begins a read-only
transaction, and refuses the staging project.

## Reconciliation rules

1. Match migration history to the RC manifest by timestamp and content hash.
2. Compare live objects to the expected object inventory, not just filenames.
3. Mark missing history as `UNKNOWN`, never as pending by assumption.
4. Mark same timestamp/different SQL as `DIVERGED` and stop.
5. Treat `baseline_v2` as a fresh-database baseline only; do not apply it to
   an existing historical schema without a separately reviewed transition.
6. Split approved forward changes into additive, policy/RLS, function/trigger,
   and data-backfill batches, each with an observable checkpoint.
7. Back up schema, data, and Storage outside Supabase before any DDL.

## Legacy preservation

The old production tree contains a legacy `schema.sql` and undocumented
historical objects. Preserve all existing tables/data until an object-level
comparison proves a forward-compatible mapping. No destructive cleanup is
part of this preparation branch.
