-- Fix: qualify the INSERT ... RETURNING columns.
--
-- The output column `created_at` is also an implicit PL/pgSQL variable because
-- this function returns a table.  The unqualified `RETURNING id, created_at`
-- therefore raises 42702 (ambiguous_column) before the durable history row is
-- inserted.  Keep the correction isolated and idempotent so it can be applied
-- safely to an already migrated production database.

create or replace function public.persist_agent_conversation_turn(
    p_actor_user_id uuid,
    p_conversation_id uuid,
    p_client_turn_key text,
    p_request_fingerprint text,
    p_input_text text,
    p_input_mode text,
    p_result_kind text,
    p_result jsonb
)
returns table (turn_id uuid, idempotent_replay boolean, created_at timestamptz)
language plpgsql
security invoker
set search_path = public
as $$
declare
    v_existing public.agent_conversation_turns%rowtype;
    v_new_id uuid;
    v_new_created_at timestamptz;
begin
    if not exists (
        select 1
        from public.conversation_participants cp
        where cp.conversation_id = p_conversation_id
          and cp.user_id = p_actor_user_id
    ) then
        raise exception 'Conversation participant required' using errcode = '42501';
    end if;

    if coalesce(length(trim(p_client_turn_key)), 0) = 0
       or coalesce(length(trim(p_input_text)), 0) = 0
       or length(p_input_text) > 12000
       or p_input_mode not in ('text', 'voice', 'reviewed_voice_text')
       or p_result_kind not in ('response', 'plan', 'clarification', 'unsupported', 'read', 'execution')
       or p_request_fingerprint is null
       or p_result is null
       or pg_column_size(p_result) > 131072 then
        raise exception 'Invalid Agent conversation event' using errcode = '22023';
    end if;

    select * into v_existing
    from public.agent_conversation_turns
    where actor_user_id = p_actor_user_id
      and conversation_id = p_conversation_id
      and client_turn_key = trim(p_client_turn_key)
    for update;

    if found then
        if v_existing.request_fingerprint <> p_request_fingerprint then
            raise exception 'Agent turn key reused with different content' using errcode = 'P0003';
        end if;
        return query select v_existing.id, true, v_existing.created_at;
        return;
    end if;

    insert into public.agent_conversation_turns as inserted (
        conversation_id, actor_user_id, client_turn_key, request_fingerprint,
        input_text, input_mode, result_kind, result
    ) values (
        p_conversation_id, p_actor_user_id, trim(p_client_turn_key), p_request_fingerprint,
        trim(p_input_text), p_input_mode, p_result_kind, p_result
    ) on conflict (actor_user_id, conversation_id, client_turn_key) do nothing
      returning inserted.id, inserted.created_at into v_new_id, v_new_created_at;

    if not found then
        select * into v_existing
        from public.agent_conversation_turns
        where actor_user_id = p_actor_user_id
          and conversation_id = p_conversation_id
          and client_turn_key = trim(p_client_turn_key)
        for update;
        if not found then
            raise exception 'Agent conversation event could not be resolved' using errcode = 'P0004';
        end if;
        if v_existing.request_fingerprint <> p_request_fingerprint then
            raise exception 'Agent turn key reused with different content' using errcode = 'P0003';
        end if;
        return query select v_existing.id, true, v_existing.created_at;
        return;
    end if;

    return query select v_new_id, false, v_new_created_at;
end;
$$;

revoke all on function public.persist_agent_conversation_turn(uuid, uuid, text, text, text, text, text, jsonb)
    from public, anon, authenticated;
grant execute on function public.persist_agent_conversation_turn(uuid, uuid, text, text, text, text, text, jsonb)
    to service_role;
