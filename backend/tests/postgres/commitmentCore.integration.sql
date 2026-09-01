\set ON_ERROR_STOP on

begin;

create or replace function pg_temp.assert_true(p_condition boolean, p_message text)
returns void
language plpgsql
as $$
begin
    if not coalesce(p_condition, false) then
        raise exception 'C-2 assertion failed: %', p_message;
    end if;
end;
$$;

insert into auth.users (id, email)
values
    ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'c2-owner@example.invalid'),
    ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'c2-participant@example.invalid'),
    ('cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'c2-unrelated@example.invalid');

insert into public.conversations (id, conversation_type, name, created_by)
values (
    'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
    'group',
    'C-2 PostgreSQL integration',
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
);

insert into public.conversation_participants (conversation_id, user_id, role)
values
    ('dddddddd-dddd-4ddd-8ddd-dddddddddddd', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'admin'),
    ('dddddddd-dddd-4ddd-8ddd-dddddddddddd', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'member');

insert into public.messages (id, conversation_id, sender_id, content, metadata)
values (
    'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
    'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    'Enviar informe C-2 manana',
    jsonb_build_object(
        'suggestedTask',
        jsonb_build_object(
            'hasCommitment', true,
            'title', 'Enviar informe C-2',
            'dueAt', '2026-09-01T12:00:00Z'
        )
    )
);

set local role service_role;
select (
    public.create_commitment_proposal_with_evidence(
        'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        jsonb_build_object(
            'proposed_responsible_user_id', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
            'conversation_id', 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
            'source_message_id', 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
            'source_kind', 'ai_suggestion',
            'title', 'Enviar informe C-2',
            'description', 'Descripcion original',
            'due_at', '2026-09-01T12:00:00Z',
            'type', 'task',
            'priority', 'medium',
            'expected_result', 'Informe recibido'
        )
    )
).id as proposal_id \gset

select (
    public.confirm_commitment_proposal(
        :'proposal_id'::uuid,
        'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
    )
).id as commitment_id \gset
reset role;

