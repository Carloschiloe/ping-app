\set ON_ERROR_STOP on

begin;

create or replace function pg_temp.assert_true(p_condition boolean, p_message text)
returns void
language plpgsql
as $$
begin
    if not coalesce(p_condition, false) then
        raise exception 'M-4 assertion failed: %', p_message;
    end if;
end;
$$;

-- ─── Fixtures ───────────────────────────────────────────────────────────────
insert into auth.users (id, email)
values
    ('a1a1a1a1-a1a1-4a1a-8a1a-a1a1a1a1a1a1', 'm4-carlos@example.invalid'),
    ('a2a2a2a2-a2a2-4a2a-8a2a-a2a2a2a2a2a2', 'm4-outsider@example.invalid');

insert into public.agent_authorizations (
    id, actor_user_id, plan_digest, objective_type, frozen_steps, authorized_step_ids,
    confirmation_level, status, expires_at
) values
    -- AUTH_VALID: not yet claimed, not expired.
    ('b1b1b1b1-b1b1-4b1b-8b1b-b1b1b1b1b1b1', 'a1a1a1a1-a1a1-4a1a-8a1a-a1a1a1a1a1a1',
     repeat('a', 64), 'communicate_message', '[]'::jsonb, array['step-1', 'step-2', 'step-3'],
     'explicit', 'authorized', now() + interval '5 minutes'),
    -- AUTH_EXPIRED: authorized but TTL already elapsed.
    ('b2b2b2b2-b2b2-4b2b-8b2b-b2b2b2b2b2b2', 'a1a1a1a1-a1a1-4a1a-8a1a-a1a1a1a1a1a1',
     repeat('b', 64), 'communicate_message', '[]'::jsonb, array['step-1'],
     'explicit', 'authorized', now() - interval '1 minute'),
    -- AUTH_REVOKED: about to be revoked before any claim.
    ('b3b3b3b3-b3b3-4b3b-8b3b-b3b3b3b3b3b3', 'a1a1a1a1-a1a1-4a1a-8a1a-a1a1a1a1a1a1',
     repeat('c', 64), 'communicate_message', '[]'::jsonb, array['step-1'],
     'explicit', 'authorized', now() + interval '5 minutes');

-- ─── RLS (defense in depth, sección 57): owner reads, outsider does not ────
set local role authenticated;
select set_config('request.jwt.claim.sub', 'a1a1a1a1-a1a1-4a1a-8a1a-a1a1a1a1a1a1', true);
select count(*)::int as owner_visible
  from public.agent_authorizations
 where id = 'b1b1b1b1-b1b1-4b1b-8b1b-b1b1b1b1b1b1' \gset
reset role;
select pg_temp.assert_true(:'owner_visible'::int = 1, 'owner must read their own authorization');

set local role authenticated;
select set_config('request.jwt.claim.sub', 'a2a2a2a2-a2a2-4a2a-8a2a-a2a2a2a2a2a2', true);
select count(*)::int as outsider_visible
  from public.agent_authorizations
 where id = 'b1b1b1b1-b1b1-4b1b-8b1b-b1b1b1b1b1b1' \gset
reset role;
select pg_temp.assert_true(:'outsider_visible'::int = 0, 'outsider must never read another actor authorization (RLS)');

set local role authenticated;
select set_config('request.jwt.claim.sub', 'a2a2a2a2-a2a2-4a2a-8a2a-a2a2a2a2a2a2', true);
do $$
begin
    insert into public.agent_authorizations (
        actor_user_id, plan_digest, objective_type, frozen_steps, authorized_step_ids,
        confirmation_level, expires_at
    ) values (
        'a2a2a2a2-a2a2-4a2a-8a2a-a2a2a2a2a2a2', repeat('d', 64), 'communicate_message',
        '[]'::jsonb, array['step-1'], 'explicit', now() + interval '5 minutes'
    );
    raise exception 'authenticated unexpectedly inserted an authorization directly';
exception when insufficient_privilege then
    null; -- expected: only service_role/RPC may write (sección 74/75)
