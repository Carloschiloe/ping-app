\set ON_ERROR_STOP on

begin;

insert into auth.users (id, email) values
    ('a6100000-0000-4000-8000-000000000001', 'memory-owner@example.invalid');

select memory_id as first_memory_id
from public.insert_memory_record_with_evidence_atomic(
    jsonb_build_object(
        'owner_user_id', 'a6100000-0000-4000-8000-000000000001',
        'memory_type', 'semantic',
        'subject_person_id', 'a6100000-0000-4000-8000-000000000001',
        'subject_contact_id', null,
        'subject_unresolved_hint', null,
        'predicate', 'prefers',
        'object_value', 'tea',
        'canonical_text', 'La persona prefiere té.',
        'source_type', 'message',
        'source_id', 'a6100000-0000-4000-8000-000000000010',
        'conversation_id', null,
        'observed_at', '2026-10-18T12:00:00Z',
        'valid_from', null,
        'valid_until', null,
        'status', 'active',
        'superseded_by', null,
        'superseded_at', null,
        'confidence', 1.0,
        'sensitivity', 'normal',
        'visibility_scope', 'private',
        'extraction_method', 'deterministic',
        'model_provider', null,
        'model_version', null,
        'content_hash', repeat('a', 64)
    ),
    jsonb_build_array(jsonb_build_object(
        'sourceType', 'message',
        'sourceId', 'a6100000-0000-4000-8000-000000000010',
        'messageId', 'a6100000-0000-4000-8000-000000000010',
        'conversationId', null,
        'timestamp', '2026-10-18T12:00:00Z'
    )),
    null
)
\gset memory_
select set_config('memory.first_id', :'memory_first_memory_id', true);

select public.append_memory_evidence_atomic(
    :'memory_first_memory_id'::uuid,
    jsonb_build_array(jsonb_build_object(
        'sourceType', 'message',
        'sourceId', 'a6100000-0000-4000-8000-000000000011',
        'messageId', 'a6100000-0000-4000-8000-000000000011',
        'conversationId', null,
        'timestamp', '2026-10-18T13:00:00Z'
    ))
);

do $$
declare
    memory_row public.memory_records;
    evidence_count integer;
begin
    select * into memory_row from public.memory_records where id = current_setting('memory.first_id')::uuid;
    if memory_row.status <> 'active' or jsonb_array_length(memory_row.evidence_refs) <> 2 then
        raise exception 'atomic evidence/cache projection failed';
    end if;
    select count(*) into evidence_count
    from public.memory_record_evidence
    where memory_record_id = memory_row.id;
    if evidence_count <> 2 then
        raise exception 'normalized evidence append failed';
    end if;
end;
$$;

select memory_id as second_memory_id
from public.insert_memory_record_with_evidence_atomic(
    jsonb_build_object(
        'owner_user_id', 'a6100000-0000-4000-8000-000000000001',
        'memory_type', 'semantic',
        'subject_person_id', 'a6100000-0000-4000-8000-000000000001',
        'subject_contact_id', null,
        'subject_unresolved_hint', null,
        'predicate', 'prefers',
        'object_value', 'coffee',
        'canonical_text', 'La persona prefiere café.',
        'source_type', 'message',
        'source_id', 'a6100000-0000-4000-8000-000000000012',
        'conversation_id', null,
        'observed_at', '2026-10-19T12:00:00Z',
        'valid_from', null,
        'valid_until', null,
        'status', 'active',
        'superseded_by', null,
        'superseded_at', null,
        'confidence', 1.0,
        'sensitivity', 'normal',
        'visibility_scope', 'private',
        'extraction_method', 'deterministic',
        'model_provider', null,
        'model_version', null,
        'content_hash', repeat('b', 64)
    ),
    jsonb_build_array(jsonb_build_object(
        'sourceType', 'message',
        'sourceId', 'a6100000-0000-4000-8000-000000000012',
        'messageId', 'a6100000-0000-4000-8000-000000000012',
        'conversationId', null,
        'timestamp', '2026-10-19T12:00:00Z'
    )),
    :'memory_first_memory_id'::uuid
)
\gset memory_
select set_config('memory.second_id', :'memory_second_memory_id', true);

do $$
declare
    old_status text;
    new_evidence_count integer;
begin
    select status into old_status from public.memory_records where id = current_setting('memory.first_id')::uuid;
    select count(*) into new_evidence_count
    from public.memory_record_evidence
    where memory_record_id = current_setting('memory.second_id')::uuid;
    if old_status <> 'superseded' or new_evidence_count <> 1 then
        raise exception 'atomic supersession failed';
    end if;
end;
$$;

rollback;
