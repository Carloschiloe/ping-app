\set ON_ERROR_STOP on

begin;

insert into auth.users (id, email)
values
    ('a5300000-0000-4000-8000-000000000001', 'memory-owner@example.invalid'),
    ('a5300000-0000-4000-8000-000000000002', 'memory-outsider@example.invalid');

set local role service_role;

insert into public.memory_records (
    id, owner_user_id, memory_type, predicate, object_value, canonical_text,
    source_type, source_id, conversation_id, evidence_refs, observed_at, status,
    confidence, sensitivity, visibility_scope, extraction_method, content_hash
)
values (
    'a5300000-0000-4000-8000-000000000010',
    'a5300000-0000-4000-8000-000000000001',
    'semantic', 'prefers', 'coffee', 'The owner prefers coffee',
    'manual', 'a5300000-0000-4000-8000-000000000011', null,
    '[{"sourceType":"manual","sourceId":"a5300000-0000-4000-8000-000000000011"}]'::jsonb,
    now(), 'active', 1.0, 'normal', 'private', 'manual',
    'memory-rls-owner-coffee'
);

insert into public.memory_record_evidence (
    memory_record_id, source_type, source_id, occurred_at
)
values (
    'a5300000-0000-4000-8000-000000000010',
    'manual',
    'a5300000-0000-4000-8000-000000000011',
    now()
);

select 1 / case when exists (
    select 1
    from public.memory_records
    where id = 'a5300000-0000-4000-8000-000000000010'
      and search_tsv @@ websearch_to_tsquery('ping_text', 'coffee')
) then 1 else 0 end;

reset role;

do $$
begin
    if has_table_privilege('authenticated', 'public.memory_records', 'INSERT')
       or has_table_privilege('authenticated', 'public.memory_records', 'UPDATE')
       or has_table_privilege('authenticated', 'public.memory_records', 'DELETE') then
        raise exception 'authenticated has direct memory_records write privileges';
    end if;
    if has_table_privilege('authenticated', 'public.memory_record_evidence', 'INSERT')
       or has_table_privilege('authenticated', 'public.memory_record_evidence', 'UPDATE')
       or has_table_privilege('authenticated', 'public.memory_record_evidence', 'DELETE') then
        raise exception 'authenticated has direct memory evidence write privileges';
    end if;
end;
$$;

set local role authenticated;
select set_config('request.jwt.claim.sub', 'a5300000-0000-0000-0000-000000000001', true);