end;
$$;
reset role;

-- ─── Unknown authorization -> P0002, never a generic 500 (sección 50) ──────
do $$
begin
    perform public.claim_agent_authorization_for_execution(
        '00000000-0000-4000-8000-000000000000'::uuid, 'a1a1a1a1-a1a1-4a1a-8a1a-a1a1a1a1a1a1'::uuid
    );
    raise exception 'nonexistent authorization unexpectedly claimed';
exception when no_data_found then
    null;
end;
$$;

-- ─── Wrong actor -> 42501, regardless of the authorization's real status ───
-- (must never leak "found but wrong owner" vs "found and consumed" through
-- different codes -- sección 62 D: a different actor is denied uniformly.)
do $$
begin
    perform public.claim_agent_authorization_for_execution(
        'b1b1b1b1-b1b1-4b1b-8b1b-b1b1b1b1b1b1'::uuid, 'a2a2a2a2-a2a2-4a2a-8a2a-a2a2a2a2a2a2'::uuid
    );
    raise exception 'outsider unexpectedly claimed another actor authorization';
exception when insufficient_privilege then
    null;
end;
$$;

-- ─── Real consumption (sección 6/34): authorized -> consumed, exactly once ─
select (public.claim_agent_authorization_for_execution(
    'b1b1b1b1-b1b1-4b1b-8b1b-b1b1b1b1b1b1'::uuid, 'a1a1a1a1-a1a1-4a1a-8a1a-a1a1a1a1a1a1'::uuid
)).status as claim1_status,
(public.claim_agent_authorization_for_execution(
    'b1b1b1b1-b1b1-4b1b-8b1b-b1b1b1b1b1b1'::uuid, 'a1a1a1a1-a1a1-4a1a-8a1a-a1a1a1a1a1a1'::uuid
)).consumed_at as claim1_consumed_at \gset

select pg_temp.assert_true(:'claim1_status' = 'consumed', 'first claim must consume the authorization');

-- Idempotent replay (sección 34/62 B): a second claim of the SAME
-- authorization by the SAME actor must NEVER re-issue a fresh validity
-- window -- consumed_at must stay byte-identical.
select (public.claim_agent_authorization_for_execution(
    'b1b1b1b1-b1b1-4b1b-8b1b-b1b1b1b1b1b1'::uuid, 'a1a1a1a1-a1a1-4a1a-8a1a-a1a1a1a1a1a1'::uuid
)).status as claim2_status,
(public.claim_agent_authorization_for_execution(
    'b1b1b1b1-b1b1-4b1b-8b1b-b1b1b1b1b1b1'::uuid, 'a1a1a1a1-a1a1-4a1a-8a1a-a1a1a1a1a1a1'::uuid
)).consumed_at as claim2_consumed_at \gset

select pg_temp.assert_true(:'claim2_status' = 'consumed', 'replayed claim must remain consumed, never revert');
select pg_temp.assert_true(:'claim1_consumed_at' = :'claim2_consumed_at', 'replayed claim must NEVER re-issue a new consumed_at');

-- A different actor, now against an ALREADY-CONSUMED row, must still be
-- denied by ownership, not by a status-specific message (no state leak).
do $$
begin
    perform public.claim_agent_authorization_for_execution(
        'b1b1b1b1-b1b1-4b1b-8b1b-b1b1b1b1b1b1'::uuid, 'a2a2a2a2-a2a2-4a2a-8a2a-a2a2a2a2a2a2'::uuid
    );
    raise exception 'outsider unexpectedly claimed a consumed authorization';
exception when insufficient_privilege then
    null;
end;
$$;

-- ─── Revocation (sección 33): only before consumption ──────────────────────
select (public.revoke_agent_authorization(
    'b3b3b3b3-b3b3-4b3b-8b3b-b3b3b3b3b3b3'::uuid, 'a1a1a1a1-a1a1-4a1a-8a1a-a1a1a1a1a1a1'::uuid
)).status as revoke_status \gset
select pg_temp.assert_true(:'revoke_status' = 'revoked', 'revocation before consumption must succeed');

