\set ON_ERROR_STOP on

begin;

create or replace function pg_temp.assert_true(p_condition boolean, p_message text)
returns void
language plpgsql
as $$
begin
    if not coalesce(p_condition, false) then
        raise exception 'C-6 assertion failed: %', p_message;
    end if;
end;
$$;

insert into auth.users (id, email)
values
    ('a6000000-0000-4000-8000-000000000001', 'c6-a@example.invalid'),
    ('b6000000-0000-4000-8000-000000000002', 'c6-b@example.invalid'),
    ('c6000000-0000-4000-8000-000000000003', 'c6-outsider@example.invalid');

set local role service_role;
select public.create_conversation_with_participants(
    'a6000000-0000-4000-8000-000000000001',
    'direct',
    array[
        'a6000000-0000-4000-8000-000000000001'::uuid,
        'b6000000-0000-4000-8000-000000000002'::uuid
    ],
    null,
    null,
    true
) as conversation_id \gset
reset role;

insert into public.messages (
    id, conversation_id, sender_id, content, client_message_id
) values (
    '16000000-0000-4000-8000-000000000001',
    :'conversation_id'::uuid,
    'a6000000-0000-4000-8000-000000000001',
    'C-6 message',
    '26000000-0000-4000-8000-000000000001'
);

-- Sanity: B has one unread receipt for this message before anything else runs.
select pg_temp.assert_true(
    exists (
        select 1 from public.message_receipts
        where message_id = '16000000-0000-4000-8000-000000000001'
          and user_id = 'b6000000-0000-4000-8000-000000000002'
          and read_at is null
    ),
    'setup: B must start with an unread receipt'
);

-- Case A: B marks the conversation unread as a manual preference.
set local role authenticated;
select set_config('request.jwt.claim.sub', 'b6000000-0000-4000-8000-000000000002', true);
select public.mark_conversation_unread(:'conversation_id'::uuid, null);
reset role;

select pg_temp.assert_true(
    (select marked_unread_at from public.conversation_participants
     where conversation_id = :'conversation_id'::uuid and user_id = 'b6000000-0000-4000-8000-000000000002') is not null,
    'mark_conversation_unread must set marked_unread_at for the acting participant'
);
select pg_temp.assert_true(
    (select count(*) from public.message_receipts
     where message_id = '16000000-0000-4000-8000-000000000001'
       and user_id = 'b6000000-0000-4000-8000-000000000002'
       and read_at is null) = 1,
    'mark_conversation_unread must never touch message_receipts'
);
select pg_temp.assert_true(
    (select marked_unread_at from public.conversation_participants
     where conversation_id = :'conversation_id'::uuid and user_id = 'a6000000-0000-4000-8000-000000000001') is null,
    'mark_conversation_unread must never touch other participants'' rows'
);

-- Case B: a non-member cannot mark the conversation unread.
set local role authenticated;
select set_config('request.jwt.claim.sub', 'c6000000-0000-4000-8000-000000000003', true);
do $$
begin
    begin
        perform public.mark_conversation_unread('16000000-0000-4000-8000-000000000001'::uuid, null);
        raise exception 'non-member mark_conversation_unread unexpectedly succeeded';
    exception when insufficient_privilege then
        null;
    end;
end;
$$;
reset role;

-- Case C: an authenticated user cannot spoof another user's actor id.
set local role authenticated;
select set_config('request.jwt.claim.sub', 'b6000000-0000-4000-8000-000000000002', true);
do $$
begin
    begin
        perform public.mark_conversation_unread(
            (select conversation_id from public.conversation_participants limit 1),
            'a6000000-0000-4000-8000-000000000001'::uuid
        );
        raise exception 'actor spoofing unexpectedly succeeded';
    exception when insufficient_privilege then
        null;
    end;
end;
$$;
reset role;

-- Case D: marking the conversation read clears marked_unread_at atomically,
-- alongside the existing receipt/last_read_at update — same transaction, same RPC.
set local role authenticated;
select set_config('request.jwt.claim.sub', 'b6000000-0000-4000-8000-000000000002', true);
select public.mark_conversation_read(:'conversation_id'::uuid, null);
reset role;

select pg_temp.assert_true(
    (select marked_unread_at from public.conversation_participants
     where conversation_id = :'conversation_id'::uuid and user_id = 'b6000000-0000-4000-8000-000000000002') is null,
    'mark_conversation_read must clear marked_unread_at'
);
select pg_temp.assert_true(
    (select read_at from public.message_receipts
     where message_id = '16000000-0000-4000-8000-000000000001'
       and user_id = 'b6000000-0000-4000-8000-000000000002') is not null,
    'mark_conversation_read must still advance real receipts as before'
);

-- Case E: ordering — mark unread AFTER read must leave it unread (last canonical
-- operation wins); it must not resurrect or alter the already-set read_at.
-- (Captured as the connecting superuser, not 'authenticated' — this is just a
-- baseline snapshot for the later comparison, not an RLS-visibility check.)
select read_at as read_at_before_reunread
from public.message_receipts
where message_id = '16000000-0000-4000-8000-000000000001'
  and user_id = 'b6000000-0000-4000-8000-000000000002' \gset

set local role authenticated;
select set_config('request.jwt.claim.sub', 'b6000000-0000-4000-8000-000000000002', true);
select public.mark_conversation_unread(:'conversation_id'::uuid, null);
reset role;

select pg_temp.assert_true(
    (select marked_unread_at from public.conversation_participants
     where conversation_id = :'conversation_id'::uuid and user_id = 'b6000000-0000-4000-8000-000000000002') is not null,
    'mark_conversation_unread after mark_conversation_read must set the marker again'
);
select pg_temp.assert_true(
    (select read_at from public.message_receipts
     where message_id = '16000000-0000-4000-8000-000000000001'
       and user_id = 'b6000000-0000-4000-8000-000000000002')::text = :'read_at_before_reunread',
    'mark_conversation_unread must never alter the historical read_at timestamp'
);

-- Grants: mirror the mark_conversation_read tier exactly (authenticated + service_role, not anon).
select pg_temp.assert_true(
    not has_function_privilege('anon', 'public.mark_conversation_unread(uuid,uuid)', 'EXECUTE')
    and has_function_privilege('authenticated', 'public.mark_conversation_unread(uuid,uuid)', 'EXECUTE')
    and has_function_privilege('service_role', 'public.mark_conversation_unread(uuid,uuid)', 'EXECUTE'),
    'mark_conversation_unread grants must exclude anon and permit authenticated/service backend'
);

-- No new client-writable surface was opened on conversation_participants itself.
select pg_temp.assert_true(
    not has_table_privilege('anon', 'public.conversation_participants', 'UPDATE')
    and not has_table_privilege('authenticated', 'public.conversation_participants', 'UPDATE'),
    'conversation_participants must stay closed to direct client UPDATE — only the RPC (security definer) may write marked_unread_at'
);

select 'C-6 conversation manual-unread integration passed' as result;

rollback;
