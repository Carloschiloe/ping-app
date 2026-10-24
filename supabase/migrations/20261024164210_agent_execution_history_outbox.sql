-- Durable execution-history outbox.
--
-- The side effect itself remains governed by agent_executions and its unique
-- (authorization_id, step_id) constraint. This table closes the separate
-- projection gap: once execution is claimed, the conversation target and
-- source plan are durable before any tool runs. The final result is staged
-- durably and the visible history projection can be retried idempotently.

create table if not exists public.agent_execution_history_outbox (
    id uuid primary key default gen_random_uuid(),
    authorization_id uuid not null unique references public.agent_authorizations(id) on delete cascade,
    actor_user_id uuid not null references public.profiles(id) on delete cascade,
    conversation_id uuid not null references public.conversations(id) on delete cascade,
    source_turn_key text not null,
    status text not null default 'pending' check (status in ('pending', 'projected')),
    execution_result jsonb,
    attempt_count integer not null default 0,
    last_error_code text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    projected_at timestamptz
);

create index if not exists agent_execution_history_outbox_pending_idx
    on public.agent_execution_history_outbox (status, updated_at)
    where status = 'pending';

alter table public.agent_execution_history_outbox enable row level security;
revoke all on public.agent_execution_history_outbox from anon, authenticated;
grant all on public.agent_execution_history_outbox to service_role;

-- Versioned claim operation. The existing two-argument claim remains intact
-- for older clients; the canonical mobile flow uses this operation and binds
-- the history target before the first side effect can run.
create or replace function public.claim_agent_authorization_for_execution_with_history(
    p_authorization_id uuid,
    p_actor_user_id uuid,
    p_history_conversation_id uuid default null,
    p_history_source_turn_key text default null
)
returns public.agent_authorizations
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
    v_row public.agent_authorizations;
    v_outbox public.agent_execution_history_outbox;
    v_source_key text := nullif(trim(p_history_source_turn_key), '');
begin
    if (p_history_conversation_id is null) <> (v_source_key is null) then
        raise exception 'Execution history conversation and source key must be provided together' using errcode = '22023';
    end if;

    select * into v_row
    from public.claim_agent_authorization_for_execution(p_authorization_id, p_actor_user_id);

    if p_history_conversation_id is not null then
        if not exists (
            select 1
            from public.conversation_participants cp
            where cp.conversation_id = p_history_conversation_id
              and cp.user_id = p_actor_user_id
        ) then
            raise exception 'Conversation participant required' using errcode = '42501';
        end if;

        select * into v_outbox
        from public.agent_execution_history_outbox
        where authorization_id = p_authorization_id
        for update;

        if found then
            if v_outbox.actor_user_id <> p_actor_user_id
               or v_outbox.conversation_id <> p_history_conversation_id
               or v_outbox.source_turn_key <> v_source_key then
                raise exception 'Execution history binding does not match authorization' using errcode = '22023';
            end if;
        else
            insert into public.agent_execution_history_outbox (
                authorization_id, actor_user_id, conversation_id, source_turn_key
            ) values (
                p_authorization_id, p_actor_user_id, p_history_conversation_id, v_source_key
            );
        end if;
    end if;

    return v_row;
end;
$$;

create or replace function public.stage_agent_execution_history(
    p_authorization_id uuid,
    p_actor_user_id uuid,
    p_execution_result jsonb
)
returns public.agent_execution_history_outbox
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
    v_row public.agent_execution_history_outbox;
begin
    if p_execution_result is null or pg_column_size(p_execution_result) > 131072 then
        raise exception 'Invalid execution history result' using errcode = '22023';
    end if;

    select * into v_row
    from public.agent_execution_history_outbox
    where authorization_id = p_authorization_id
      and actor_user_id = p_actor_user_id
    for update;

    if not found then
        raise exception 'Execution history outbox not found' using errcode = 'P0002';
    end if;

    update public.agent_execution_history_outbox
       set execution_result = case when status = 'projected' then execution_result else p_execution_result end,
           attempt_count = attempt_count + case when status = 'projected' then 0 else 1 end,
           last_error_code = case when status = 'projected' then last_error_code else null end,
           updated_at = now()
     where id = v_row.id
     returning * into v_row;

    return v_row;
end;
$$;

create or replace function public.complete_agent_execution_history(
    p_authorization_id uuid,
    p_actor_user_id uuid,
    p_error_code text default null
)
returns public.agent_execution_history_outbox
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
    v_row public.agent_execution_history_outbox;
begin
    select * into v_row
    from public.agent_execution_history_outbox
    where authorization_id = p_authorization_id
      and actor_user_id = p_actor_user_id
    for update;

    if not found then
        raise exception 'Execution history outbox not found' using errcode = 'P0002';
    end if;

    update public.agent_execution_history_outbox
       set status = case when p_error_code is null then 'projected' else 'pending' end,
           last_error_code = p_error_code,
           projected_at = case when p_error_code is null then coalesce(projected_at, now()) else projected_at end,
           updated_at = now()
     where id = v_row.id
     returning * into v_row;

    return v_row;
end;
$$;

revoke all on function public.claim_agent_authorization_for_execution_with_history(uuid, uuid, uuid, text)
    from public, anon, authenticated;
revoke all on function public.stage_agent_execution_history(uuid, uuid, jsonb)
    from public, anon, authenticated;
revoke all on function public.complete_agent_execution_history(uuid, uuid, text)
    from public, anon, authenticated;
grant execute on function public.claim_agent_authorization_for_execution_with_history(uuid, uuid, uuid, text)
    to service_role;
grant execute on function public.stage_agent_execution_history(uuid, uuid, jsonb)
    to service_role;
grant execute on function public.complete_agent_execution_history(uuid, uuid, text)
    to service_role;
