-- Ping beta: operaciones relevantes de Commitment y su evidencia se confirman
-- en la misma transacción. No convierte intentos técnicos en eventos de negocio.

create table if not exists public.commitment_audit_records (
    id                  uuid primary key default gen_random_uuid(),
    commitment_id       uuid references public.commitments(id) on delete restrict,
    proposal_id         uuid references public.commitment_proposals(id) on delete restrict,
    actor_user_id       uuid references public.profiles(id) on delete set null,
    evidence_kind       text not null,
    action              text not null,
    previous_state      text,
    resulting_state     text,
    payload             jsonb not null default '{}'::jsonb,
    created_at          timestamptz not null default now(),
    constraint commitment_audit_resource_check
        check (commitment_id is not null or proposal_id is not null),
    constraint commitment_audit_kind_check
        check (evidence_kind in (
            'intent', 'attempt', 'accepted', 'rejected',
            'result_unknown', 'confirmed'
        ))
);

create index if not exists commitment_audit_commitment_idx
    on public.commitment_audit_records (commitment_id, created_at);
create index if not exists commitment_audit_proposal_idx
    on public.commitment_audit_records (proposal_id, created_at);

alter table public.commitment_audit_records enable row level security;

create policy commitment_audit_select_authorized
    on public.commitment_audit_records for select
    to authenticated
    using (
        (
            commitment_id is not null
            and exists (
                select 1 from public.commitments c
                where c.id = commitment_audit_records.commitment_id
                  and (
                    c.owner_user_id = auth.uid()
                    or c.assigned_to_user_id = auth.uid()
                    or (
                        c.conversation_id is not null
                        and public.is_conversation_participant(c.conversation_id, auth.uid())
                    )
                  )
            )
        )
        or (
            proposal_id is not null
            and exists (
                select 1 from public.commitment_proposals p
                where p.id = commitment_audit_records.proposal_id
                  and (
                    p.proposed_by_user_id = auth.uid()
                    or p.proposed_responsible_user_id = auth.uid()
                    or (
                        p.conversation_id is not null
                        and public.is_conversation_participant(p.conversation_id, auth.uid())
                    )
                  )
            )
        )
    );

create or replace function public.create_commitment_proposal_with_evidence(
    p_actor_user_id uuid,
    p_proposal jsonb
)
returns public.commitment_proposals
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
    v_proposal public.commitment_proposals;
begin
    if nullif(btrim(p_proposal->>'title'), '') is null then
        raise exception 'Proposal title is required' using errcode = '23514';
    end if;

    insert into public.commitment_proposals (
        proposed_by_user_id, proposed_responsible_user_id,
        counterparty_contact_id, conversation_id, source_message_id,
        source_kind, title, description, due_at, type, priority,
        expected_result, status
    ) values (
        p_actor_user_id,
        nullif(p_proposal->>'proposed_responsible_user_id', '')::uuid,
        nullif(p_proposal->>'counterparty_contact_id', '')::uuid,
        nullif(p_proposal->>'conversation_id', '')::uuid,
        nullif(p_proposal->>'source_message_id', '')::uuid,
        p_proposal->>'source_kind',
        p_proposal->>'title',
        p_proposal->>'description',
        nullif(p_proposal->>'due_at', '')::timestamptz,
        coalesce(p_proposal->>'type', 'task'),
        p_proposal->>'priority',
        p_proposal->>'expected_result',
        'pending'
    ) returning * into v_proposal;

    insert into public.commitment_proposal_events (
        proposal_id, actor_user_id, event_type, payload
    ) values (
        v_proposal.id, p_actor_user_id, 'proposed',
        jsonb_build_object(
            'source_kind', v_proposal.source_kind,
            'conversation_id', v_proposal.conversation_id,
            'source_message_id', v_proposal.source_message_id
        )
    );

    insert into public.commitment_audit_records (
        proposal_id, actor_user_id, evidence_kind, action,
        previous_state, resulting_state, payload
    ) values (
        v_proposal.id, p_actor_user_id, 'confirmed', 'proposal_created',
        null, 'pending',
        jsonb_build_object('source_kind', v_proposal.source_kind)
    );

    return v_proposal;
end;
$$;

create or replace function public.reject_commitment_proposal_with_evidence(
    p_proposal_id uuid,
    p_actor_user_id uuid,
    p_reason text default null
)
returns public.commitment_proposals
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
    v_proposal public.commitment_proposals;
begin
    select * into v_proposal
      from public.commitment_proposals
     where id = p_proposal_id
     for update;

    if not found then
        raise exception 'Proposal not found' using errcode = 'P0002';
    end if;
    if v_proposal.proposed_by_user_id <> p_actor_user_id then
        raise exception 'Only the proposal owner can reject it' using errcode = '42501';
    end if;
    if v_proposal.status <> 'pending' then
        raise exception 'Proposal is not pending' using errcode = 'P0001';
    end if;

    update public.commitment_proposals
       set status = 'rejected',
           decision_by_user_id = p_actor_user_id,
           decision_at = now(),
           rejection_reason = nullif(btrim(p_reason), ''),
           updated_at = now()
     where id = p_proposal_id
     returning * into v_proposal;

    insert into public.commitment_proposal_events (
        proposal_id, actor_user_id, event_type, payload
    ) values (
        p_proposal_id, p_actor_user_id, 'rejected',
        jsonb_build_object('reason', nullif(btrim(p_reason), ''))
    );

    insert into public.commitment_audit_records (
        proposal_id, actor_user_id, evidence_kind, action,
        previous_state, resulting_state, payload
    ) values (
        p_proposal_id, p_actor_user_id, 'confirmed', 'proposal_rejected',
        'pending', 'rejected', '{}'::jsonb
    );

    return v_proposal;
end;
$$;

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

revoke all on function public.create_commitment_proposal_with_evidence(uuid, jsonb) from public, anon, authenticated;
revoke all on function public.reject_commitment_proposal_with_evidence(uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.apply_commitment_transition_with_evidence(uuid, uuid, text, jsonb, text, jsonb) from public, anon, authenticated;
grant execute on function public.create_commitment_proposal_with_evidence(uuid, jsonb) to service_role;
grant execute on function public.reject_commitment_proposal_with_evidence(uuid, uuid, text) to service_role;
grant execute on function public.apply_commitment_transition_with_evidence(uuid, uuid, text, jsonb, text, jsonb) to service_role;
