-- Ping beta: acuerdos compartidos para propuestas de Commitment.
-- Migración aditiva. No elimina datos, columnas ni funciones de compatibilidad.

alter table public.commitment_proposals
    add column if not exists agreement_version integer not null default 1,
    add column if not exists latest_counterproposal_by_user_id uuid
        references public.profiles(id) on delete set null,
    add column if not exists latest_counterproposal_due_at timestamptz;

alter table public.commitment_proposals
    drop constraint if exists commitment_proposals_agreement_version_check;
alter table public.commitment_proposals
    add constraint commitment_proposals_agreement_version_check
        check (agreement_version > 0);

create table if not exists public.commitment_proposal_responses (
    id                  uuid primary key default gen_random_uuid(),
    proposal_id         uuid not null
        references public.commitment_proposals(id) on delete restrict,
    participant_user_id uuid not null
        references public.profiles(id) on delete restrict,
    agreement_version   integer not null default 1,
    status              text not null default 'pending',
    proposed_due_at     timestamptz,
    response_note       text,
    responded_at        timestamptz,
    created_at          timestamptz not null default now(),
    updated_at          timestamptz not null default now(),
    constraint commitment_proposal_responses_unique
        unique (proposal_id, participant_user_id),
    constraint commitment_proposal_responses_status_check
        check (status in ('pending', 'approved', 'rejected', 'counter_proposed')),
    constraint commitment_proposal_responses_version_check
        check (agreement_version > 0),
    constraint commitment_proposal_responses_counter_due_check
        check (status <> 'counter_proposed' or proposed_due_at is not null)
);

create index if not exists commitment_proposal_responses_proposal_idx
    on public.commitment_proposal_responses (proposal_id, status);
create index if not exists commitment_proposal_responses_participant_idx
    on public.commitment_proposal_responses (participant_user_id, status, updated_at desc);

alter table public.commitment_proposal_responses enable row level security;

drop policy if exists commitment_proposal_responses_select_authorized
    on public.commitment_proposal_responses;
create policy commitment_proposal_responses_select_authorized
    on public.commitment_proposal_responses for select
    to authenticated
    using (
        exists (
            select 1
              from public.commitment_proposals p
             where p.id = commitment_proposal_responses.proposal_id
               and (
                    p.proposed_by_user_id = auth.uid()
                    or p.proposed_responsible_user_id = auth.uid()
                    or (
                        p.conversation_id is not null
                        and public.is_conversation_participant(
                            p.conversation_id,
                            auth.uid()
                        )
                    )
               )
        )
    );

revoke all on table public.commitment_proposal_responses
    from public, anon, authenticated;
grant select on table public.commitment_proposal_responses to authenticated;
grant all on table public.commitment_proposal_responses to service_role;

alter table public.commitment_proposal_events
    drop constraint if exists commitment_proposal_events_type_check;
alter table public.commitment_proposal_events
    add constraint commitment_proposal_events_type_check
        check (event_type in (
            'proposed',
            'confirmed',
            'rejected',
            'participant_approved',
            'participant_rejected',
            'schedule_counter_proposed'
        ));