select pg_temp.assert_true(
    exists (
        select 1
        from public.commitments
        where id = :'commitment_id'::uuid
          and proposal_id = :'proposal_id'::uuid
          and message_id = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'
          and owner_user_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
          and assigned_to_user_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
          and status = 'accepted'
    ),
    'proposal confirmation must preserve source/proposal links'
);
select pg_temp.assert_true(
    (select content from public.messages where id = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee')
        = 'Enviar informe C-2 manana',
    'source message must remain immutable'
);
select pg_temp.assert_true(
    (select status from public.commitment_proposals where id = :'proposal_id'::uuid) = 'confirmed',
    'proposal must be confirmed'
);
select pg_temp.assert_true(
    (select count(*) from public.commitment_proposal_events where proposal_id = :'proposal_id'::uuid) >= 2,
    'proposal must have proposal and confirmation events'
);
select pg_temp.assert_true(
    exists (select 1 from public.commitment_events where commitment_id = :'commitment_id'::uuid and event_type = 'created'),
    'Commitment creation event must exist'
);
select pg_temp.assert_true(
    exists (select 1 from public.commitment_audit_records where commitment_id = :'commitment_id'::uuid),
    'Commitment creation audit must exist'
);

-- A (owner) and B (assignee/participant) can read. C cannot.
set local role authenticated;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', true);
select count(*)::int as owner_visible from public.commitments where id = :'commitment_id'::uuid \gset
reset role;
select pg_temp.assert_true(:'owner_visible'::int = 1, 'owner must read the Commitment');

set local role authenticated;
select set_config('request.jwt.claim.sub', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', true);
select count(*)::int as participant_visible from public.commitments where id = :'commitment_id'::uuid \gset
reset role;
select pg_temp.assert_true(:'participant_visible'::int = 1, 'authorized assignee must read the Commitment');

set local role authenticated;
select set_config('request.jwt.claim.sub', 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', true);
select count(*)::int as unrelated_visible from public.commitments where id = :'commitment_id'::uuid \gset
reset role;
select pg_temp.assert_true(:'unrelated_visible'::int = 0, 'unrelated user must not read the Commitment');

select pg_temp.assert_true(
    not has_table_privilege('anon', 'public.commitments', 'INSERT,UPDATE,DELETE')
    and not has_table_privilege('authenticated', 'public.commitments', 'INSERT,UPDATE,DELETE'),
    'API roles must not have direct Commitment write privileges'
);
select pg_temp.assert_true(
    not has_function_privilege('anon', 'public.edit_commitment_with_evidence(uuid,uuid,jsonb)', 'EXECUTE')
    and not has_function_privilege('authenticated', 'public.edit_commitment_with_evidence(uuid,uuid,jsonb)', 'EXECUTE')
    and has_function_privilege('service_role', 'public.edit_commitment_with_evidence(uuid,uuid,jsonb)', 'EXECUTE'),
    'edit RPC execution must be service_role-only'
);
select pg_temp.assert_true(
    not has_function_privilege('anon', 'public.archive_commitment_with_evidence(uuid,uuid)', 'EXECUTE')
    and not has_function_privilege('authenticated', 'public.archive_commitment_with_evidence(uuid,uuid)', 'EXECUTE')
    and has_function_privilege('service_role', 'public.archive_commitment_with_evidence(uuid,uuid)', 'EXECUTE'),
    'archive RPC execution must be service_role-only'
);

-- Authenticated clients cannot call write RPCs or update the aggregate directly.
set local role authenticated;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', true);
do $$
begin
    begin
        update public.commitments set title = 'BYPASS' where title = 'Enviar informe C-2';
        raise exception 'direct owner update unexpectedly succeeded';
    exception when insufficient_privilege then
        null;
    end;
    begin
        perform public.edit_commitment_with_evidence(
            '00000000-0000-4000-8000-000000000000',
            'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
            '{"title":"BYPASS"}'::jsonb
        );
        raise exception 'authenticated RPC call unexpectedly succeeded';
    exception when insufficient_privilege then
        null;
    end;
end;
$$;
reset role;

select count(*)::int as edit_events_before
from public.commitment_events where commitment_id = :'commitment_id'::uuid \gset
select count(*)::int as edit_audits_before
from public.commitment_audit_records where commitment_id = :'commitment_id'::uuid \gset

set local role service_role;
select (public.edit_commitment_with_evidence(
    :'commitment_id'::uuid,
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    jsonb_build_object(
        'title', 'Informe C-2 editado',
        'description', 'Descripcion editada',
        'due_at', '2026-09-02T15:30:00Z',
        'priority', 'high',
        'expected_result', 'Informe aprobado'
    )
)).id;
reset role;

select pg_temp.assert_true(
    exists (
        select 1 from public.commitments
        where id = :'commitment_id'::uuid
          and title = 'Informe C-2 editado'
          and description = 'Descripcion editada'
          and due_at = '2026-09-02T15:30:00Z'::timestamptz
          and priority = 'high'
          and expected_result = 'Informe aprobado'
    ),
    'allowed fields must be edited'
);
select pg_temp.assert_true(
    (select count(*) from public.commitment_events where commitment_id = :'commitment_id'::uuid)
        = :'edit_events_before'::int + 1,
    'edit must add exactly one event'
);
select pg_temp.assert_true(
    (select count(*) from public.commitment_audit_records where commitment_id = :'commitment_id'::uuid)
        = :'edit_audits_before'::int + 1,
    'edit must add exactly one audit record'
);

-- Failed edits and unauthorized actors must roll back row/event/audit together.
select count(*)::int as failed_edit_events_before
from public.commitment_events where commitment_id = :'commitment_id'::uuid \gset
select count(*)::int as failed_edit_audits_before
from public.commitment_audit_records where commitment_id = :'commitment_id'::uuid \gset
do $$
begin
    begin
        perform public.edit_commitment_with_evidence(
            (select id from public.commitments where title = 'Informe C-2 editado'),
            'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
            '{"priority":"critical"}'::jsonb
        );
        raise exception 'invalid priority unexpectedly succeeded';
    exception when check_violation then
        null;
    end;
    begin
        perform public.edit_commitment_with_evidence(
            (select id from public.commitments where title = 'Informe C-2 editado'),
            'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
            '{"title":"Unauthorized"}'::jsonb
        );
        raise exception 'unrelated edit unexpectedly succeeded';
    exception when insufficient_privilege then
        null;
    end;
end;
$$;
select pg_temp.assert_true(
    (select priority from public.commitments where id = :'commitment_id'::uuid) = 'high'
    and (select count(*) from public.commitment_events where commitment_id = :'commitment_id'::uuid)
        = :'failed_edit_events_before'::int
    and (select count(*) from public.commitment_audit_records where commitment_id = :'commitment_id'::uuid)
        = :'failed_edit_audits_before'::int,
    'failed edit must leave no state or evidence residue'
);

-- Lifecycle: follow-up -> postpone/counter -> accept -> invalid resolve ->
-- resolve -> reopen -> cancel -> reopen.
set local role service_role;
select (public.apply_commitment_transition_with_evidence(
    :'commitment_id'::uuid,
    'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    'accepted',
    jsonb_build_object('follow_up_at', '2026-09-03T10:00:00Z', 'next_action', 'Confirmar recepcion'),
    'follow_up_scheduled',
    jsonb_build_object('followUpAt', '2026-09-03T10:00:00Z')
)).id;
select (public.apply_commitment_transition_with_evidence(
    :'commitment_id'::uuid,
    'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    'accepted',
    jsonb_build_object('status', 'counter_proposal', 'proposed_due_at', '2026-09-04T12:00:00Z'),
    'counter_proposed',
    jsonb_build_object('proposedDueAt', '2026-09-04T12:00:00Z')
)).id;
select (public.apply_commitment_transition_with_evidence(
    :'commitment_id'::uuid,
    'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    'counter_proposal',
    jsonb_build_object(
        'status', 'accepted',
        'assigned_to_user_id', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
        'due_at', '2026-09-04T12:00:00Z',
        'proposed_due_at', null
    ),
    'accepted',
    '{}'::jsonb
)).id;
reset role;

select count(*)::int as invalid_resolve_events_before
from public.commitment_events where commitment_id = :'commitment_id'::uuid \gset
do $$
begin
    begin
        perform public.apply_commitment_transition_with_evidence(
            (select id from public.commitments where title = 'Informe C-2 editado'),
            'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
            'accepted',
            jsonb_build_object('status', 'resolved', 'resolved_at', now()),
            'resolved',
            '{}'::jsonb
        );
        raise exception 'resolve without result unexpectedly succeeded';
    exception when check_violation then
        null;
    end;
end;
$$;
select pg_temp.assert_true(
    (select status from public.commitments where id = :'commitment_id'::uuid) = 'accepted'
    and (select count(*) from public.commitment_events where commitment_id = :'commitment_id'::uuid)
        = :'invalid_resolve_events_before'::int,
    'invalid resolution must roll back state and event'
);

set local role service_role;
select (public.apply_commitment_transition_with_evidence(
    :'commitment_id'::uuid,
    'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    'accepted',
    jsonb_build_object(
        'status', 'resolved',
        'resolved_at', now(),
        'resolution_result', 'Informe recibido y aprobado'
    ),
    'resolved',
    '{}'::jsonb
)).id;
reset role;

do $$
begin
    begin
        perform public.apply_commitment_transition_with_evidence(
            (select id from public.commitments where title = 'Informe C-2 editado'),
            'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
            'accepted',
            '{"status":"cancelled"}'::jsonb,
            'cancelled',
            '{}'::jsonb
        );
        raise exception 'stale lifecycle transition unexpectedly succeeded';
    exception when serialization_failure then
        null;
    end;
end;
$$;

set local role service_role;
select (public.apply_commitment_transition_with_evidence(
    :'commitment_id'::uuid,
    'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    'resolved',
    jsonb_build_object('status', 'accepted', 'resolved_at', null, 'action_completed_at', null),
    'reopened',
    jsonb_build_object('reopenedFromStatus', 'resolved')
)).id;
select (public.apply_commitment_transition_with_evidence(
    :'commitment_id'::uuid,
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    'accepted',
    jsonb_build_object('status', 'cancelled'),
    'cancelled',
    jsonb_build_object('reason', 'Cambio de prioridad')
)).id;
select (public.apply_commitment_transition_with_evidence(
    :'commitment_id'::uuid,
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    'cancelled',
    jsonb_build_object('status', 'accepted', 'rejection_reason', null),
    'reopened',
    jsonb_build_object('reopenedFromStatus', 'cancelled')
)).id;
reset role;

select pg_temp.assert_true(
    (select status from public.commitments where id = :'commitment_id'::uuid) = 'accepted'
    and exists (select 1 from public.commitment_events where commitment_id = :'commitment_id'::uuid and event_type = 'follow_up_scheduled')
    and exists (select 1 from public.commitment_events where commitment_id = :'commitment_id'::uuid and event_type = 'counter_proposed')
    and exists (select 1 from public.commitment_events where commitment_id = :'commitment_id'::uuid and event_type = 'resolved')
    and exists (select 1 from public.commitment_events where commitment_id = :'commitment_id'::uuid and event_type = 'cancelled')
    and (select count(*) from public.commitment_events where commitment_id = :'commitment_id'::uuid)
        = (select count(*) from public.commitment_audit_records where commitment_id = :'commitment_id'::uuid),
    'lifecycle must end consistently with one audit per Commitment event'
);

set local role service_role;
select (public.archive_commitment_with_evidence(
    :'commitment_id'::uuid,
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
)).id;
reset role;

select pg_temp.assert_true(
    exists (
        select 1 from public.commitments
        where id = :'commitment_id'::uuid and archived_at is not null
    )
    and exists (
        select 1 from public.commitment_events
        where commitment_id = :'commitment_id'::uuid and event_type = 'archived'
    )
    and exists (
        select 1 from public.commitment_audit_records
        where commitment_id = :'commitment_id'::uuid and action = 'commitment_archived'
    ),
    'archive must preserve the row and add evidence'
);

select 'C-2 PostgreSQL Commitment Core integration passed' as result;

rollback;
