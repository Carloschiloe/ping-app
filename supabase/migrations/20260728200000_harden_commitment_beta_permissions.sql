-- Ping beta: close default table grants and make the SECURITY DEFINER
-- proposal boundary validate the same resource relationships as the backend.
-- Additive security hardening; no application data is changed or removed.

revoke all on table public.commitment_proposals
    from anon, authenticated;
revoke all on table public.commitment_proposal_events
    from anon, authenticated;
revoke all on table public.commitment_audit_records
    from anon, authenticated;

grant select on table public.commitment_proposals
    to authenticated;
grant select on table public.commitment_proposal_events
    to authenticated;
grant select on table public.commitment_audit_records
    to authenticated;

grant all on table public.commitment_proposals
    to service_role;
grant all on table public.commitment_proposal_events
    to service_role;
grant all on table public.commitment_audit_records
    to service_role;

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
    v_responsible_user_id uuid :=
        nullif(p_proposal->>'proposed_responsible_user_id', '')::uuid;
    v_contact_id uuid :=
        nullif(p_proposal->>'counterparty_contact_id', '')::uuid;
    v_conversation_id uuid :=
        nullif(p_proposal->>'conversation_id', '')::uuid;
    v_source_message_id uuid :=
        nullif(p_proposal->>'source_message_id', '')::uuid;
begin
    if not exists (
        select 1 from public.profiles where id = p_actor_user_id
    ) then
        raise exception 'Proposal actor does not exist' using errcode = '42501';
    end if;

    if nullif(btrim(p_proposal->>'title'), '') is null then
        raise exception 'Proposal title is required' using errcode = '23514';
    end if;

    if v_responsible_user_id is not null and v_contact_id is not null then
        raise exception 'Proposal cannot contain two responsible parties'
            using errcode = '23514';
    end if;

    if v_conversation_id is not null
       and not public.is_conversation_participant(
           v_conversation_id,
           p_actor_user_id
       ) then
        raise exception 'Actor is not a conversation participant'
            using errcode = '42501';
    end if;

    if v_source_message_id is not null and (
        v_conversation_id is null
        or not exists (
            select 1
              from public.messages m
             where m.id = v_source_message_id
               and m.conversation_id = v_conversation_id
        )
    ) then
        raise exception 'Source message does not belong to the conversation'
            using errcode = '42501';
    end if;

    if v_responsible_user_id is not null
       and v_responsible_user_id <> p_actor_user_id
       and (
           v_conversation_id is null
           or not public.is_conversation_participant(
               v_conversation_id,
               v_responsible_user_id
           )
       ) then
        raise exception 'Responsible user is outside the authorized context'
            using errcode = '42501';
    end if;

    if v_contact_id is not null
       and not exists (
           select 1
             from public.contacts c
            where c.id = v_contact_id
              and c.owner_user_id = p_actor_user_id
       ) then
        raise exception 'Contact does not belong to the proposal actor'
            using errcode = '42501';
    end if;

    insert into public.commitment_proposals (
        proposed_by_user_id, proposed_responsible_user_id,
        counterparty_contact_id, conversation_id, source_message_id,
        source_kind, title, description, due_at, type, priority,
        expected_result, status
    ) values (
        p_actor_user_id,
        v_responsible_user_id,
        v_contact_id,
        v_conversation_id,
        v_source_message_id,
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

revoke all on function public.create_commitment_proposal_with_evidence(uuid, jsonb)
    from public, anon, authenticated;
grant execute on function public.create_commitment_proposal_with_evidence(uuid, jsonb)
    to service_role;
