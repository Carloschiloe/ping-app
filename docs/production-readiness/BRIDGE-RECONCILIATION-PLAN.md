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

The bridge does not alter Storage, Auth identities, or public-table RLS. The
11 RLS-disabled tables need a policy-by-policy authorization review because
the correct policy predicates cannot be inferred from the current evidence.

## Migration handling

The 33 staging migrations are not replayed. The model/diff package classifies
the current state and identifies follow-up work. Migration history must only
be reconciled after the final schema passes postcheck; history must never be
fabricated before that point.

## Required gates

`BACKUP_CREATED=YES`, `BACKUP_VERIFIED=YES`,
`AUTH_PRESERVATION_VERIFIED=YES`, and `STORAGE_PRESERVATION_VERIFIED=YES`
are mandatory before bridge execution. The bridge is not production-ready
for authorization until RLS/grants/functions and the complete schema snapshot
are reviewed.
