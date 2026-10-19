-- Atomic Memory ingestion boundary.
--
-- The application validates and plans the memory first. These RPCs make the
-- final row/evidence/cache/supersession writes one PostgreSQL transaction so
-- a process failure cannot leave a promoted memory without normalized
-- evidence or an out-of-date evidence_refs projection.

create or replace function public.append_memory_evidence_atomic(
    p_memory_record_id uuid,
    p_evidence_rows jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    evidence_cache jsonb;
begin
    if jsonb_typeof(p_evidence_rows) <> 'array' or jsonb_array_length(p_evidence_rows) = 0 then
        raise exception 'memory evidence must be a non-empty array' using errcode = '22023';
    end if;

    insert into public.memory_record_evidence (
        memory_record_id, source_type, source_id, message_id, conversation_id, occurred_at
    )
    select
        p_memory_record_id,
        item->>'sourceType',
        (item->>'sourceId')::uuid,
        nullif(item->>'messageId', '')::uuid,
        nullif(item->>'conversationId', '')::uuid,
        nullif(item->>'timestamp', '')::timestamptz
    from jsonb_array_elements(p_evidence_rows) as evidence(item)
    on conflict (memory_record_id, source_type, source_id) do nothing;

    select coalesce(
        jsonb_agg(
            jsonb_build_object(
                'sourceType', source_type,
                'sourceId', source_id,
                'messageId', message_id,
                'conversationId', conversation_id,
                'timestamp', occurred_at
            ) order by occurred_at nulls last, source_type, source_id
        ),
        '[]'::jsonb
    )
    into evidence_cache
    from public.memory_record_evidence
    where memory_record_id = p_memory_record_id;

    update public.memory_records
    set evidence_refs = evidence_cache
    where id = p_memory_record_id;

    if not found then
        raise exception 'memory record % not found', p_memory_record_id using errcode = '23503';
    end if;

    return evidence_cache;
end;
$$;

create or replace function public.insert_memory_record_with_evidence_atomic(
    p_memory_record jsonb,
    p_evidence_rows jsonb,
    p_supersedes_id uuid default null
)
returns table(memory_id uuid)
language plpgsql
security definer
set search_path = public
as $$
declare
    new_memory_id uuid;
begin
    if jsonb_typeof(p_evidence_rows) <> 'array' or jsonb_array_length(p_evidence_rows) = 0 then
        raise exception 'memory evidence must be a non-empty array' using errcode = '22023';
    end if;

    insert into public.memory_records (
        owner_user_id, memory_type, subject_person_id, subject_contact_id,
        subject_unresolved_hint, predicate, object_value, canonical_text,
        source_type, source_id, conversation_id, evidence_refs, observed_at,
        valid_from, valid_until, status, superseded_by, superseded_at,
        confidence, sensitivity, visibility_scope, extraction_method,
        model_provider, model_version, content_hash
    )
    values (
        (p_memory_record->>'owner_user_id')::uuid,
        p_memory_record->>'memory_type',
        nullif(p_memory_record->>'subject_person_id', '')::uuid,
        nullif(p_memory_record->>'subject_contact_id', '')::uuid,
        p_memory_record->>'subject_unresolved_hint',
        p_memory_record->>'predicate',
        p_memory_record->>'object_value',
        p_memory_record->>'canonical_text',
        p_memory_record->>'source_type',
        nullif(p_memory_record->>'source_id', '')::uuid,
        nullif(p_memory_record->>'conversation_id', '')::uuid,
        p_evidence_rows,
        (p_memory_record->>'observed_at')::timestamptz,
        nullif(p_memory_record->>'valid_from', '')::timestamptz,
        nullif(p_memory_record->>'valid_until', '')::timestamptz,
        p_memory_record->>'status',
        nullif(p_memory_record->>'superseded_by', '')::uuid,
        nullif(p_memory_record->>'superseded_at', '')::timestamptz,
        (p_memory_record->>'confidence')::real,
        p_memory_record->>'sensitivity',
        p_memory_record->>'visibility_scope',
        p_memory_record->>'extraction_method',
        nullif(p_memory_record->>'model_provider', ''),
        nullif(p_memory_record->>'model_version', ''),
        p_memory_record->>'content_hash'
    )
    returning id into new_memory_id;

    perform public.append_memory_evidence_atomic(new_memory_id, p_evidence_rows);

    if p_supersedes_id is not null then
        update public.memory_records
        set status = 'superseded',
            superseded_by = new_memory_id,
            superseded_at = (p_memory_record->>'observed_at')::timestamptz
        where id = p_supersedes_id;
    end if;

    return query select new_memory_id;
end;
$$;

revoke all on function public.append_memory_evidence_atomic(uuid, jsonb) from public, anon, authenticated;
revoke all on function public.insert_memory_record_with_evidence_atomic(jsonb, jsonb, uuid) from public, anon, authenticated;
grant execute on function public.append_memory_evidence_atomic(uuid, jsonb) to service_role;
grant execute on function public.insert_memory_record_with_evidence_atomic(jsonb, jsonb, uuid) to service_role;

comment on function public.append_memory_evidence_atomic(uuid, jsonb) is
    'Canonical transactional Memory evidence append and cache projection; service_role only.';
comment on function public.insert_memory_record_with_evidence_atomic(jsonb, jsonb, uuid) is
    'Canonical transactional Memory row/evidence/supersession write; service_role only.';
