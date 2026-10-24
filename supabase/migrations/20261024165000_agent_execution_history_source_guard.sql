-- Do not execute an authorization with a history binding that cannot resolve
-- to the actor's persisted Agent plan. This prevents a malformed or stale
-- sourceTurnKey from producing a real side effect with an unprojectable
-- execution history.

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

    if p_history_conversation_id is not null then
        if not exists (
            select 1
            from public.conversation_participants cp
            where cp.conversation_id = p_history_conversation_id
              and cp.user_id = p_actor_user_id
        ) then
            raise exception 'Conversation participant required' using errcode = '42501';
        end if;
        if not exists (
            select 1
            from public.agent_conversation_turns act
            join public.conversations c on c.id = act.conversation_id
            where act.actor_user_id = p_actor_user_id
              and act.conversation_id = p_history_conversation_id
              and act.client_turn_key = v_source_key
              and act.result_kind = 'plan'
              and c.deleted_at is null
        ) then
            raise exception 'Source Agent plan was not found' using errcode = 'P0002';
        end if;
    end if;

    select * into v_row
    from public.claim_agent_authorization_for_execution(p_authorization_id, p_actor_user_id);

    if p_history_conversation_id is not null then
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

revoke all on function public.claim_agent_authorization_for_execution_with_history(uuid, uuid, uuid, text)
    from public, anon, authenticated;
grant execute on function public.claim_agent_authorization_for_execution_with_history(uuid, uuid, uuid, text)
    to service_role;
