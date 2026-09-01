-- Ping C-2: prevent authenticated clients from bypassing Commitment Core.
--
-- Supabase's default grants expose new public tables to API roles. The V2
-- baseline also retained INSERT/UPDATE RLS policies from the pre-Core model.
-- Canonical Commitment writes now run only through backend-owned, guarded
-- SECURITY DEFINER RPCs, all executable exclusively by service_role.

revoke all privileges on table public.commitments
    from public, anon, authenticated;

grant select on table public.commitments
    to authenticated;

drop policy if exists commitments_insert_own on public.commitments;
drop policy if exists commitments_update_authorized on public.commitments;

comment on table public.commitments is
    'Canonical Commitment aggregate. Authenticated clients have read-only access; writes must use Ping Core through the backend.';