create or replace function public.create_shared_commitment_proposal_with_responses(
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
    v_conversation_id uuid :=
        nullif(p_proposal->>'conversation_id', '')::uuid;
    v_participant_count integer;
begin
    if v_conversation_id is null then
        raise exception 'A shared proposal requires a conversation'
            using errcode = '23514';
    end if;

    if not public.is_conversation_participant(
        v_conversation_id,
        p_actor_user_id
    ) then
        raise exception 'Actor is not a conversation participant'
            using errcode = '42501';
    end if;

    select count(*)::integer
      into v_participant_count
      from public.conversation_participants cp
     where cp.conversation_id = v_conversation_id;

    if v_participant_count < 2 then
        raise exception 'A shared proposal requires at least two participants'
            using errcode = '23514';
    end if;

    v_proposal := public.create_commitment_proposal_with_evidence(
        p_actor_user_id,
        p_proposal
    );

    insert into public.commitment_proposal_responses (
        proposal_id,
        participant_user_id,
        agreement_version,
        status,
        responded_at
    )
    select
        v_proposal.id,
        cp.user_id,
        v_proposal.agreement_version,
        case
            when cp.user_id = p_actor_user_id then 'approved'
            else 'pending'
        end,
        case
            when cp.user_id = p_actor_user_id then now()
            else null
        end
      from public.conversation_participants cp
     where cp.conversation_id = v_conversation_id;

    insert into public.commitment_proposal_events (
        proposal_id, actor_user_id, event_type, payload
    ) values (
        v_proposal.id,
        p_actor_user_id,
        'participant_approved',
        jsonb_build_object(
            'agreement_version', v_proposal.agreement_version,
            'implicit_proposer_approval', true,
            'required_participants', v_participant_count
        )
    );

    return v_proposal;
end;
$$;

create or replace function public.finalize_approved_commitment_proposal(
    p_proposal_id uuid,
    p_actor_user_id uuid
)
returns public.commitments
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
    v_proposal public.commitment_proposals;
    v_commitment public.commitments;
begin
    select *
      into v_proposal
      from public.commitment_proposals
     where id = p_proposal_id
     for update;

    if not found then
        raise exception 'Proposal not found' using errcode = 'P0002';
    end if;
    if v_proposal.status <> 'pending' then
        raise exception 'Proposal is not pending' using errcode = 'P0001';
    end if;

    if exists (
        select 1
          from public.commitment_proposal_responses r
         where r.proposal_id = v_proposal.id
           and (
                r.agreement_version <> v_proposal.agreement_version
                or r.status not in ('approved', 'counter_proposed')
           )
    ) then
        raise exception 'Shared proposal still requires participant decisions'
            using errcode = 'P0001';
    end if;

    insert into public.commitments (
        owner_user_id,
        assigned_to_user_id,
        counterparty_contact_id,
        conversation_id,
        message_id,
        proposal_id,
        title,
        description,
        type,
        status,
        priority,
        due_at,
        expected_result,
        waiting_on_user_id,
        waiting_on_contact_id
    ) values (
        v_proposal.proposed_by_user_id,
        case
            when v_proposal.counterparty_contact_id is not null then null
            else coalesce(
                v_proposal.proposed_responsible_user_id,
                v_proposal.proposed_by_user_id
            )
        end,
        v_proposal.counterparty_contact_id,
        v_proposal.conversation_id,
        v_proposal.source_message_id,
        v_proposal.id,
        v_proposal.title,
        v_proposal.description,
        v_proposal.type,
        'accepted',
        v_proposal.priority,
        v_proposal.due_at,
        v_proposal.expected_result,
        null,
        null
    )
    returning * into v_commitment;

    update public.commitment_proposals
       set status = 'confirmed',
           decision_by_user_id = p_actor_user_id,
           decision_at = now(),
           updated_at = now()
     where id = v_proposal.id;

    insert into public.commitment_proposal_events (
        proposal_id, actor_user_id, event_type, payload
    ) values (
        v_proposal.id,
        p_actor_user_id,
        'confirmed',
        jsonb_build_object(
            'commitment_id', v_commitment.id,
            'agreement_version', v_proposal.agreement_version
        )
    );

    insert into public.commitment_events (
        commitment_id, actor_user_id, event_type,
        previous_status, new_status, payload
    ) values (
        v_commitment.id,
        p_actor_user_id,
        'created',
        null,
        'accepted',
        jsonb_build_object(
            'proposal_id', v_proposal.id,
            'source_kind', v_proposal.source_kind,
            'source_message_id', v_proposal.source_message_id,
            'conversation_id', v_proposal.conversation_id,
            'agreement_version', v_proposal.agreement_version
        )
    );

    insert into public.commitment_audit_records (
        commitment_id, proposal_id, actor_user_id, evidence_kind,
        action, previous_state, resulting_state, payload
    ) values (
        v_commitment.id,
        v_proposal.id,
        p_actor_user_id,
        'confirmed',
        'shared_agreement_confirmed',
        'pending',
        'accepted',
        jsonb_build_object(
            'agreement_version', v_proposal.agreement_version
        )
    );

    return v_commitment;
end;
$$;

create or replace function public.respond_to_commitment_proposal(
    p_proposal_id uuid,
    p_actor_user_id uuid,
    p_decision text,
    p_reason text default null,
    p_proposed_due_at timestamptz default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
    v_proposal public.commitment_proposals;
    v_response public.commitment_proposal_responses;
    v_commitment public.commitments;
    v_previous_due_at timestamptz;
begin
    if p_decision not in ('approve', 'reject', 'counter_propose') then
        raise exception 'Unsupported proposal decision' using errcode = '22023';
    end if;

    select *
      into v_proposal
      from public.commitment_proposals
     where id = p_proposal_id
     for update;

    if not found then
        raise exception 'Proposal not found' using errcode = 'P0002';
    end if;
    if v_proposal.status <> 'pending' then
        raise exception 'Proposal is not pending' using errcode = 'P0001';
    end if;
    if v_proposal.conversation_id is null
       or not public.is_conversation_participant(
           v_proposal.conversation_id,
           p_actor_user_id
       ) then
        raise exception 'Actor is not an authorized participant'
            using errcode = '42501';
    end if;

    select *
      into v_response
      from public.commitment_proposal_responses
     where proposal_id = p_proposal_id
       and participant_user_id = p_actor_user_id
     for update;

    if not found then
        raise exception 'Actor is not required for this agreement'
            using errcode = '42501';
    end if;

    if p_decision = 'reject' then
        update public.commitment_proposal_responses
           set status = 'rejected',
               proposed_due_at = null,
               response_note = nullif(btrim(p_reason), ''),
               responded_at = now(),
               updated_at = now()
         where id = v_response.id;

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
            p_proposal_id,
            p_actor_user_id,
            'participant_rejected',
            jsonb_build_object(
                'agreement_version', v_proposal.agreement_version,
                'reason', nullif(btrim(p_reason), '')
            )
        );

        insert into public.commitment_audit_records (
            proposal_id, actor_user_id, evidence_kind, action,
            previous_state, resulting_state, payload
        ) values (
            p_proposal_id,
            p_actor_user_id,
            'rejected',
            'shared_proposal_rejected',
            'pending',
            'rejected',
            jsonb_build_object(
                'agreement_version', v_proposal.agreement_version
            )
        );

    elsif p_decision = 'counter_propose' then
        if p_proposed_due_at is null then
            raise exception 'A counterproposal requires a date'
                using errcode = '23514';
        end if;

        v_previous_due_at := v_proposal.due_at;

        update public.commitment_proposals
           set due_at = p_proposed_due_at,
               agreement_version = agreement_version + 1,
               latest_counterproposal_by_user_id = p_actor_user_id,
               latest_counterproposal_due_at = p_proposed_due_at,
               updated_at = now()
         where id = p_proposal_id
         returning * into v_proposal;

        update public.commitment_proposal_responses
           set agreement_version = v_proposal.agreement_version,
               status = 'pending',
               proposed_due_at = null,
               response_note = null,
               responded_at = null,
               updated_at = now()
         where proposal_id = p_proposal_id;

        update public.commitment_proposal_responses
           set status = 'counter_proposed',
               proposed_due_at = p_proposed_due_at,
               response_note = nullif(btrim(p_reason), ''),
               responded_at = now(),
               updated_at = now()
         where proposal_id = p_proposal_id
           and participant_user_id = p_actor_user_id;

        insert into public.commitment_proposal_events (
            proposal_id, actor_user_id, event_type, payload
        ) values (
            p_proposal_id,
            p_actor_user_id,
            'schedule_counter_proposed',
            jsonb_build_object(
                'agreement_version', v_proposal.agreement_version,
                'previous_due_at', v_previous_due_at,
                'proposed_due_at', p_proposed_due_at
            )
        );

        insert into public.commitment_audit_records (
            proposal_id, actor_user_id, evidence_kind, action,
            previous_state, resulting_state, payload
        ) values (
            p_proposal_id,
            p_actor_user_id,
            'confirmed',
            'shared_schedule_counter_proposed',
            'pending',
            'pending',
            jsonb_build_object(
                'agreement_version', v_proposal.agreement_version,
                'previous_due_at', v_previous_due_at,
                'proposed_due_at', p_proposed_due_at
            )
        );

    else
        update public.commitment_proposal_responses
           set status = 'approved',
               proposed_due_at = null,
               response_note = null,
               responded_at = now(),
               updated_at = now()
         where id = v_response.id;

        insert into public.commitment_proposal_events (
            proposal_id, actor_user_id, event_type, payload
        ) values (
            p_proposal_id,
            p_actor_user_id,
            'participant_approved',
            jsonb_build_object(
                'agreement_version', v_proposal.agreement_version
            )
        );

        insert into public.commitment_audit_records (
            proposal_id, actor_user_id, evidence_kind, action,
            previous_state, resulting_state, payload
        ) values (
            p_proposal_id,
            p_actor_user_id,
            'confirmed',
            'shared_proposal_approved',
            'pending',
            'pending',
            jsonb_build_object(
                'agreement_version', v_proposal.agreement_version
            )
        );

        if not exists (
            select 1
              from public.commitment_proposal_responses r
             where r.proposal_id = p_proposal_id
               and (
                    r.agreement_version <> v_proposal.agreement_version
                    or r.status not in ('approved', 'counter_proposed')
               )
        ) then
            v_commitment := public.finalize_approved_commitment_proposal(
                p_proposal_id,
                p_actor_user_id
            );
        end if;
    end if;

    select *
      into v_proposal
      from public.commitment_proposals
     where id = p_proposal_id;

    return jsonb_build_object(
        'proposal', to_jsonb(v_proposal),
        'commitment', case
            when v_commitment.id is null then null
            else to_jsonb(v_commitment)
        end,
        'responses', (
            select coalesce(jsonb_agg(to_jsonb(r) order by r.created_at), '[]'::jsonb)
              from public.commitment_proposal_responses r
             where r.proposal_id = p_proposal_id
        )
    );
end;
$$;

create or replace function public.confirm_commitment_proposal(
    p_proposal_id uuid,
    p_actor_user_id uuid
)
returns public.commitments
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
    v_proposal public.commitment_proposals;
begin
    select *
      into v_proposal
      from public.commitment_proposals
     where id = p_proposal_id;

    if not found then
        raise exception 'Proposal not found' using errcode = 'P0002';
    end if;
    if v_proposal.proposed_by_user_id <> p_actor_user_id then
        raise exception 'Only the proposal owner can confirm it'
            using errcode = '42501';
    end if;

    return public.finalize_approved_commitment_proposal(
        p_proposal_id,
        p_actor_user_id
    );
end;
$$;

revoke all on function public.create_shared_commitment_proposal_with_responses(uuid, jsonb)
    from public, anon, authenticated;
revoke all on function public.finalize_approved_commitment_proposal(uuid, uuid)
    from public, anon, authenticated;
revoke all on function public.respond_to_commitment_proposal(uuid, uuid, text, text, timestamptz)
    from public, anon, authenticated;
revoke all on function public.confirm_commitment_proposal(uuid, uuid)
    from public, anon, authenticated;

grant execute on function public.create_shared_commitment_proposal_with_responses(uuid, jsonb)
    to service_role;
grant execute on function public.respond_to_commitment_proposal(uuid, uuid, text, text, timestamptz)
    to service_role;
grant execute on function public.confirm_commitment_proposal(uuid, uuid)
    to service_role;

do $$
begin
    if exists (
        select 1 from pg_publication where pubname = 'supabase_realtime'
    ) and not exists (
        select 1
          from pg_publication_tables
         where pubname = 'supabase_realtime'
           and schemaname = 'public'
           and tablename = 'commitment_proposal_responses'
    ) then
        alter publication supabase_realtime
            add table public.commitment_proposal_responses;
    end if;
end;
$$;

comment on table public.commitment_proposal_responses is
    'Instantánea de participantes requeridos y su decisión sobre una versión de acuerdo compartido.';
comment on column public.commitment_proposal_responses.status is
    'pending, approved, rejected o counter_proposed; recepción nunca equivale a aprobación.';
comment on column public.commitment_proposals.agreement_version is
    'Versión funcional que todos los participantes requeridos deben aprobar antes de crear Commitment.';
