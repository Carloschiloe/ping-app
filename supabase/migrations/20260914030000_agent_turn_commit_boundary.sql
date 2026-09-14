-- M-7: durable semantic/dialogue checkpoint and atomic turn application.
-- This migration is infrastructure only; /agent/turn remains unwired.

alter table public.agent_turn_admissions
    add column if not exists replay_version smallint,
    add column if not exists semantic_checkpoint_version smallint;

create table if not exists public.agent_turn_semantic_checkpoints (
    turn_id uuid primary key references public.agent_turn_admissions(turn_id),
    actor_user_id uuid not null references auth.users(id),
    dialogue_scope_key text not null,
    turn_sequence bigint not null check (turn_sequence > 0),
    semantic_version smallint not null check (semantic_version > 0),
    semantic_fingerprint text not null check (length(semantic_fingerprint) = 64),
    semantic_turn jsonb not null,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    check (octet_length(convert_to(semantic_turn::text, 'utf8')) <= 32768),
    unique (actor_user_id, dialogue_scope_key, turn_sequence)
);

create table if not exists public.agent_dialogue_checkpoints (
    actor_user_id uuid not null references auth.users(id),
    dialogue_scope_key text not null,
    lifecycle text not null,
    active_dialogue jsonb,
    suspended_dialogue jsonb,
    version bigint not null default 0 check (version >= 0),
    last_applied_turn_id uuid,
    last_applied_turn_sequence bigint not null default 0 check (last_applied_turn_sequence >= 0),
    expires_at timestamptz not null,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    primary key (actor_user_id, dialogue_scope_key),
    check (active_dialogue is null or octet_length(convert_to(active_dialogue::text, 'utf8')) <= 65536),
    check (suspended_dialogue is null or octet_length(convert_to(suspended_dialogue::text, 'utf8')) <= 65536)
);

alter table public.agent_turn_semantic_checkpoints enable row level security;
alter table public.agent_dialogue_checkpoints enable row level security;

create policy agent_turn_semantic_checkpoints_owner_select on public.agent_turn_semantic_checkpoints
    for select using (actor_user_id = auth.uid());
create policy agent_dialogue_checkpoints_owner_select on public.agent_dialogue_checkpoints
    for select using (actor_user_id = auth.uid());

create or replace function public.save_agent_turn_semantic_checkpoint(
    p_turn_id uuid,
    p_actor_user_id uuid,
    p_dialogue_scope_key text,
    p_turn_sequence bigint,
    p_semantic_version smallint,
    p_semantic_fingerprint text,
    p_semantic_turn jsonb
)
returns public.agent_turn_semantic_checkpoints
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare v_admission public.agent_turn_admissions; v_row public.agent_turn_semantic_checkpoints;
begin
    select * into v_admission from public.agent_turn_admissions a where a.turn_id = p_turn_id for update;
    if not found then raise exception 'Agent turn admission not found' using errcode = 'P0002'; end if;
    if v_admission.actor_user_id <> p_actor_user_id or v_admission.dialogue_scope_key <> p_dialogue_scope_key
       or v_admission.turn_sequence <> p_turn_sequence then
        raise exception 'Agent turn admission identity mismatch' using errcode = '42501';
    end if;
    select * into v_row from public.agent_turn_semantic_checkpoints s where s.turn_id = p_turn_id for update;
    if found then
        if v_row.semantic_fingerprint <> p_semantic_fingerprint then
            raise exception 'Semantic checkpoint conflict' using errcode = 'P0003';
        end if;
        return v_row;
    end if;
    if v_admission.status <> 'processing' then
        raise exception 'Agent turn is not processing' using errcode = 'P0004';
    end if;
    insert into public.agent_turn_semantic_checkpoints (
        turn_id, actor_user_id, dialogue_scope_key, turn_sequence,
        semantic_version, semantic_fingerprint, semantic_turn
    ) values (
        p_turn_id, p_actor_user_id, p_dialogue_scope_key, p_turn_sequence,
        p_semantic_version, p_semantic_fingerprint, p_semantic_turn
    ) returning * into v_row;
    update public.agent_turn_admissions a
       set semantic_checkpoint_version = p_semantic_version, updated_at = now()
     where a.turn_id = p_turn_id;
    return v_row;
end;
$$;

