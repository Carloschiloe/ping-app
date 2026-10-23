-- Reset only the current Agent dialogue projection when the user clears the
-- visible Agent chat. Durable turn/admission history remains available for
-- audit and idempotency; the version bump prevents an in-flight stale turn
-- from resurrecting the cleared plan.

create or replace function public.reset_agent_dialogue_checkpoint(
    p_actor_user_id uuid,
    p_dialogue_scope_key text
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
    v_updated boolean;
begin
    if p_dialogue_scope_key is null or length(trim(p_dialogue_scope_key)) = 0
       or length(p_dialogue_scope_key) > 200 then
        raise exception 'Invalid dialogue scope key' using errcode = '22023';
    end if;

    update public.agent_dialogue_checkpoints
       set lifecycle = 'idle',
           active_dialogue = null,
           suspended_dialogue = null,
           version = version + 1,
           expires_at = now() + interval '10 minutes',
           updated_at = now()
     where actor_user_id = p_actor_user_id
       and dialogue_scope_key = trim(p_dialogue_scope_key);

    -- last_applied_turn_id and last_applied_turn_sequence are intentionally
    -- preserved: clearing must not reopen an old idempotency window.

    v_updated := found;
    return v_updated;
end;
$$;

revoke all on function public.reset_agent_dialogue_checkpoint(uuid, text) from public, anon, authenticated;
grant execute on function public.reset_agent_dialogue_checkpoint(uuid, text) to service_role;

-- The user-facing clear operation must hide the projection and reset the
-- dialogue checkpoint in the same transaction. This prevents a partial clear
-- if either side would otherwise fail between two independent API calls.
create or replace function public.clear_agent_conversation_history(
    p_actor_user_id uuid,
    p_conversation_id uuid,
    p_dialogue_scope_key text
)
returns timestamptz
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
    v_cleared_at timestamptz;
begin
    if p_dialogue_scope_key is null or length(trim(p_dialogue_scope_key)) = 0
       or length(p_dialogue_scope_key) > 200
       or (trim(p_dialogue_scope_key) <> p_conversation_id::text
           and trim(p_dialogue_scope_key) <> 'agent:mobile') then
        raise exception 'Invalid dialogue scope key' using errcode = '22023';
    end if;

    if not exists (
        select 1
          from public.conversation_participants cp
         where cp.conversation_id = p_conversation_id
           and cp.user_id = p_actor_user_id
    ) then
        raise exception 'Conversation participant is not authorized' using errcode = '42501';
    end if;

    update public.conversations
       set agent_history_cleared_at = now()
     where id = p_conversation_id
       and deleted_at is null
     returning agent_history_cleared_at into v_cleared_at;

    if v_cleared_at is null then
        raise exception 'Conversation not found' using errcode = 'P0002';
    end if;

    update public.agent_dialogue_checkpoints
       set lifecycle = 'idle',
           active_dialogue = null,
           suspended_dialogue = null,
           version = version + 1,
           expires_at = now() + interval '10 minutes',
           updated_at = now()
     where actor_user_id = p_actor_user_id
       and dialogue_scope_key = trim(p_dialogue_scope_key);

    return v_cleared_at;
end;
$$;

revoke all on function public.clear_agent_conversation_history(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.clear_agent_conversation_history(uuid, uuid, text) to service_role;
