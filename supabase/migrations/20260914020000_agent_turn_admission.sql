-- M-7: durable Agent Turn admission. This is intentionally not wired to
-- /agent/turn yet; it provides the identity/idempotency boundary for the
-- later Core-owned disposition layer.

create table if not exists public.agent_turn_sequence_allocators (
    actor_user_id uuid not null references auth.users(id),
    dialogue_scope_key text not null,
    next_turn_sequence bigint not null default 1 check (next_turn_sequence > 0),
    primary key (actor_user_id, dialogue_scope_key)
);

create table if not exists public.agent_turn_admissions (
    turn_id uuid primary key default gen_random_uuid(),
    actor_user_id uuid not null references auth.users(id),
    dialogue_scope_key text not null,
    client_turn_key text,
    request_fingerprint text not null,
    turn_sequence bigint not null check (turn_sequence > 0),
    status text not null default 'accepted' check (status in ('accepted', 'processing', 'completed', 'failed')),
    failure_class text check (failure_class is null or failure_class in ('retryable', 'terminal')),
    result_ref jsonb,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    completed_at timestamptz,
    expires_at timestamptz not null default (now() + interval '30 days'),
    unique (actor_user_id, dialogue_scope_key, turn_sequence),
    check (status <> 'failed' or failure_class is not null),
    check (status = 'failed' or failure_class is null)
);

create unique index if not exists agent_turn_admissions_client_key_unique_idx
    on public.agent_turn_admissions (actor_user_id, dialogue_scope_key, client_turn_key)
    where client_turn_key is not null;

create index if not exists agent_turn_admissions_scope_sequence_idx
    on public.agent_turn_admissions (actor_user_id, dialogue_scope_key, turn_sequence);

create index if not exists agent_turn_admissions_retention_idx
    on public.agent_turn_admissions (expires_at);

alter table public.agent_turn_sequence_allocators enable row level security;
alter table public.agent_turn_admissions enable row level security;

-- Backend access uses the service role/RPC, while these policies prevent a
-- client session from reading or mutating another actor's admission records.
create policy agent_turn_admissions_owner_select on public.agent_turn_admissions
    for select using (actor_user_id = auth.uid());