create or replace function public.apply_agent_turn_atomically(
    p_turn_id uuid,
    p_actor_user_id uuid,
    p_dialogue_scope_key text,
    p_turn_sequence bigint,
    p_expected_dialogue_version bigint,
    p_lifecycle text,
    p_active_dialogue jsonb,
    p_suspended_dialogue jsonb,
    p_expires_at timestamptz,
    p_replay_version smallint,
    p_replay jsonb
)
returns table (
    actor_user_id uuid,
    dialogue_scope_key text,
    lifecycle text,
    active_dialogue jsonb,
    suspended_dialogue jsonb,
    version bigint,
    last_applied_turn_id uuid,
    last_applied_turn_sequence bigint,
    expires_at timestamptz,
    replay jsonb,
    replayed boolean
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
    v_admission public.agent_turn_admissions;
    v_existing public.agent_dialogue_checkpoints;
    v_next public.agent_dialogue_checkpoints;
begin
    if p_replay_version <> 1 or octet_length(convert_to(p_replay::text, 'utf8')) > 131072 then
        raise exception 'Invalid Agent Turn replay projection' using errcode = '22023';
    end if;
    select * into v_admission from public.agent_turn_admissions a where a.turn_id = p_turn_id for update;
    if not found then raise exception 'Agent turn admission not found' using errcode = 'P0002'; end if;
    if v_admission.actor_user_id <> p_actor_user_id or v_admission.dialogue_scope_key <> p_dialogue_scope_key
       or v_admission.turn_sequence <> p_turn_sequence then
        raise exception 'Agent turn admission identity mismatch' using errcode = '42501';
    end if;

    select * into v_existing from public.agent_dialogue_checkpoints d
     where d.actor_user_id = p_actor_user_id and d.dialogue_scope_key = p_dialogue_scope_key for update;
    if found and v_existing.last_applied_turn_id = p_turn_id then
        return query select v_existing.actor_user_id, v_existing.dialogue_scope_key, v_existing.lifecycle,
            v_existing.active_dialogue, v_existing.suspended_dialogue, v_existing.version,
            v_existing.last_applied_turn_id, v_existing.last_applied_turn_sequence, v_existing.expires_at,
            v_admission.result_ref, true;
        return;
    end if;
    if found and p_turn_sequence <= v_existing.last_applied_turn_sequence then
        raise exception 'Agent turn sequence is stale' using errcode = 'P0005';
    end if;
    if found and v_existing.version <> p_expected_dialogue_version then
        raise exception 'Agent turn dialogue CAS conflict' using errcode = 'P0004';
    end if;
    if v_admission.status <> 'processing' then
        raise exception 'Agent turn is not processing' using errcode = 'P0004';
    end if;

    if found then
        update public.agent_dialogue_checkpoints d set
            lifecycle = p_lifecycle, active_dialogue = p_active_dialogue,
            suspended_dialogue = p_suspended_dialogue, version = d.version + 1,
            last_applied_turn_id = p_turn_id, last_applied_turn_sequence = p_turn_sequence,
            expires_at = p_expires_at, updated_at = now()
        where d.actor_user_id = p_actor_user_id and d.dialogue_scope_key = p_dialogue_scope_key
        returning * into v_next;
    else
        if p_expected_dialogue_version <> 0 then raise exception 'Agent turn dialogue CAS conflict' using errcode = 'P0004'; end if;
        insert into public.agent_dialogue_checkpoints (
            actor_user_id, dialogue_scope_key, lifecycle, active_dialogue,
            suspended_dialogue, version, last_applied_turn_id,
            last_applied_turn_sequence, expires_at
        ) values (
            p_actor_user_id, p_dialogue_scope_key, p_lifecycle, p_active_dialogue,
            p_suspended_dialogue, 1, p_turn_id, p_turn_sequence, p_expires_at
        ) returning * into v_next;
    end if;
    update public.agent_turn_admissions a set
        status = 'completed', replay_version = p_replay_version,
        result_ref = p_replay, completed_at = now(), updated_at = now()
    where a.turn_id = p_turn_id;
    return query select v_next.actor_user_id, v_next.dialogue_scope_key, v_next.lifecycle,
        v_next.active_dialogue, v_next.suspended_dialogue, v_next.version,
        v_next.last_applied_turn_id, v_next.last_applied_turn_sequence, v_next.expires_at,
        p_replay, false;
end;
$$;

revoke all on function public.save_agent_turn_semantic_checkpoint(uuid, uuid, text, bigint, smallint, text, jsonb) from public, anon, authenticated;
revoke all on function public.apply_agent_turn_atomically(uuid, uuid, text, bigint, bigint, text, jsonb, jsonb, timestamptz, smallint, jsonb) from public, anon, authenticated;
grant execute on function public.save_agent_turn_semantic_checkpoint(uuid, uuid, text, bigint, smallint, text, jsonb) to service_role;
grant execute on function public.apply_agent_turn_atomically(uuid, uuid, text, bigint, bigint, text, jsonb, jsonb, timestamptz, smallint, jsonb) to service_role;
