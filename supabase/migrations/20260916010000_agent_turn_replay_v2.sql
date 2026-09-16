-- M-7: add a durable replay version for structured READ results.
-- Version 1 remains valid for every historical response/plan/clarification/
-- unsupported replay. Version 2 is reserved for the new structured READ kind.

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
    if p_replay_version not in (1, 2)
       or octet_length(convert_to(p_replay::text, 'utf8')) > 131072 then
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

revoke all on function public.apply_agent_turn_atomically(uuid, uuid, text, bigint, bigint, text, jsonb, jsonb, timestamptz, smallint, jsonb) from public, anon, authenticated;
grant execute on function public.apply_agent_turn_atomically(uuid, uuid, text, bigint, bigint, text, jsonb, jsonb, timestamptz, smallint, jsonb) to service_role;
