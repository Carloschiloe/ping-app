-- M-7: immutable routing mode for durable turn retries and rollback.
-- Historical rows remain NULL and continue through their pre-M-7 behavior.

alter table public.agent_turn_admissions
    add column if not exists routing_mode text
    check (routing_mode is null or routing_mode in ('legacy', 'read_v4_exact_count'));

create or replace function public.admit_agent_turn_with_routing_mode(
    p_actor_user_id uuid,
    p_dialogue_scope_key text,
    p_client_turn_key text,
    p_request_fingerprint text,
    p_routing_mode text
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
    idempotent_replay boolean,
    routing_mode text
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
    if p_routing_mode not in ('legacy', 'read_v4_exact_count') then
        raise exception 'Invalid Agent turn routing mode' using errcode = '22023';
    end if;
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
        select a.* into v_existing from public.agent_turn_admissions a
         where a.actor_user_id = p_actor_user_id and a.dialogue_scope_key = p_dialogue_scope_key
           and a.client_turn_key = p_client_turn_key for update;
        if found then
            if v_existing.request_fingerprint <> p_request_fingerprint then
                raise exception 'Agent turn idempotency conflict' using errcode = 'P0003';
            end if;
            return query select v_existing.turn_id, v_existing.actor_user_id, v_existing.dialogue_scope_key,
                v_existing.client_turn_key, v_existing.request_fingerprint, v_existing.turn_sequence,
                v_existing.status, v_existing.failure_class, v_existing.result_ref, v_existing.created_at,
                v_existing.updated_at, v_existing.completed_at, v_existing.expires_at, true, v_existing.routing_mode;
            return;
        end if;
    end if;

    insert into public.agent_turn_sequence_allocators (actor_user_id, dialogue_scope_key)
    values (p_actor_user_id, p_dialogue_scope_key)
    on conflict on constraint agent_turn_sequence_allocators_pkey do nothing;
    select a.next_turn_sequence into v_sequence from public.agent_turn_sequence_allocators a
     where a.actor_user_id = p_actor_user_id and a.dialogue_scope_key = p_dialogue_scope_key for update;

    if p_client_turn_key is not null then
        select a.* into v_existing from public.agent_turn_admissions a
         where a.actor_user_id = p_actor_user_id and a.dialogue_scope_key = p_dialogue_scope_key
           and a.client_turn_key = p_client_turn_key for update;
        if found then
            if v_existing.request_fingerprint <> p_request_fingerprint then
                raise exception 'Agent turn idempotency conflict' using errcode = 'P0003';
            end if;
            return query select v_existing.turn_id, v_existing.actor_user_id, v_existing.dialogue_scope_key,
                v_existing.client_turn_key, v_existing.request_fingerprint, v_existing.turn_sequence,
                v_existing.status, v_existing.failure_class, v_existing.result_ref, v_existing.created_at,
                v_existing.updated_at, v_existing.completed_at, v_existing.expires_at, true, v_existing.routing_mode;
            return;
        end if;
    end if;

    update public.agent_turn_sequence_allocators a set next_turn_sequence = v_sequence + 1
     where a.actor_user_id = p_actor_user_id and a.dialogue_scope_key = p_dialogue_scope_key;
    insert into public.agent_turn_admissions (
        actor_user_id, dialogue_scope_key, client_turn_key, request_fingerprint, turn_sequence, routing_mode
    ) values (
        p_actor_user_id, p_dialogue_scope_key, p_client_turn_key, p_request_fingerprint, v_sequence, p_routing_mode
    ) returning public.agent_turn_admissions.turn_id into v_turn_id;

    return query select a.turn_id, a.actor_user_id, a.dialogue_scope_key, a.client_turn_key,
        a.request_fingerprint, a.turn_sequence, a.status, a.failure_class, a.result_ref,
        a.created_at, a.updated_at, a.completed_at, a.expires_at, false, a.routing_mode
      from public.agent_turn_admissions a where a.turn_id = v_turn_id;
end;
$$;

revoke all on function public.admit_agent_turn_with_routing_mode(uuid, text, text, text, text) from public, anon, authenticated;
grant execute on function public.admit_agent_turn_with_routing_mode(uuid, text, text, text, text) to service_role;
