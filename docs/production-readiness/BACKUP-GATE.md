# Production backup gate

This gate follows the Supabase backup boundary. The orchestrator never treats
the managed `auth` or `storage` schemas as ordinary PostgreSQL application
schemas and never restores them into a clean generic PostgreSQL server.

The encrypted package is written outside the repository and contains:

- application schema/data for `public` and `supabase_migrations`, produced by
  `supabase db dump` when available, or by the documented application-only
  `pg_dump` fallback;
- application roles without role passwords;
- a separate data-only `auth-recovery.dump` for `auth.users` and
  `auth.identities`, plus a non-secret Auth count/identity baseline. The Auth
  dump is a managed-recovery artifact and may only be used against a
  Supabase-compatible recovery target; it does not include Auth control tables,
  schema history, DDL, roles, or passwords outside the encrypted package;
- Storage bucket/object metadata and every binary object from `chat-media` and
  `recordings`, each with SHA-256;
- non-secret evidence and the read-only production precheck.

The evidence validator requires:

```text
managedSchemasExcludedFromApplicationDump=true
genericManagedRestoreAttempted=false
authRecoveryMode=SUPABASE_MANAGED_RECOVERY_ARTIFACT
restoreRehearsal=SUPABASE_LOCAL_STACK_PASS
```

The restore rehearsal therefore uses Supabase local stack only. It starts the
local Postgres and GoTrue services and excludes unrelated UI, proxy,
realtime, storage, logging, and analytics containers; Storage is validated
separately from its metadata and binary manifests. If the Supabase CLI or
Docker is unavailable, the orchestrator fails closed after the portable
application-dump inspection; it does not silently fall back to raw
`pg_restore` against PostgreSQL.

When a global CLI is not installed, the runner uses the pinned
`supabase@2.120.0` package through `npx`. Auth recovery is exported and applied
data-only for the supported user/identity tables into the Supabase-managed
local Auth schema; it never recreates `auth` or `storage` as generic PostgreSQL
objects or imports Auth control tables.

No secret, URL, password, Auth hash, user PII, or object content is written to
`evidence.json`, Git, or logs. The encrypted payload may contain the recovery
artifacts and remains outside the repository.

## Current status

The preparation branch contains the audited orchestrator and validator. A
real gate pass still requires operator-supplied production DB access and a
local Supabase stack capable of the rehearsal. No production mutation,
bridge, migration, DDL, Render change, or deployment is performed.

Use `-ValidateOnly` for local tool checks. The normal entrypoint prompts for
the production connection and encryption passphrase without printing them.