do $$
begin
    perform public.claim_agent_authorization_for_execution(
        'b3b3b3b3-b3b3-4b3b-8b3b-b3b3b3b3b3b3'::uuid, 'a1a1a1a1-a1a1-4a1a-8a1a-a1a1a1a1a1a1'::uuid
    );
    raise exception 'revoked authorization unexpectedly claimed';
exception when insufficient_privilege then
    null;
end;
$$;

-- Revoking an already-consumed authorization must be rejected (sección 33:
-- "cannot retroactively undo" once a real execution attempt has begun).
do $$
begin
    perform public.revoke_agent_authorization(
        'b1b1b1b1-b1b1-4b1b-8b1b-b1b1b1b1b1b1'::uuid, 'a1a1a1a1-a1a1-4a1a-8a1a-a1a1a1a1a1a1'::uuid
    );
    raise exception 'consumed authorization unexpectedly revoked';
exception when raise_exception then
    if sqlerrm not like '%already consumed%' then
        raise;
    end if;
end;
$$;

-- ─── Expiry (sección 32/62 C): TTL enforced server-side, clock-independent ─
do $$
begin
    perform public.claim_agent_authorization_for_execution(
        'b2b2b2b2-b2b2-4b2b-8b2b-b2b2b2b2b2b2'::uuid, 'a1a1a1a1-a1a1-4a1a-8a1a-a1a1a1a1a1a1'::uuid
    );
    raise exception 'expired authorization unexpectedly claimed';
exception when raise_exception then
    if sqlerrm not like '%expired%' then
        raise;
    end if;
end;
$$;
-- Expiry is derived live from expires_at, never cached (sección 32) -- a
-- raise can never persist its own preceding UPDATE within the same
-- statement (no autonomous transactions in plpgsql), so this checks the
-- REAL guarantee instead: the row's stored status is untouched ('authorized'),
-- yet a second, independent claim attempt is STILL denied identically,
-- proving enforcement never depends on a one-time side effect.
select pg_temp.assert_true(
    (select status from public.agent_authorizations where id = 'b2b2b2b2-b2b2-4b2b-8b2b-b2b2b2b2b2b2') = 'authorized',
    'expiry must be enforced without requiring a persisted status flip'
);
do $$
begin
    perform public.claim_agent_authorization_for_execution(
        'b2b2b2b2-b2b2-4b2b-8b2b-b2b2b2b2b2b2'::uuid, 'a1a1a1a1-a1a1-4a1a-8a1a-a1a1a1a1a1a1'::uuid
    );
    raise exception 'already-expired authorization unexpectedly claimed a second time';
exception when raise_exception then
    if sqlerrm not like '%expired%' then
        raise;
    end if;
end;
$$;

-- ─── Execution step claiming: create-or-reuse atomicity (sección 20/53/67) ─
select
    (r).is_new_attempt as a_is_new,
    ((r).execution->>'status') as a_status,
    ((r).execution->>'id') as a_id
  from public.claim_agent_execution_step(
        'b1b1b1b1-b1b1-4b1b-8b1b-b1b1b1b1b1b1'::uuid, 'a1a1a1a1-a1a1-4a1a-8a1a-a1a1a1a1a1a1'::uuid,
        'step-1', 'send_message', 1
       ) as r \gset

select pg_temp.assert_true(:'a_is_new'::boolean = true, 'first claim of a fresh step must be a new attempt');
select pg_temp.assert_true(:'a_status' = 'running', 'a freshly-claimed step must be running');

-- A second, concurrent-shaped claim for the SAME (authorization,step) while
-- it is still 'running' must NEVER create a second row nor re-signal a new
-- attempt (sección 53 J / 62 G: at most one real side effect in flight).
select
    (r).is_new_attempt as b_is_new,
    ((r).execution->>'id') as b_id
  from public.claim_agent_execution_step(
        'b1b1b1b1-b1b1-4b1b-8b1b-b1b1b1b1b1b1'::uuid, 'a1a1a1a1-a1a1-4a1a-8a1a-a1a1a1a1a1a1'::uuid,
        'step-1', 'send_message', 1
       ) as r \gset

