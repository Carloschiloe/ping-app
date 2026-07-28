-- Ping beta: Proposal separada de Commitment y ciclo de vida no destructivo.
-- Migración estrictamente aditiva. No elimina ni renombra columnas existentes.

create table if not exists public.commitment_proposals (
    id                          uuid primary key default gen_random_uuid(),
    proposed_by_user_id         uuid not null references public.profiles(id) on delete restrict,
    proposed_responsible_user_id uuid references public.profiles(id) on delete set null,
    counterparty_contact_id     uuid references public.contacts(id) on delete set null,
    conversation_id             uuid references public.conversations(id) on delete set null,
    source_message_id           uuid references public.messages(id) on delete set null,
    source_kind                 text not null,
    title                       text not null,
    description                 text,
    due_at                      timestamptz,
    type                        text not null default 'task',
    priority                    text,
    expected_result             text,
    status                      text not null default 'pending',
    decision_by_user_id         uuid references public.profiles(id) on delete set null,
    decision_at                 timestamptz,
    rejection_reason            text,
    created_at                  timestamptz not null default now(),
    updated_at                  timestamptz not null default now(),
    constraint commitment_proposals_status_check
        check (status in ('pending', 'confirmed', 'rejected')),
    constraint commitment_proposals_source_check
        check (source_kind in ('manual', 'conversation_message', 'ai_suggestion')),
    constraint commitment_proposals_type_check
        check (type in ('task', 'meeting')),
    constraint commitment_proposals_priority_check
        check (priority is null or priority in ('low', 'medium', 'high')),
    constraint commitment_proposals_party_check
        check (not (
            proposed_responsible_user_id is not null
            and counterparty_contact_id is not null
        )),
    constraint commitment_proposals_message_context_check
        check (
            source_message_id is null
            or conversation_id is not null
        )
);

create index if not exists commitment_proposals_owner_status_idx
    on public.commitment_proposals (proposed_by_user_id, status, created_at desc);
create index if not exists commitment_proposals_conversation_idx
    on public.commitment_proposals (conversation_id, created_at desc);

alter table public.commitments
    add column if not exists proposal_id uuid references public.commitment_proposals(id) on delete restrict,
    add column if not exists resolution_result text,
    add column if not exists archived_at timestamptz;

create unique index if not exists commitments_proposal_unique_idx
    on public.commitments (proposal_id)
    where proposal_id is not null;
create index if not exists commitments_active_owner_idx
    on public.commitments (owner_user_id, created_at desc)
    where archived_at is null;

create or replace function public.require_commitment_resolution_result()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
    if new.status = 'resolved'
       and (tg_op = 'INSERT' or old.status is distinct from 'resolved')
       and nullif(btrim(new.resolution_result), '') is null then
        raise exception 'A comprehensible resolution result is required'
            using errcode = '23514';
    end if;
    return new;
end;
$$;

drop trigger if exists commitments_require_resolution_result on public.commitments;
create trigger commitments_require_resolution_result
before insert or update on public.commitments
for each row execute function public.require_commitment_resolution_result();

create table if not exists public.commitment_proposal_events (
    id                  uuid primary key default gen_random_uuid(),
    proposal_id         uuid not null references public.commitment_proposals(id) on delete restrict,
    actor_user_id       uuid references public.profiles(id) on delete set null,
    event_type          text not null,
    payload             jsonb not null default '{}'::jsonb,
    created_at          timestamptz not null default now(),
    constraint commitment_proposal_events_type_check
        check (event_type in ('proposed', 'confirmed', 'rejected'))
);

create index if not exists commitment_proposal_events_proposal_idx
    on public.commitment_proposal_events (proposal_id, created_at);

alter table public.commitment_proposals enable row level security;
alter table public.commitment_proposal_events enable row level security;

create policy commitment_proposals_select_authorized
    on public.commitment_proposals for select
    to authenticated
    using (
        proposed_by_user_id = auth.uid()
        or proposed_responsible_user_id = auth.uid()
        or (
            conversation_id is not null
            and public.is_conversation_participant(conversation_id, auth.uid())
        )
    );

create policy commitment_proposals_insert_own
    on public.commitment_proposals for insert
    to authenticated
    with check (proposed_by_user_id = auth.uid());

create policy commitment_proposal_events_select_authorized
    on public.commitment_proposal_events for select
    to authenticated
    using (
        exists (
            select 1
            from public.commitment_proposals p
            where p.id = commitment_proposal_events.proposal_id
              and (
                p.proposed_by_user_id = auth.uid()
                or p.proposed_responsible_user_id = auth.uid()
                or (
                    p.conversation_id is not null
                    and public.is_conversation_participant(p.conversation_id, auth.uid())
                )
              )
        )
    );

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
    if v_proposal.proposed_by_user_id <> p_actor_user_id then
        raise exception 'Only the proposal owner can confirm it' using errcode = '42501';
    end if;
    if v_proposal.status <> 'pending' then
        raise exception 'Proposal is not pending' using errcode = 'P0001';
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
            else coalesce(v_proposal.proposed_responsible_user_id, v_proposal.proposed_by_user_id)
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
        v_proposal.id, p_actor_user_id, 'confirmed',
        jsonb_build_object('commitment_id', v_commitment.id)
    );

    insert into public.commitment_events (
        commitment_id, actor_user_id, event_type,
        previous_status, new_status, payload
    ) values (
        v_commitment.id, p_actor_user_id, 'created',
        null, 'accepted',
        jsonb_build_object(
            'proposal_id', v_proposal.id,
            'source_kind', v_proposal.source_kind,
            'source_message_id', v_proposal.source_message_id,
            'conversation_id', v_proposal.conversation_id
        )
    );

    return v_commitment;
end;
$$;

revoke all on function public.confirm_commitment_proposal(uuid, uuid) from public, anon, authenticated;
grant execute on function public.confirm_commitment_proposal(uuid, uuid) to service_role;

comment on table public.commitment_proposals is
    'Propuestas todavía no confirmadas. Rechazar una propuesta nunca crea un Commitment.';
comment on column public.commitments.proposal_id is
    'Propuesta confirmada que originó el Commitment; nulo sólo para compatibilidad histórica.';
comment on column public.commitments.resolution_result is
    'Resultado comprensible y obligatorio para todo nuevo cierre como resuelto.';
comment on column public.commitments.archived_at is
    'Retiro no destructivo de vistas activas; no borra el compromiso ni su historia.';
