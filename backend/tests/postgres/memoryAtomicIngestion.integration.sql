\set ON_ERROR_STOP on

begin;

insert into auth.users (id, email)
values
    ('a5300000-0000-4000-8000-000000000201', 'memory-ingest-owner@example.invalid'),
    ('a5300000-0000-4000-8000-000000000202', 'memory-ingest-other@example.invalid');

set local role service_role;

select * from public.ingest_memory_record_atomic(
    jsonb_build_object(
        'owner_user_id', 'a5300000-0000-4000-8000-000000000201',
        'memory_type', 'semantic',
        'subject_person_id', null,
        'subject_contact_id', null,
        'subject_unresolved_hint', null,
        'predicate', 'prefers',
        'object_value', 'coffee',
        'canonical_text', 'Owner prefers coffee',
        'source_type', 'manual',
        'source_id', 'a5300000-0000-4000-8000-000000000211',
        'conversation_id', null,
        'observed_at', '2026-10-01T00:00:00Z',
        'valid_from', null,
        'valid_until', null,
        'status', 'active',
        'confidence', 1.0,
        'sensitivity', 'normal',
        'visibility_scope', 'private',
        'extraction_method', 'manual',
        'model_provider', null,
        'model_version', null,
        'content_hash', 'memory-ingest-owner-prefers-coffee'
    ),
    '[{"sourceType":"manual","sourceId":"a5300000-0000-4000-8000-000000000211","timestamp":"2026-10-01T00:00:00Z"}]'::jsonb
);

select 1 / case when count(*) = 1 then 1 else 0 end
from public.memory_records
where owner_user_id = 'a5300000-0000-4000-8000-000000000201'
  and content_hash = 'memory-ingest-owner-prefers-coffee'
  and status = 'active'
  and jsonb_array_length(evidence_refs) = 1;

select * from public.ingest_memory_record_atomic(
    jsonb_build_object(
        'owner_user_id', 'a5300000-0000-4000-8000-000000000201',
        'memory_type', 'semantic',
        'predicate', 'prefers',
        'object_value', 'coffee',
        'canonical_text', 'Owner prefers coffee',
        'source_type', 'manual',
        'source_id', 'a5300000-0000-4000-8000-000000000212',
        'observed_at', '2026-10-02T00:00:00Z',
        'status', 'active',
        'confidence', 1.0,
        'sensitivity', 'normal',
        'visibility_scope', 'private',
        'extraction_method', 'manual',
        'content_hash', 'memory-ingest-owner-prefers-coffee'
    ),
    '[{"sourceType":"manual","sourceId":"a5300000-0000-4000-8000-000000000212","timestamp":"2026-10-02T00:00:00Z"}]'::jsonb
);

select 1 / case when count(*) = 1 then 1 else 0 end
from public.memory_records
where owner_user_id = 'a5300000-0000-4000-8000-000000000201'
  and content_hash = 'memory-ingest-owner-prefers-coffee'
  and jsonb_array_length(evidence_refs) = 2;

select * from public.ingest_memory_record_atomic(
    jsonb_build_object(
        'owner_user_id', 'a5300000-0000-4000-8000-000000000201',
        'memory_type', 'semantic',
        'subject_person_id', null,
        'subject_contact_id', null,
        'subject_unresolved_hint', null,
        'predicate', 'prefers',
        'object_value', 'tea',
        'canonical_text', 'Owner prefers tea',
        'source_type', 'manual',
        'source_id', 'a5300000-0000-4000-8000-000000000213',
        'conversation_id', null,
        'observed_at', '2026-10-03T00:00:00Z',
        'status', 'active',
        'confidence', 1.0,
        'sensitivity', 'normal',
        'visibility_scope', 'private',
        'extraction_method', 'manual',
        'content_hash', 'memory-ingest-owner-prefers-tea'
    ),
    '[{"sourceType":"manual","sourceId":"a5300000-0000-4000-8000-000000000213","timestamp":"2026-10-03T00:00:00Z"}]'::jsonb
);

select 1 / case when (
    select status from public.memory_records
    where owner_user_id = 'a5300000-0000-4000-8000-000000000201'
      and content_hash = 'memory-ingest-owner-prefers-coffee'
) = 'superseded' then 1 else 0 end;

select 1 / case when count(*) = 1 then 1 else 0 end
from public.memory_records
where owner_user_id = 'a5300000-0000-4000-8000-000000000201'
  and content_hash = 'memory-ingest-owner-prefers-tea'
  and status = 'active'
  and jsonb_array_length(evidence_refs) = 1;

select 1 / case when count(*) = 0 then 1 else 0 end
from public.memory_records
where owner_user_id = 'a5300000-0000-4000-8000-000000000202';

reset role;

do $$
begin
    if has_function_privilege('anon', 'public.ingest_memory_record_atomic(jsonb,jsonb)', 'execute')
       or has_function_privilege('authenticated', 'public.ingest_memory_record_atomic(jsonb,jsonb)', 'execute') then
        raise exception 'memory ingestion RPC is exposed to client roles';
    end if;
    if not has_function_privilege('service_role', 'public.ingest_memory_record_atomic(jsonb,jsonb)', 'execute') then
        raise exception 'service_role cannot execute memory ingestion RPC';
    end if;
end;
$$;

rollback;

select 'Memory atomic ingestion integration passed' as result;
