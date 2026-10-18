-- Ping M-2: memory truth is backend-owned.
--
-- The original canonical memory migration intentionally documented
-- memory.service.ts as the write authority but left authenticated INSERT,
-- UPDATE and DELETE policies in place. Remove that bypass while preserving
-- owner-scoped reads. Service role writes remain available to the backend.

drop policy if exists memory_records_owner_insert on public.memory_records;
drop policy if exists memory_records_owner_update on public.memory_records;
drop policy if exists memory_records_owner_delete on public.memory_records;

revoke insert, update, delete on table public.memory_records
    from anon, authenticated;

revoke all on table public.memory_record_evidence
    from anon, authenticated;

grant select on table public.memory_records to authenticated;
grant select on table public.memory_record_evidence to authenticated;

comment on table public.memory_records is
    'Canonical Ping memory. Reads are owner-scoped; all writes go through memory.service.ts with service_role.';