create or replace function public.admit_agent_turn(
    p_actor_user_id uuid,
    p_dialogue_scope_key text,
    p_client_turn_key text,
    p_request_fingerprint text
)
returns table (
    turn_id uuid,
    actor_user_id uuid,
    dialogue_scope_key text,
    client_turn_key text,
    request_fingerprint text,
    turn_sequence bigint,
    status text,
    failure_class text,
    result_ref jsonb,
    created_at timestamptz,
    updated_at timestamptz,
    completed_at timestamptz,
    expires_at timestamptz,
    idempotent_replay boolean
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
    v_existing public.agent_turn_admissions;
    v_sequence bigint;
    v_turn_id uuid;
begin
    if p_dialogue_scope_key is null or length(p_dialogue_scope_key) = 0 or length(p_dialogue_scope_key) > 200 then
        raise exception 'Invalid dialogue scope key' using errcode = '22023';
    end if;
    if p_request_fingerprint is null or length(p_request_fingerprint) <> 64 then
        raise exception 'Invalid request fingerprint' using errcode = '22023';
    end if;
    if p_client_turn_key is not null and (length(p_client_turn_key) = 0 or length(p_client_turn_key) > 200) then
        raise exception 'Invalid client turn key' using errcode = '22023';
    end if;

    if p_client_turn_key is not null then
        select a.* into v_existing
          from public.agent_turn_admissions a
         where a.actor_user_id = p_actor_user_id
           and a.dialogue_scope_key = p_dialogue_scope_key
           and a.client_turn_key = p_client_turn_key
         for update;
        if found then
            if v_existing.request_fingerprint <> p_request_fingerprint then
                raise exception 'Agent turn idempotency conflict' using errcode = 'P0003';
            end if;
            return query select v_existing.turn_id, v_existing.actor_user_id,
                v_existing.dialogue_scope_key, v_existing.client_turn_key,
                v_existing.request_fingerprint, v_existing.turn_sequence,
                v_existing.status, v_existing.failure_class, v_existing.result_ref,
                v_existing.created_at, v_existing.updated_at, v_existing.completed_at,
                v_existing.expires_at, true;
            return;
        end if;
    end if;

    -- The allocator row is locked for this actor/scope. It is not MAX()+1,
    -- so concurrent instances and process restarts cannot allocate duplicates.
    insert into public.agent_turn_sequence_allocators (actor_user_id, dialogue_scope_key)
    values (p_actor_user_id, p_dialogue_scope_key)
    on conflict on constraint agent_turn_sequence_allocators_pkey do nothing;
    select a.next_turn_sequence into v_sequence
      from public.agent_turn_sequence_allocators a
     where a.actor_user_id = p_actor_user_id
       and a.dialogue_scope_key = p_dialogue_scope_key
     for update;

    -- Re-check after taking the scope lock. A concurrent first admission may
    -- have passed the initial lookup while its row was still uncommitted.
    if p_client_turn_key is not null then
        select a.* into v_existing
          from public.agent_turn_admissions a
         where a.actor_user_id = p_actor_user_id
           and a.dialogue_scope_key = p_dialogue_scope_key
           and a.client_turn_key = p_client_turn_key
         for update;
        if found then
            if v_existing.request_fingerprint <> p_request_fingerprint then
                raise exception 'Agent turn idempotency conflict' using errcode = 'P0003';
            end if;
            return query select v_existing.turn_id, v_existing.actor_user_id,
                v_existing.dialogue_scope_key, v_existing.client_turn_key,
                v_existing.request_fingerprint, v_existing.turn_sequence,
                v_existing.status, v_existing.failure_class, v_existing.result_ref,
                v_existing.created_at, v_existing.updated_at, v_existing.completed_at,
                v_existing.expires_at, true;
            return;
        end if;
    end if;

    update public.agent_turn_sequence_allocators a
       set next_turn_sequence = v_sequence + 1
     where a.actor_user_id = p_actor_user_id
       and a.dialogue_scope_key = p_dialogue_scope_key;

    insert into public.agent_turn_admissions (
        actor_user_id, dialogue_scope_key, client_turn_key,
        request_fingerprint, turn_sequence
    ) values (
        p_actor_user_id, p_dialogue_scope_key, p_client_turn_key,
        p_request_fingerprint, v_sequence
    ) returning public.agent_turn_admissions.turn_id into v_turn_id;

    return query
      select a.turn_id, a.actor_user_id, a.dialogue_scope_key, a.client_turn_key,
        a.request_fingerprint, a.turn_sequence, a.status, a.failure_class,
        a.result_ref, a.created_at, a.updated_at, a.completed_at, a.expires_at, false
        from public.agent_turn_admissions a where a.turn_id = v_turn_id;
end;
$$;

create or replace function public.claim_agent_turn_admission(
    p_turn_id uuid,
    p_actor_user_id uuid,
    p_dialogue_scope_key text
)
returns public.agent_turn_admissions
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
    v_row public.agent_turn_admissions;
begin
    select * into v_row from public.agent_turn_admissions
     where turn_id = p_turn_id for update;
    if not found then raise exception 'Agent turn admission not found' using errcode = 'P0002'; end if;
    if v_row.actor_user_id <> p_actor_user_id or v_row.dialogue_scope_key <> p_dialogue_scope_key then
        raise exception 'Agent turn admission is not owned by this scope' using errcode = '42501';
    end if;
    if v_row.status = 'accepted' or (v_row.status = 'failed' and v_row.failure_class = 'retryable') then
        update public.agent_turn_admissions
           set status = 'processing', failure_class = null, updated_at = now()
         where turn_id = p_turn_id returning * into v_row;
    end if;
    return v_row;
end;
$$;

create or replace function public.complete_agent_turn_admission(
    p_turn_id uuid,
    p_actor_user_id uuid,
    p_dialogue_scope_key text,
    p_result_ref jsonb
)
returns public.agent_turn_admissions
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare v_row public.agent_turn_admissions;
begin
    select * into v_row from public.agent_turn_admissions
     where turn_id = p_turn_id for update;
    if not found then raise exception 'Agent turn admission not found' using errcode = 'P0002'; end if;
    if v_row.actor_user_id <> p_actor_user_id or v_row.dialogue_scope_key <> p_dialogue_scope_key then
        raise exception 'Agent turn admission is not owned by this scope' using errcode = '42501';
    end if;
    if v_row.status not in ('processing', 'completed') then
        raise exception 'Agent turn is not processing' using errcode = 'P0004';
    end if;
    if v_row.status = 'processing' then
        update public.agent_turn_admissions
           set status = 'completed', result_ref = p_result_ref,
               completed_at = now(), updated_at = now()
         where turn_id = p_turn_id returning * into v_row;
    end if;
    return v_row;
end;
$$;

create or replace function public.fail_agent_turn_admission(
    p_turn_id uuid,
    p_actor_user_id uuid,
    p_dialogue_scope_key text,
    p_failure_class text,
    p_result_ref jsonb default null
)
returns public.agent_turn_admissions
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare v_row public.agent_turn_admissions;
begin
    if p_failure_class not in ('retryable', 'terminal') then
        raise exception 'Invalid Agent turn failure class' using errcode = '22023';
    end if;
    select * into v_row from public.agent_turn_admissions
     where turn_id = p_turn_id for update;
    if not found then raise exception 'Agent turn admission not found' using errcode = 'P0002'; end if;
    if v_row.actor_user_id <> p_actor_user_id or v_row.dialogue_scope_key <> p_dialogue_scope_key then
        raise exception 'Agent turn admission is not owned by this scope' using errcode = '42501';
    end if;
    if v_row.status = 'completed' then return v_row; end if;
    update public.agent_turn_admissions
       set status = 'failed', failure_class = p_failure_class,
           result_ref = p_result_ref, updated_at = now()
     where turn_id = p_turn_id returning * into v_row;
    return v_row;
end;
$$;

revoke all on function public.admit_agent_turn(uuid, text, text, text) from public, anon, authenticated;
revoke all on function public.claim_agent_turn_admission(uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.complete_agent_turn_admission(uuid, uuid, text, jsonb) from public, anon, authenticated;
revoke all on function public.fail_agent_turn_admission(uuid, uuid, text, text, jsonb) from public, anon, authenticated;
grant execute on function public.admit_agent_turn(uuid, text, text, text) to service_role;
grant execute on function public.claim_agent_turn_admission(uuid, uuid, text) to service_role;
grant execute on function public.complete_agent_turn_admission(uuid, uuid, text, jsonb) to service_role;
grant execute on function public.fail_agent_turn_admission(uuid, uuid, text, text, jsonb) to service_role;