select pg_temp.assert_true(:'b_is_new'::boolean = false, 'a concurrent/duplicate claim of a running step must never be a new attempt');
select pg_temp.assert_true(:'b_id' = :'a_id', 'must be the SAME execution row, never a second one');
select pg_temp.assert_true(
    (select count(*)::int from public.agent_executions
      where authorization_id = 'b1b1b1b1-b1b1-4b1b-8b1b-b1b1b1b1b1b1' and step_id = 'step-1') = 1,
    'the real unique constraint must guarantee exactly one execution row for this step'
);

-- Completion (succeeded) + replay-after-terminal-success must never re-run
-- the tool (sección 34/62 G: succeeded is a terminal, non-retriable state).
select (public.complete_agent_execution_step(
    :'a_id'::uuid, 'succeeded',
    '{"createdEntityRefs":[{"kind":"message","id":"m-1"}]}'::jsonb
)).status as c_completed_status \gset

select pg_temp.assert_true(:'c_completed_status' = 'succeeded', 'completion must persist the real terminal status');

select
    (r).is_new_attempt as d_is_new,
    ((r).execution->>'status') as d_status
  from public.claim_agent_execution_step(
        'b1b1b1b1-b1b1-4b1b-8b1b-b1b1b1b1b1b1'::uuid, 'a1a1a1a1-a1a1-4a1a-8a1a-a1a1a1a1a1a1'::uuid,
        'step-1', 'send_message', 1
       ) as r \gset

select pg_temp.assert_true(:'d_is_new'::boolean = false, 'a succeeded step must never be re-claimed as a new attempt');
select pg_temp.assert_true(:'d_status' = 'succeeded', 'a succeeded step must remain succeeded on replay');

-- ─── Retry semantics (sección 21): failed_retryable IS reclaimable ─────────
select ((r).execution->>'id') as e_id
  from public.claim_agent_execution_step(
        'b1b1b1b1-b1b1-4b1b-8b1b-b1b1b1b1b1b1'::uuid, 'a1a1a1a1-a1a1-4a1a-8a1a-a1a1a1a1a1a1'::uuid,
        'step-2', 'create_commitment', 1
       ) as r \gset

select (public.complete_agent_execution_step(
    :'e_id'::uuid, 'failed_retryable', null, 'transient_failure'
)).retry_count as f_retry_count_after_failure \gset
select pg_temp.assert_true(:'f_retry_count_after_failure'::int = 1, 'a failed_retryable completion must increment retry_count');

select
    (r).is_new_attempt as g_is_new,
    ((r).execution->>'status') as g_status,
    ((r).execution->>'id') as g_id
  from public.claim_agent_execution_step(
        'b1b1b1b1-b1b1-4b1b-8b1b-b1b1b1b1b1b1'::uuid, 'a1a1a1a1-a1a1-4a1a-8a1a-a1a1a1a1a1a1'::uuid,
        'step-2', 'create_commitment', 1
       ) as r \gset

select pg_temp.assert_true(:'g_is_new'::boolean = true, 'a failed_retryable step must be re-claimable as a genuine new attempt');
select pg_temp.assert_true(:'g_status' = 'running', 'a re-claimed retry must be running again');
select pg_temp.assert_true(:'g_id' = :'e_id', 'a retry must reuse the SAME execution row, never a second one');

select (public.complete_agent_execution_step(
    :'e_id'::uuid, 'succeeded', '{"createdEntityRefs":[{"kind":"commitment","id":"c-1"}]}'::jsonb
)).retry_count as h_retry_count_after_success \gset
select pg_temp.assert_true(:'h_retry_count_after_success'::int = 1, 'a subsequent success must NOT further increment retry_count');

