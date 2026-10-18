-- Ping C-4: canonical Operation persistence and Commitment evidence.
--
-- Operation used to live only in historical backend/phase*.sql scripts and
-- updated commitments directly from the service. This migration makes the
-- currently supported Operation schema reproducible from supabase/migrations
-- and moves the Commitment + progress mutation into one guarded transaction.
--
-- Existing installations are preserved: every schema addition is idempotent,
-- and the RPC is the only new write path used by the backend.

alter table public.conversations
    add column if not exists mode text not null default 'chat',
    add column if not exists pinned_message_id uuid references public.messages(id) on delete set null,
    add column if not exists active_commitment_id uuid references public.commitments(id) on delete set null;

do $$
begin
    if not exists (
        select 1 from pg_constraint where conname = 'conversations_mode_check'
    ) then
        alter table public.conversations
            add constraint conversations_mode_check
            check (mode in ('chat', 'operation'));
    end if;
end
$$;

create table if not exists public.operation_checklists (
    id uuid primary key default gen_random_uuid(),
    conversation_id uuid not null references public.conversations(id) on delete cascade,
    title text not null,
    category_label text,
    responsible_user_id uuid references public.profiles(id) on delete set null,
    responsible_role_label text,
    frequency text not null default 'manual',
    is_active boolean not null default true,
    created_by_user_id uuid references public.profiles(id) on delete set null,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

alter table public.operation_checklists
    add column if not exists category_label text,
    add column if not exists responsible_user_id uuid references public.profiles(id) on delete set null,
    add column if not exists responsible_role_label text,
    add column if not exists frequency text not null default 'manual';

do $$
begin
    if not exists (
        select 1 from pg_constraint where conname = 'operation_checklists_frequency_check'
    ) then
        alter table public.operation_checklists
            add constraint operation_checklists_frequency_check
            check (frequency in ('manual', 'daily', 'shift'));
    end if;
end
$$;

create table if not exists public.operation_checklist_items (
    id uuid primary key default gen_random_uuid(),
    checklist_id uuid not null references public.operation_checklists(id) on delete cascade,
    label text not null,
    response_type text not null default 'condition',
    sort_order integer not null default 0,
    created_at timestamptz not null default now()
);

alter table public.operation_checklist_items
    add column if not exists response_type text not null default 'condition';

do $$
begin
    if not exists (
        select 1 from pg_constraint where conname = 'operation_checklist_items_response_type_check'
    ) then
        alter table public.operation_checklist_items
            add constraint operation_checklist_items_response_type_check
            check (response_type in ('condition', 'severity', 'yes_no', 'text'));
    end if;
end
$$;

create table if not exists public.operation_checklist_runs (
    id uuid primary key default gen_random_uuid(),
    checklist_id uuid not null references public.operation_checklists(id) on delete cascade,
    conversation_id uuid not null references public.conversations(id) on delete cascade,
    run_date date not null,
    created_by_user_id uuid references public.profiles(id) on delete set null,
    created_at timestamptz not null default now(),
    unique (checklist_id, run_date)
);

create table if not exists public.operation_checklist_run_items (
    id uuid primary key default gen_random_uuid(),
    run_id uuid not null references public.operation_checklist_runs(id) on delete cascade,
    template_item_id uuid references public.operation_checklist_items(id) on delete set null,
    label text not null,
    response_type text not null default 'condition',
    sort_order integer not null default 0,
    is_checked boolean not null default false,
    result text,
    checked_at timestamptz,
    checked_by_user_id uuid references public.profiles(id) on delete set null,
    created_at timestamptz not null default now(),
    unique (run_id, template_item_id)
);

alter table public.operation_checklist_run_items
    add column if not exists response_type text not null default 'condition',
    add column if not exists result text;

do $$
begin
    if not exists (
        select 1 from pg_constraint where conname = 'operation_checklist_run_items_response_type_check'
    ) then
        alter table public.operation_checklist_run_items
            add constraint operation_checklist_run_items_response_type_check
            check (response_type in ('condition', 'severity', 'yes_no', 'text'));
    end if;
end
$$;

alter table public.operation_checklist_run_items
    drop constraint if exists operation_checklist_run_items_result_check;

alter table public.operation_checklist_run_items
    add constraint operation_checklist_run_items_result_check
    check (
        result is null or result in (
            'good', 'regular', 'bad', 'na',
            'high', 'medium', 'low',
            'yes', 'no'
        )
    );

create table if not exists public.shift_reports (
    id uuid primary key default gen_random_uuid(),
    conversation_id uuid not null references public.conversations(id) on delete cascade,
    user_id uuid references public.profiles(id) on delete set null,
    body text not null,
    source text not null default 'text',
    meta jsonb not null default '{}'::jsonb,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create table if not exists public.conversation_operation_focuses (
    id uuid primary key default gen_random_uuid(),
    conversation_id uuid not null references public.conversations(id) on delete cascade,
    user_id uuid not null references public.profiles(id) on delete cascade,
    commitment_id uuid not null references public.commitments(id) on delete cascade,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    unique (conversation_id, user_id)
);

create table if not exists public.commitment_operation_progress (
    id uuid primary key default gen_random_uuid(),
    commitment_id uuid not null references public.commitments(id) on delete cascade,
    user_id uuid not null references public.profiles(id) on delete cascade,
    status text not null default 'ready',
    acknowledged_at timestamptz,
    arrived_at timestamptz,
    completed_at timestamptz,
    latest_location_message_id uuid references public.messages(id) on delete set null,
    completion_note text,
    completion_outcome text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    unique (commitment_id, user_id)
);

do $$
begin
    if not exists (
        select 1 from pg_constraint
        where conname = 'commitment_operation_progress_status_check'
    ) then
        alter table public.commitment_operation_progress
            add constraint commitment_operation_progress_status_check
            check (status in ('ready', 'started', 'arrived', 'completed'));
    end if;

    if not exists (
        select 1 from pg_constraint
        where conname = 'commitment_operation_progress_outcome_check'
    ) then
        alter table public.commitment_operation_progress
            add constraint commitment_operation_progress_outcome_check
            check (completion_outcome is null or completion_outcome in (
                'resolved', 'pending_followup', 'needs_review'
            ));
    end if;
end
$$;

create index if not exists idx_operation_checklists_conversation
    on public.operation_checklists(conversation_id, is_active, updated_at desc);
create index if not exists idx_operation_checklist_items_checklist
    on public.operation_checklist_items(checklist_id, sort_order asc);
create index if not exists idx_operation_checklist_runs_conversation
    on public.operation_checklist_runs(conversation_id, run_date desc);
create index if not exists idx_operation_checklist_run_items_run
    on public.operation_checklist_run_items(run_id, sort_order asc);
create index if not exists idx_operation_focuses_conversation
    on public.conversation_operation_focuses(conversation_id, updated_at desc);
create index if not exists idx_operation_focuses_user
    on public.conversation_operation_focuses(user_id, updated_at desc);
create index if not exists idx_commitment_operation_progress_commitment
    on public.commitment_operation_progress(commitment_id, updated_at desc);
create index if not exists idx_commitment_operation_progress_user
    on public.commitment_operation_progress(user_id, updated_at desc);

alter table public.commitment_events
    drop constraint if exists commitment_events_type_check;

alter table public.commitment_events
    add constraint commitment_events_type_check
    check (event_type in (
        'created', 'edited', 'archived', 'accepted', 'rejected', 'counter_proposed',
        'rescheduled', 'action_completed', 'resolved', 'reopened', 'cancelled',
        'follow_up_scheduled', 'reassigned', 'operation_acknowledged',
        'operation_arrived'
    ));

-- Backend/service_role is the only writer for Operation. Authenticated clients
-- can read only the rows belonging to conversations they participate in.
alter table public.operation_checklists enable row level security;
alter table public.operation_checklist_items enable row level security;
alter table public.operation_checklist_runs enable row level security;
alter table public.operation_checklist_run_items enable row level security;
alter table public.shift_reports enable row level security;
alter table public.conversation_operation_focuses enable row level security;
alter table public.commitment_operation_progress enable row level security;

drop policy if exists operation_checklists_select_participant on public.operation_checklists;
create policy operation_checklists_select_participant
    on public.operation_checklists for select to authenticated
    using (public.is_conversation_participant(conversation_id, auth.uid()));

drop policy if exists operation_checklist_items_select_participant on public.operation_checklist_items;
create policy operation_checklist_items_select_participant
    on public.operation_checklist_items for select to authenticated
    using (exists (
        select 1 from public.operation_checklists c
        where c.id = checklist_id
          and public.is_conversation_participant(c.conversation_id, auth.uid())
    ));

drop policy if exists operation_checklist_runs_select_participant on public.operation_checklist_runs;
create policy operation_checklist_runs_select_participant
    on public.operation_checklist_runs for select to authenticated
    using (public.is_conversation_participant(conversation_id, auth.uid()));

drop policy if exists operation_checklist_run_items_select_participant on public.operation_checklist_run_items;
create policy operation_checklist_run_items_select_participant
    on public.operation_checklist_run_items for select to authenticated
    using (exists (
        select 1
          from public.operation_checklist_runs r
         where r.id = run_id
           and public.is_conversation_participant(r.conversation_id, auth.uid())
    ));

drop policy if exists shift_reports_select_participant on public.shift_reports;
create policy shift_reports_select_participant
    on public.shift_reports for select to authenticated
    using (public.is_conversation_participant(conversation_id, auth.uid()));

drop policy if exists operation_focuses_select_authorized on public.conversation_operation_focuses;
create policy operation_focuses_select_authorized
    on public.conversation_operation_focuses for select to authenticated
    using (
        user_id = auth.uid()
        and public.is_conversation_participant(conversation_id, auth.uid())
    );

drop policy if exists operation_progress_select_authorized on public.commitment_operation_progress;
create policy operation_progress_select_authorized
    on public.commitment_operation_progress for select to authenticated
    using (
        user_id = auth.uid()
        or exists (
            select 1 from public.commitments c
            where c.id = commitment_id
              and (
                  c.owner_user_id = auth.uid()
                  or c.assigned_to_user_id = auth.uid()
                  or (
                      c.conversation_id is not null
                      and public.is_conversation_participant(c.conversation_id, auth.uid())
                  )
              )
        )
    );

create or replace function public.apply_commitment_operation_action_with_evidence(
    p_commitment_id uuid,
    p_actor_user_id uuid,
    p_action text,
    p_location_message_id uuid default null,
    p_completion_note text default null,
    p_completion_outcome text default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
    v_before public.commitments;
    v_after public.commitments;
    v_existing public.commitment_operation_progress;
    v_progress public.commitment_operation_progress;
    v_event_type text;
    v_next_progress_status text;
begin
    if p_action not in ('acknowledged', 'arrived', 'completed') then
        raise exception 'Unsupported operation action' using errcode = '22023';
    end if;

    if p_completion_outcome is not null
       and p_completion_outcome not in ('resolved', 'pending_followup', 'needs_review') then
        raise exception 'Unsupported completion outcome' using errcode = '22023';
    end if;

    select * into v_before
      from public.commitments
     where id = p_commitment_id
     for update;

    if not found then
        raise exception 'Commitment not found' using errcode = 'P0002';
    end if;

    if v_before.owner_user_id is distinct from p_actor_user_id
       and v_before.assigned_to_user_id is distinct from p_actor_user_id
       and (
           v_before.conversation_id is null
           or not public.is_conversation_participant(
               v_before.conversation_id,
               p_actor_user_id
           )
       ) then
        raise exception 'Actor is not authorized for this Commitment' using errcode = '42501';
    end if;

    if p_location_message_id is not null then
        if v_before.conversation_id is null
           or not exists (
               select 1 from public.messages m
               where m.id = p_location_message_id
                 and m.conversation_id = v_before.conversation_id
           ) then
            raise exception 'Location message does not belong to the Commitment conversation'
                using errcode = '42501';
        end if;
    end if;

    select * into v_existing
      from public.commitment_operation_progress
     where commitment_id = p_commitment_id
       and user_id = p_actor_user_id
     for update;

    v_event_type := case p_action
        when 'acknowledged' then 'operation_acknowledged'
        when 'arrived' then 'operation_arrived'
        else 'action_completed'
    end;

    update public.commitments
       set status = case
               when p_action in ('acknowledged', 'arrived')
                and status = 'proposed'
                   then 'accepted'
               else status
           end,
           assigned_to_user_id = case
               when p_action in ('acknowledged', 'arrived')
                and assigned_to_user_id is null
                   then p_actor_user_id
               else assigned_to_user_id
           end,
           action_completed_at = case
               when p_action = 'completed' then now()
               else action_completed_at
           end,
           updated_at = now()
     where id = p_commitment_id
     returning * into v_after;

    v_next_progress_status := case p_action
        when 'acknowledged' then 'started'
        when 'arrived' then 'arrived'
        else 'completed'
    end;

    insert into public.commitment_operation_progress (
        commitment_id, user_id, status,
        acknowledged_at, arrived_at, completed_at,
        latest_location_message_id, completion_note,
        completion_outcome, updated_at
    ) values (
        p_commitment_id,
        p_actor_user_id,
        v_next_progress_status,
        case when p_action = 'acknowledged' then now() else v_existing.acknowledged_at end,
        case when p_action = 'arrived' then now() else v_existing.arrived_at end,
        case when p_action = 'completed' then now() else v_existing.completed_at end,
        coalesce(p_location_message_id, v_existing.latest_location_message_id),
        case when p_action = 'completed'
            then nullif(btrim(p_completion_note), '')
            else v_existing.completion_note
        end,
        case when p_action = 'completed'
            then coalesce(p_completion_outcome, 'resolved')
            else v_existing.completion_outcome
        end,
        now()
    )
    on conflict (commitment_id, user_id) do update set
        status = excluded.status,
        acknowledged_at = excluded.acknowledged_at,
        arrived_at = excluded.arrived_at,
        completed_at = excluded.completed_at,
        latest_location_message_id = excluded.latest_location_message_id,
        completion_note = excluded.completion_note,
        completion_outcome = excluded.completion_outcome,
        updated_at = now()
    returning * into v_progress;

    insert into public.commitment_events (
        commitment_id, actor_user_id, event_type,
        previous_status, new_status, payload
    ) values (
        p_commitment_id,
        p_actor_user_id,
        v_event_type,
        v_before.status,
        v_after.status,
        jsonb_build_object(
            'operation_action', p_action,
            'location_message_id', p_location_message_id,
            'completion_outcome', p_completion_outcome
        )
    );

    insert into public.commitment_audit_records (
        commitment_id, proposal_id, actor_user_id, evidence_kind,
        action, previous_state, resulting_state, payload
    ) values (
        p_commitment_id,
        v_after.proposal_id,
        p_actor_user_id,
        'confirmed',
        v_event_type,
        v_before.status,
        v_after.status,
        jsonb_build_object(
            'operation_action', p_action,
            'progress_id', v_progress.id
        )
    );

    return jsonb_build_object(
        'commitment', to_jsonb(v_after),
        'operation_progress', to_jsonb(v_progress)
    );
end;
$$;

revoke all on function public.apply_commitment_operation_action_with_evidence(
    uuid, uuid, text, uuid, text, text
) from public, anon, authenticated;

grant execute on function public.apply_commitment_operation_action_with_evidence(
    uuid, uuid, text, uuid, text, text
) to service_role;

comment on function public.apply_commitment_operation_action_with_evidence(
    uuid, uuid, text, uuid, text, text
) is
    'Applies an Operation action, Commitment state change, progress row, Event and Audit evidence atomically.';
