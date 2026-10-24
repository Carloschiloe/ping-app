-- Keep the durable dialogue/admission boundary and the actor-visible Agent
-- history projection in the same Postgres transaction. The existing atomic
-- function remains unchanged for backwards compatibility; these wrappers are
-- used only by the canonical durable HTTP turn path.

create or replace function public.apply_agent_turn_atomically_with_history(
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
    p_replay jsonb,
    p_history_conversation_id uuid,
    p_history_client_turn_key text,
    p_history_request_fingerprint text,
    p_history_input_text text,
    p_history_input_mode text,
    p_history_result_kind text,
    p_history_result jsonb
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
    v_applied record;
begin
    select * into v_applied
    from public.apply_agent_turn_atomically(
        p_turn_id, p_actor_user_id, p_dialogue_scope_key, p_turn_sequence,
        p_expected_dialogue_version, p_lifecycle, p_active_dialogue,
        p_suspended_dialogue, p_expires_at, p_replay_version, p_replay
    );
    if not found then
        raise exception 'Agent turn atomic application returned no row' using errcode = 'P0004';
    end if;

    perform public.persist_agent_conversation_turn(
        p_actor_user_id,
        p_history_conversation_id,
        p_history_client_turn_key,
        p_history_request_fingerprint,
        p_history_input_text,
        p_history_input_mode,
        p_history_result_kind,
        p_history_result
    );

    return query select
        v_applied.actor_user_id,
        v_applied.dialogue_scope_key,
        v_applied.lifecycle,
        v_applied.active_dialogue,
        v_applied.suspended_dialogue,
        v_applied.version,
        v_applied.last_applied_turn_id,
        v_applied.last_applied_turn_sequence,
        v_applied.expires_at,
        v_applied.replay,
        v_applied.replayed;
end;
$$;

create or replace function public.complete_agent_turn_with_history(
    p_turn_id uuid,
    p_actor_user_id uuid,
    p_dialogue_scope_key text,
    p_result_ref jsonb,
    p_history_conversation_id uuid,
    p_history_client_turn_key text,
    p_history_request_fingerprint text,
    p_history_input_text text,
    p_history_input_mode text,
    p_history_result_kind text,
    p_history_result jsonb
)
returns public.agent_turn_admissions
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
    v_completed public.agent_turn_admissions;
begin
    select * into v_completed
    from public.complete_agent_turn_admission(
        p_turn_id, p_actor_user_id, p_dialogue_scope_key, p_result_ref
    );

    perform public.persist_agent_conversation_turn(
        p_actor_user_id,
        p_history_conversation_id,
        p_history_client_turn_key,
        p_history_request_fingerprint,
        p_history_input_text,
        p_history_input_mode,
        p_history_result_kind,
        p_history_result
    );

    return v_completed;
end;
$$;

revoke all on function public.apply_agent_turn_atomically_with_history(
    uuid, uuid, text, bigint, bigint, text, jsonb, jsonb, timestamptz,
    smallint, jsonb, uuid, text, text, text, text, text, jsonb
) from public, anon, authenticated;
grant execute on function public.apply_agent_turn_atomically_with_history(
    uuid, uuid, text, bigint, bigint, text, jsonb, jsonb, timestamptz,
    smallint, jsonb, uuid, text, text, text, text, text, jsonb
) to service_role;

revoke all on function public.complete_agent_turn_with_history(
    uuid, uuid, text, jsonb, uuid, text, text, text, text, text, jsonb
) from public, anon, authenticated;
grant execute on function public.complete_agent_turn_with_history(
    uuid, uuid, text, jsonb, uuid, text, text, text, text, text, jsonb
) to service_role;
