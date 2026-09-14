-- PING — ARCHIVED COMMITMENT TOCTOU GAP FIX.
--
-- Invariant: archived_at != null -> not actionable by any commitment
-- lifecycle write, at the canonical write boundary itself -- never only at
-- Agent retrieval time (retrieval already excludes archived_at via
-- getCommitments/retrieveCommitments, but an actor can resolve a live
-- target, have it archived by any path in the meantime, then have the
-- executor's own TOCTOU re-fetch and this RPC's row lock run afterward).
-- Neither apply_commitment_transition_with_evidence (resolve/cancel/
-- reopen/reject/reassign/counter_propose/action_complete/accept) nor
-- edit_commitment_with_evidence (direct field edit, including the
-- self-owned reschedule due_at write) previously checked archived_at at
-- all -- confirmed by reading both function bodies: each only checks
-- p_expected_status/status against the `status` column, a column archiving
-- never touches (archive_commitment_with_evidence writes ONLY archived_at,
-- confirmed by its own header comment). An archived commitment can
-- therefore retain any live `status` (e.g. 'accepted') and pass every
-- existing guard.
--
-- Fix: both RPCs now raise a domain error (errcode 'P0001', the SAME
-- convention already used for "Commitment is already archived" /
-- "Commitment is not archived" in the archive/restore RPCs) when the
-- row is already archived, checked immediately after the `for update` row
-- lock (so it is race-safe against a concurrent archive) and before any
-- other business check. This is the single canonical write boundary for
-- both paths -- no duplicated guard logic, no reliance on retrieval-time
-- filtering alone. Every other line below is byte-identical to the
-- previously deployed function body (re-read directly from
-- 20260728183000_atomic_commitment_evidence.sql /
-- 20260828160000_commitment_core_canonical_writes.sql before writing this
-- migration) -- only the two new `if v_before.archived_at is not null`
-- blocks are additions.

create or replace function public.apply_commitment_transition_with_evidence(
    p_commitment_id uuid,
    p_actor_user_id uuid,
    p_expected_status text,
    p_patch jsonb,
    p_event_type text,
    p_event_payload jsonb default '{}'::jsonb
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
    if exists (
        select 1 from jsonb_object_keys(p_patch) as k
        where k not in (
            'status', 'due_at', 'proposed_due_at', 'assigned_to_user_id',
            'counterparty_contact_id', 'waiting_on_user_id',
            'waiting_on_contact_id', 'rejection_reason', 'resolved_at',
            'resolution_result', 'action_completed_at', 'follow_up_at',
            'next_action'
        )
    ) then
        raise exception 'Transition contains unsupported fields' using errcode = '22023';
    end if;

    select * into v_before
      from public.commitments
     where id = p_commitment_id
     for update;

    if not found then
        raise exception 'Commitment not found' using errcode = 'P0002';
    end if;
    if v_before.archived_at is not null then
        raise exception 'Commitment is archived' using errcode = 'P0001';
    end if;
    if v_before.owner_user_id <> p_actor_user_id
       and v_before.assigned_to_user_id is distinct from p_actor_user_id then
        raise exception 'Actor is not authorized for this commitment' using errcode = '42501';
    end if;
    if v_before.status <> p_expected_status then
        raise exception 'Commitment changed before this action could be confirmed'
            using errcode = '40001';
    end if;

    update public.commitments set
        status = case when p_patch ? 'status' then p_patch->>'status' else status end,
        due_at = case when p_patch ? 'due_at' then (p_patch->>'due_at')::timestamptz else due_at end,
        proposed_due_at = case when p_patch ? 'proposed_due_at' then (p_patch->>'proposed_due_at')::timestamptz else proposed_due_at end,
        assigned_to_user_id = case when p_patch ? 'assigned_to_user_id' then (p_patch->>'assigned_to_user_id')::uuid else assigned_to_user_id end,
        counterparty_contact_id = case when p_patch ? 'counterparty_contact_id' then (p_patch->>'counterparty_contact_id')::uuid else counterparty_contact_id end,
        waiting_on_user_id = case when p_patch ? 'waiting_on_user_id' then (p_patch->>'waiting_on_user_id')::uuid else waiting_on_user_id end,
        waiting_on_contact_id = case when p_patch ? 'waiting_on_contact_id' then (p_patch->>'waiting_on_contact_id')::uuid else waiting_on_contact_id end,
        rejection_reason = case when p_patch ? 'rejection_reason' then p_patch->>'rejection_reason' else rejection_reason end,
        resolved_at = case when p_patch ? 'resolved_at' then (p_patch->>'resolved_at')::timestamptz else resolved_at end,
        resolution_result = case when p_patch ? 'resolution_result' then p_patch->>'resolution_result' else resolution_result end,
        action_completed_at = case when p_patch ? 'action_completed_at' then (p_patch->>'action_completed_at')::timestamptz else action_completed_at end,
        follow_up_at = case when p_patch ? 'follow_up_at' then (p_patch->>'follow_up_at')::timestamptz else follow_up_at end,
        next_action = case when p_patch ? 'next_action' then p_patch->>'next_action' else next_action end,
        updated_at = now()
    where id = p_commitment_id
    returning * into v_after;

    insert into public.commitment_events (
        commitment_id, actor_user_id, event_type,
        previous_status, new_status, payload
    ) values (
        p_commitment_id, p_actor_user_id, p_event_type,
        v_before.status, v_after.status, coalesce(p_event_payload, '{}'::jsonb)
    );

    insert into public.commitment_audit_records (
        commitment_id, actor_user_id, evidence_kind, action,
        previous_state, resulting_state, payload
    ) values (
        p_commitment_id, p_actor_user_id, 'confirmed', p_event_type,
        v_before.status, v_after.status,
        jsonb_build_object('event_type', p_event_type)
    );

    return v_after;
end;
$$;

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
    if v_before.archived_at is not null then
        raise exception 'Commitment is archived' using errcode = 'P0001';
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
