-- Ping C-1: canonical Commitment write boundary.
--
-- Field edits are deliberately separate from lifecycle transitions. The
-- existing apply_commitment_transition_with_evidence RPC remains the only
-- database operation allowed to change lifecycle state. This RPC only edits
-- descriptive/scheduling fields and records the business event and audit
-- evidence in the same transaction.

alter table public.commitment_events
    drop constraint if exists commitment_events_type_check;
alter table public.commitment_events
    add constraint commitment_events_type_check
        check (event_type in (
            'created', 'edited', 'archived', 'accepted', 'rejected', 'counter_proposed',
            'rescheduled', 'action_completed', 'resolved', 'reopened',
            'cancelled', 'follow_up_scheduled', 'reassigned'
        ));

create or replace function public.edit_commitment_with_evidence(
    p_commitment_id uuid,
    p_actor_user_id uuid,
    p_patch jsonb
)
returns public.commitments
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
    v_before public.commitments;
    v_after public.commitments;
    v_changed_fields text[];
    v_evidence jsonb;
begin
    if p_patch is null
       or jsonb_typeof(p_patch) <> 'object'
       or p_patch = '{}'::jsonb then
        raise exception 'Commitment edit cannot be empty' using errcode = '22023';
    end if;

    if exists (
        select 1 from jsonb_object_keys(p_patch) as k
        where k not in (
            'title', 'description', 'due_at', 'type', 'priority',
            'expected_result'
        )
    ) then
        raise exception 'Commitment edit contains lifecycle or unsupported fields'
            using errcode = '22023';
    end if;

    if p_patch ? 'title'
       and nullif(btrim(p_patch->>'title'), '') is null then
        raise exception 'Commitment title is required' using errcode = '23514';
    end if;

    select * into v_before
      from public.commitments
     where id = p_commitment_id
     for update;

    if not found then
        raise exception 'Commitment not found' using errcode = 'P0002';
    end if;
    if v_before.owner_user_id <> p_actor_user_id then
        raise exception 'Only the commitment owner can edit fields'
            using errcode = '42501';
    end if;

    update public.commitments set
        title = case
            when p_patch ? 'title' then p_patch->>'title'
            else title
        end,
        description = case
            when p_patch ? 'description' then p_patch->>'description'
            else description
        end,
        due_at = case
            when p_patch ? 'due_at' then (p_patch->>'due_at')::timestamptz
            else due_at
        end,
        type = case
            when p_patch ? 'type' then p_patch->>'type'
            else type
        end,
        priority = case
            when p_patch ? 'priority' then p_patch->>'priority'
            else priority
        end,
        expected_result = case
            when p_patch ? 'expected_result' then p_patch->>'expected_result'
            else expected_result
        end,
        updated_at = now()
    where id = p_commitment_id
    returning * into v_after;

    select coalesce(array_agg(key order by key), array[]::text[])
      into v_changed_fields
      from jsonb_object_keys(p_patch) as changed(key);

    -- Preserve only the values needed to understand a correction. The
    -- original Message and Proposal remain linked by message_id/proposal_id;
    -- they are never copied or rewritten here.
    v_evidence := jsonb_build_object(
        'changed_fields', to_jsonb(v_changed_fields),
        'before', jsonb_build_object(
            'title', v_before.title,
            'description', v_before.description,
            'due_at', v_before.due_at,
            'type', v_before.type,
            'priority', v_before.priority,
            'expected_result', v_before.expected_result
        ),
        'after', jsonb_build_object(
            'title', v_after.title,
            'description', v_after.description,
            'due_at', v_after.due_at,
            'type', v_after.type,
            'priority', v_after.priority,
            'expected_result', v_after.expected_result
        ),
        'proposal_id', v_after.proposal_id,
        'source_message_id', v_after.message_id
    );

    insert into public.commitment_events (
        commitment_id, actor_user_id, event_type,
        previous_status, new_status, payload
    ) values (
        p_commitment_id, p_actor_user_id, 'edited',
        v_before.status, v_after.status, v_evidence
    );

    insert into public.commitment_audit_records (
        commitment_id, proposal_id, actor_user_id, evidence_kind,
        action, previous_state, resulting_state, payload
    ) values (
        p_commitment_id, v_after.proposal_id, p_actor_user_id, 'confirmed',
        'commitment_edited', v_before.status, v_after.status, v_evidence
    );

    return v_after;
end;
$$;

revoke all on function public.edit_commitment_with_evidence(uuid, uuid, jsonb)
    from public, anon, authenticated;
grant execute on function public.edit_commitment_with_evidence(uuid, uuid, jsonb)
    to service_role;

comment on function public.edit_commitment_with_evidence(uuid, uuid, jsonb) is
    'Edits non-lifecycle Commitment fields and atomically records Event and Audit evidence.';

create or replace function public.archive_commitment_with_evidence(
    p_commitment_id uuid,
    p_actor_user_id uuid
)
returns public.commitments
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
    v_before public.commitments;
    v_after public.commitments;
begin
    select * into v_before
      from public.commitments
     where id = p_commitment_id
     for update;

    if not found then
        raise exception 'Commitment not found' using errcode = 'P0002';
    end if;
    if v_before.owner_user_id <> p_actor_user_id then
        raise exception 'Only the commitment owner can archive it'
            using errcode = '42501';
    end if;
    if v_before.archived_at is not null then
        raise exception 'Commitment is already archived' using errcode = 'P0001';
    end if;

    update public.commitments
       set archived_at = now(),
           updated_at = now()
     where id = p_commitment_id
     returning * into v_after;

    insert into public.commitment_events (
        commitment_id, actor_user_id, event_type,
        previous_status, new_status, payload
    ) values (
        p_commitment_id, p_actor_user_id, 'archived',
        v_before.status, v_after.status,
        jsonb_build_object(
            'proposal_id', v_after.proposal_id,
            'source_message_id', v_after.message_id,
            'archived_at', v_after.archived_at
        )
    );

    insert into public.commitment_audit_records (
        commitment_id, proposal_id, actor_user_id, evidence_kind,
        action, previous_state, resulting_state, payload
    ) values (
        p_commitment_id, v_after.proposal_id, p_actor_user_id, 'confirmed',
        'commitment_archived', v_before.status, v_after.status,
        jsonb_build_object('archived_at', v_after.archived_at)
    );

    return v_after;
end;
$$;

revoke all on function public.archive_commitment_with_evidence(uuid, uuid)
    from public, anon, authenticated;
grant execute on function public.archive_commitment_with_evidence(uuid, uuid)
    to service_role;

comment on function public.archive_commitment_with_evidence(uuid, uuid) is
    'Soft-archives a Commitment and atomically records Event and Audit evidence.';
