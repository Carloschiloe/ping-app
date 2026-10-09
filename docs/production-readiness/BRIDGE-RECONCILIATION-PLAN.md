# Legacy production to RC bridge

## Current conclusion

`baseline_v2` must not run directly on the restored historical project. The
absence of `supabase_migrations.schema_migrations` is legacy provenance, not
proof that the schema is empty. Public tables currently have zero rows, but
four Auth users and 48 Storage objects must be preserved.

## Candidate scope

The candidate bridge is intentionally narrow and forward-only:

1. Require backup and preservation gates.
2. Require the confirmed 18-table inventory and preservation counts.
3. Reconcile missing `public.profiles` rows additively from `auth.users`,
   preserving Auth IDs.
4. Replace `public.handle_new_user` with the RC-compatible fixed
   `search_path` function and revoke public/anon/authenticated execution.
5. Create the signup trigger only if it is absent.
6. Fix the exact no-argument `update_updated_at_column` search path only when
   that function exists.

The bridge does not alter Storage or Auth identities. For the 11 legacy tables
whose current RLS is disabled, the bridge requires an explicit operator review
gate and then enables RLS with no guessed predicates while revoking direct
`anon`/`authenticated` table privileges. The RC backend uses `service_role`
for these reads/writes, so this is a deny-by-default compatibility boundary;
it does not invent client policies. Any future direct-client access must be
introduced with a separate reviewed policy migration.

## Migration handling

The 33 staging migrations are not replayed blindly. Every file now has one
explicit disposition in `MIGRATION-ACCOUNTING.md`: 3 proven blocked, 2
handled by the bridge, 27 safe-forward candidates gated by the live snapshot,
and 1 history-only no-op. Migration history is reconciled only after the
final schema passes postcheck; history is never fabricated before that point.

## Required gates

`BACKUP_CREATED=YES`, `BACKUP_VERIFIED=YES`,
`AUTH_PRESERVATION_VERIFIED=YES`, and `STORAGE_PRESERVATION_VERIFIED=YES`
are mandatory before bridge execution. The bridge is not production-ready
for authorization until RLS/grants/functions and the complete schema snapshot
are reviewed.
