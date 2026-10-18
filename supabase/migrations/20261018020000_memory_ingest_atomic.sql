-- Phase 3G — atomic Memory ingestion boundary.
--
-- The service validates/extracts the candidate, resolves identity and applies
-- policy. This RPC owns the persistence transaction: deduplication, evidence
-- merge, insertion, and supersession all commit or roll back together.
create or replace function public.ingest_memory_record_atomic(
    p_memory_record jsonb,
    p_evidence_refs jsonb
)
returns table(
    outcome text,
    memory_id uuid,
    superseded_id uuid,
    status text
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
    v_owner_user_id uuid;
    v_content_hash text;
    v_predicate text;
    v_object_value text;
    v_subject_person_id uuid;
    v_subject_contact_id uuid;
    v_subject_unresolved_hint text;
    v_observed_at timestamptz;
    v_requested_status text;
    v_status text;
    v_existing_id uuid;
    v_existing_status text;
    v_active_id uuid;
    v_active_object_value text;
    v_active_observed_at timestamptz;
    v_supersedes_id uuid;
    v_superseded_by uuid;
    v_superseded_at timestamptz;
    v_memory_id uuid;
    v_evidence_cache jsonb;
begin
    if p_memory_record is null
       or jsonb_typeof(p_memory_record) <> 'object'
       or p_evidence_refs is null
       or jsonb_typeof(p_evidence_refs) <> 'array'
       or jsonb_array_length(p_evidence_refs) = 0 then
        raise exception 'Memory record and non-empty evidence are required'
            using errcode = '22023';
    end if;

    v_owner_user_id := nullif(p_memory_record->>'owner_user_id', '')::uuid;
    v_content_hash := nullif(p_memory_record->>'content_hash', '');
    v_predicate := nullif(p_memory_record->>'predicate', '');
    v_object_value := nullif(p_memory_record->>'object_value', '');
    v_subject_person_id := nullif(p_memory_record->>'subject_person_id', '')::uuid;
    v_subject_contact_id := nullif(p_memory_record->>'subject_contact_id', '')::uuid;
    v_subject_unresolved_hint := nullif(p_memory_record->>'subject_unresolved_hint', '');
    v_observed_at := nullif(p_memory_record->>'observed_at', '')::timestamptz;
    v_requested_status := coalesce(nullif(p_memory_record->>'status', ''), 'candidate');

    if v_owner_user_id is null
       or v_content_hash is null
       or v_predicate is null
       or v_object_value is null
       or v_observed_at is null then
        raise exception 'Memory record core fields are required'
            using errcode = '22023';
    end if;

    if v_requested_status not in ('candidate', 'active') then
        raise exception 'Memory ingestion accepts candidate or active status only'
            using errcode = '22023';
    end if;

    -- Serialize duplicate ingestion for the same owner/content hash. This
    -- removes the read-then-insert race from the service layer.
    select mr.id, mr.status
      into v_existing_id, v_existing_status
      from public.memory_records mr
     where mr.owner_user_id = v_owner_user_id
       and mr.content_hash = v_content_hash
       and mr.status <> 'deleted'
     for update;

    if found then
        insert into public.memory_record_evidence (
            memory_record_id, source_type, source_id,
            message_id, conversation_id, occurred_at
        )
        select
            v_existing_id, e.source_type, e.source_id,
            e.message_id, e.conversation_id, e.occurred_at
        from jsonb_to_recordset(p_evidence_refs) as e(
            source_type text,
            source_id uuid,
            message_id uuid,
            conversation_id uuid,
            occurred_at timestamptz
        )
        on conflict (memory_record_id, source_type, source_id) do nothing;

        select coalesce(
            jsonb_agg(
                jsonb_build_object(
                    'sourceType', e.source_type,
                    'sourceId', e.source_id,
                    'messageId', e.message_id,
                    'conversationId', e.conversation_id,
                    'timestamp', e.occurred_at
                ) order by e.source_type, e.source_id
            ),
            '[]'::jsonb
        )
          into v_evidence_cache
          from public.memory_record_evidence e
         where e.memory_record_id = v_existing_id;

        update public.memory_records
           set evidence_refs = v_evidence_cache
         where id = v_existing_id;

        return query select 'duplicate', v_existing_id, null::uuid, v_existing_status;
        return;
    end if;

    v_status := v_requested_status;

    -- Candidate records do not participate in semantic supersession. Active
    -- records do, and the incumbent is locked before the new row is inserted.
    if v_requested_status = 'active' then
        select mr.id, mr.object_value, mr.observed_at
          into v_active_id, v_active_object_value, v_active_observed_at
          from public.memory_records mr
         where mr.owner_user_id = v_owner_user_id
           and mr.status = 'active'
           and mr.predicate = v_predicate
           and (
               (v_subject_person_id is not null and mr.subject_person_id = v_subject_person_id)
               or (v_subject_contact_id is not null and mr.subject_contact_id = v_subject_contact_id)
               or (
                   v_subject_person_id is null
                   and v_subject_contact_id is null
                   and v_subject_unresolved_hint is not null
                   and mr.subject_person_id is null
                   and mr.subject_contact_id is null
                   and mr.subject_unresolved_hint = v_subject_unresolved_hint
               )
               or (
                   v_subject_person_id is null
                   and v_subject_contact_id is null
                   and v_subject_unresolved_hint is null
                   and mr.subject_person_id is null
                   and mr.subject_contact_id is null
                   and mr.subject_unresolved_hint is null
               )
           )
         order by mr.observed_at desc
         limit 1
         for update;

        if found
           and lower(btrim(v_active_object_value)) <> lower(btrim(v_object_value)) then
            if v_observed_at >= v_active_observed_at then
                v_supersedes_id := v_active_id;
            else
                v_status := 'superseded';
                v_superseded_by := v_active_id;
                v_superseded_at := v_active_observed_at;
            end if;
        end if;
    end if;

    insert into public.memory_records (
        owner_user_id, memory_type,
        subject_person_id, subject_contact_id, subject_unresolved_hint,
        predicate, object_value, canonical_text,
        source_type, source_id, conversation_id,
        evidence_refs, observed_at, valid_from, valid_until,
        status, superseded_by, superseded_at,
        confidence, sensitivity, visibility_scope,
        extraction_method, model_provider, model_version, content_hash
    ) values (
        v_owner_user_id,
        p_memory_record->>'memory_type',
        v_subject_person_id,
        v_subject_contact_id,
        v_subject_unresolved_hint,
        v_predicate,
        v_object_value,
        p_memory_record->>'canonical_text',
        p_memory_record->>'source_type',
        nullif(p_memory_record->>'source_id', '')::uuid,
        nullif(p_memory_record->>'conversation_id', '')::uuid,
        p_evidence_refs,
        v_observed_at,
        nullif(p_memory_record->>'valid_from', '')::timestamptz,
        nullif(p_memory_record->>'valid_until', '')::timestamptz,
        v_status,
        v_superseded_by,
        v_superseded_at,
        coalesce((p_memory_record->>'confidence')::real, 1.0),
        coalesce(p_memory_record->>'sensitivity', 'normal'),
        coalesce(p_memory_record->>'visibility_scope', 'private'),
        p_memory_record->>'extraction_method',
        nullif(p_memory_record->>'model_provider', ''),
        nullif(p_memory_record->>'model_version', ''),
        v_content_hash
    )
    returning id into v_memory_id;

    insert into public.memory_record_evidence (
        memory_record_id, source_type, source_id,
        message_id, conversation_id, occurred_at
    )
    select
        v_memory_id, e.source_type, e.source_id,
        e.message_id, e.conversation_id, e.occurred_at
    from jsonb_to_recordset(p_evidence_refs) as e(
        source_type text,
        source_id uuid,
        message_id uuid,
        conversation_id uuid,
        occurred_at timestamptz
    )
    on conflict (memory_record_id, source_type, source_id) do nothing;

    select coalesce(
        jsonb_agg(
            jsonb_build_object(
                'sourceType', e.source_type,
                'sourceId', e.source_id,
                'messageId', e.message_id,
                'conversationId', e.conversation_id,
                'timestamp', e.occurred_at
            ) order by e.source_type, e.source_id
        ),
        '[]'::jsonb
    )
      into v_evidence_cache
      from public.memory_record_evidence e
     where e.memory_record_id = v_memory_id;

    update public.memory_records
       set evidence_refs = v_evidence_cache
     where id = v_memory_id;

    if v_supersedes_id is not null then
        update public.memory_records
           set status = 'superseded',
               superseded_by = v_memory_id,
               superseded_at = v_observed_at
         where id = v_supersedes_id;
    end if;

    return query
        select case when v_supersedes_id is not null then 'superseded' else 'inserted' end,
               v_memory_id,
               v_supersedes_id,
               v_status;
end;
$$;

revoke all on function public.ingest_memory_record_atomic(jsonb, jsonb)
    from public, anon, authenticated;
grant execute on function public.ingest_memory_record_atomic(jsonb, jsonb)
    to service_role;

comment on function public.ingest_memory_record_atomic(jsonb, jsonb) is
    'Atomically deduplicates, merges evidence, inserts Memory, and supersedes the prior active fact.';