-- ─── Terminal failure (sección 21): failed_terminal is NEVER reclaimable ───
select ((r).execution->>'id') as i_id
  from public.claim_agent_execution_step(
        'b1b1b1b1-b1b1-4b1b-8b1b-b1b1b1b1b1b1'::uuid, 'a1a1a1a1-a1a1-4a1a-8a1a-a1a1a1a1a1a1'::uuid,
        'step-3', 'reschedule_commitment', 1
       ) as r \gset
select (public.complete_agent_execution_step(
    :'i_id'::uuid, 'failed_terminal', null, 'entity_changed'
)).status as j_terminal_status \gset
select pg_temp.assert_true(:'j_terminal_status' = 'failed_terminal', 'terminal failure must persist as failed_terminal');

select
    (r).is_new_attempt as k_is_new,
    ((r).execution->>'status') as k_status
  from public.claim_agent_execution_step(
        'b1b1b1b1-b1b1-4b1b-8b1b-b1b1b1b1b1b1'::uuid, 'a1a1a1a1-a1a1-4a1a-8a1a-a1a1a1a1a1a1'::uuid,
        'step-3', 'reschedule_commitment', 1
       ) as r \gset

select pg_temp.assert_true(:'k_is_new'::boolean = false, 'a failed_terminal step must NEVER be reclaimed as a new attempt');
select pg_temp.assert_true(:'k_status' = 'failed_terminal', 'a failed_terminal step must stay failed_terminal forever');

-- ─── Raw uniqueness proof, independent of the RPC's own branching logic ────
do $$
begin
    insert into public.agent_executions (authorization_id, step_id, actor_user_id, tool_id, tool_version)
    values ('b1b1b1b1-b1b1-4b1b-8b1b-b1b1b1b1b1b1', 'step-1', 'a1a1a1a1-a1a1-4a1a-8a1a-a1a1a1a1a1a1', 'send_message', 1);
    raise exception 'duplicate (authorization_id, step_id) unexpectedly inserted';
exception when unique_violation then
    null;
end;
$$;

-- ─── complete_agent_execution_step error taxonomy (sección 50) ─────────────
-- (psql variable interpolation does not reach inside dollar-quoted do
-- blocks -- the execution id is re-derived here instead of via :'a_id'.)
do $$
declare
    v_id uuid;
begin
    select id into v_id from public.agent_executions
     where authorization_id = 'b1b1b1b1-b1b1-4b1b-8b1b-b1b1b1b1b1b1' and step_id = 'step-1';
    perform public.complete_agent_execution_step(v_id, 'bogus_status');
    raise exception 'invalid terminal status unexpectedly accepted';
exception when invalid_parameter_value then
    null;
end;
$$;

do $$
begin
    perform public.complete_agent_execution_step('00000000-0000-4000-8000-000000000000'::uuid, 'succeeded');
    raise exception 'completion of a nonexistent execution unexpectedly succeeded';
exception when no_data_found then
    null;
end;
$$;

-- ─── RLS on agent_executions (sección 57) ───────────────────────────────────
set local role authenticated;
select set_config('request.jwt.claim.sub', 'a1a1a1a1-a1a1-4a1a-8a1a-a1a1a1a1a1a1', true);
select count(*)::int as owner_exec_visible
  from public.agent_executions
 where authorization_id = 'b1b1b1b1-b1b1-4b1b-8b1b-b1b1b1b1b1b1' \gset
reset role;
select pg_temp.assert_true(:'owner_exec_visible'::int = 3, 'owner must read all 3 of their own execution rows');

set local role authenticated;
select set_config('request.jwt.claim.sub', 'a2a2a2a2-a2a2-4a2a-8a2a-a2a2a2a2a2a2', true);
select count(*)::int as outsider_exec_visible
  from public.agent_executions
 where authorization_id = 'b1b1b1b1-b1b1-4b1b-8b1b-b1b1b1b1b1b1' \gset
reset role;
select pg_temp.assert_true(:'outsider_exec_visible'::int = 0, 'outsider must never read another actor execution rows (RLS)');

select 'M-4 PostgreSQL Authorization + Execution integration passed' as result;

rollback;
