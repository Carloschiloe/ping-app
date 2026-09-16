-- M-7: reconcile an unknown response from apply_agent_turn_atomically.
-- This RPC is deliberately separate from orchestration and never interprets,
-- executes, or reapplies a turn. It takes the same admission -> dialogue lock
-- order as apply_agent_turn_atomically.

create or replace function public.reconcile_agent_turn_application(
    p_turn_id uuid,
    p_actor_user_id uuid,
    p_dialogue_scope_key text,
    p_turn_sequence bigint
)
returns table (
    reconciliation_status text,
    turn_id uuid,
    actor_user_id uuid,
    dialogue_scope_key text,
    turn_sequence bigint,
    admission_status text,
    failure_class text,
    result_ref jsonb,
    last_applied_turn_id uuid,
    last_applied_turn_sequence bigint
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
    v_admission public.agent_turn_admissions;
    v_last_applied_turn_id uuid;
    v_last_applied_turn_sequence bigint := 0;
begin
    select * into v_admission
      from public.agent_turn_admissions a
     where a.turn_id = p_turn_id
     for update;
    if not found then
        raise exception 'Agent turn admission not found' using errcode = 'P0002';
    end if;
    if v_admission.actor_user_id <> p_actor_user_id
       or v_admission.dialogue_scope_key <> p_dialogue_scope_key
       or v_admission.turn_sequence <> p_turn_sequence then
        raise exception 'Agent turn admission identity mismatch' using errcode = '42501';
    end if;

    -- Keep the exact lock order used by atomic application.
    select d.last_applied_turn_id, d.last_applied_turn_sequence
      into v_last_applied_turn_id, v_last_applied_turn_sequence
      from public.agent_dialogue_checkpoints d
     where d.actor_user_id = p_actor_user_id
       and d.dialogue_scope_key = p_dialogue_scope_key
     for update;

    if v_admission.status = 'completed'
       and v_last_applied_turn_id = v_admission.turn_id
       and v_last_applied_turn_sequence = v_admission.turn_sequence then
        return query select 'committed'::text, v_admission.turn_id,
            v_admission.actor_user_id, v_admission.dialogue_scope_key,
            v_admission.turn_sequence, v_admission.status,
            v_admission.failure_class, v_admission.result_ref,
            v_last_applied_turn_id,
            v_last_applied_turn_sequence;
        return;
    end if;

    if v_admission.status = 'completed' then
        return query select 'uncertain'::text, v_admission.turn_id,
            v_admission.actor_user_id, v_admission.dialogue_scope_key,
            v_admission.turn_sequence, v_admission.status,
            v_admission.failure_class, v_admission.result_ref,
            v_last_applied_turn_id,
            v_last_applied_turn_sequence;
        return;
    end if;

    if v_admission.status = 'failed' then
        return query select case when v_admission.failure_class = 'terminal'
            then 'terminal_failure' else 'retryable_failure' end,
            v_admission.turn_id, v_admission.actor_user_id,
            v_admission.dialogue_scope_key, v_admission.turn_sequence,
            v_admission.status, v_admission.failure_class,
            v_admission.result_ref, v_last_applied_turn_id,
            v_last_applied_turn_sequence;
        return;
    end if;

    if v_last_applied_turn_sequence >= v_admission.turn_sequence then
        -- A later turn has advanced the scope. Reclaiming this turn would be
        -- stale and could not preserve dialogue ordering, so make the
        -- non-application terminal and explicit.
        update public.agent_turn_admissions
           set status = 'failed', failure_class = 'terminal',
               result_ref = jsonb_build_object('kind', 'superseded_turn'),
               updated_at = now()
         where public.agent_turn_admissions.turn_id = v_admission.turn_id;
        return query select 'superseded'::text, v_admission.turn_id,
            v_admission.actor_user_id, v_admission.dialogue_scope_key,
            v_admission.turn_sequence, 'failed'::text, 'terminal'::text,
            jsonb_build_object('kind', 'superseded_turn'),
            v_last_applied_turn_id,
            v_last_applied_turn_sequence;
        return;
    end if;

    if v_admission.status = 'accepted' then
        return query select 'not_applied'::text, v_admission.turn_id,
            v_admission.actor_user_id, v_admission.dialogue_scope_key,
            v_admission.turn_sequence, v_admission.status,
            v_admission.failure_class, v_admission.result_ref,
            v_last_applied_turn_id,
            v_last_applied_turn_sequence;
        return;
    end if;

    -- The row is processing, no dialogue application for this or a later
    -- sequence exists, and the admission lock excludes an apply transaction.
    -- Transition to the existing durable retryable state; the normal claim
    -- RPC remains the only path allowed to process it again.
    update public.agent_turn_admissions
       set status = 'failed', failure_class = 'retryable',
           result_ref = jsonb_build_object('kind', 'reconciliation_retryable'),
           updated_at = now()
     where public.agent_turn_admissions.turn_id = v_admission.turn_id;
    return query select 'retryable_recovery'::text, v_admission.turn_id,
        v_admission.actor_user_id, v_admission.dialogue_scope_key,
        v_admission.turn_sequence, 'failed'::text, 'retryable'::text,
        jsonb_build_object('kind', 'reconciliation_retryable'),
        v_last_applied_turn_id,
        v_last_applied_turn_sequence;
end;
$$;

revoke all on function public.reconcile_agent_turn_application(uuid, uuid, text, bigint) from public, anon, authenticated;
grant execute on function public.reconcile_agent_turn_application(uuid, uuid, text, bigint) to service_role;
