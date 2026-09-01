\set ON_ERROR_STOP on

begin;

create or replace function pg_temp.assert_true(p_condition boolean, p_message text)
returns void
language plpgsql
as $$
begin
    if not coalesce(p_condition, false) then
        raise exception 'C-3 assertion failed: %', p_message;
    end if;
end;
$$;

insert into auth.users (id, email)
values
    ('a3000000-0000-4000-8000-000000000001', 'c3-a@example.invalid'),
    ('b3000000-0000-4000-8000-000000000002', 'c3-b@example.invalid'),
    ('c3000000-0000-4000-8000-000000000003', 'c3-c@example.invalid'),
    ('d3000000-0000-4000-8000-000000000004', 'c3-d@example.invalid'),
    ('e3000000-0000-4000-8000-000000000005', 'c3-external@example.invalid');

set local role service_role;
select public.create_conversation_with_participants(
    'a3000000-0000-4000-8000-000000000001',
    'direct',
    array[
        'a3000000-0000-4000-8000-000000000001'::uuid,
        'b3000000-0000-4000-8000-000000000002'::uuid
    ],
    null,
    null,
    true
) as direct_conversation_id \gset

select public.create_conversation_with_participants(
    'a3000000-0000-4000-8000-000000000001',
    'group',
    array[
        'a3000000-0000-4000-8000-000000000001'::uuid,
        'b3000000-0000-4000-8000-000000000002'::uuid,
        'c3000000-0000-4000-8000-000000000003'::uuid,
        'd3000000-0000-4000-8000-000000000004'::uuid
    ],
    'C-3 group',
    null,
    false
) as group_conversation_id \gset

select public.create_conversation_with_participants(
    'a3000000-0000-4000-8000-000000000001',
    'direct',
    array['a3000000-0000-4000-8000-000000000001'::uuid],
    null,
    null,
    true
) as self_conversation_id \gset
reset role;

select pg_temp.assert_true(
    (select count(*) from public.conversation_participants where conversation_id = :'direct_conversation_id'::uuid) = 2,
    'direct conversation and both participants must commit together'
);
select pg_temp.assert_true(
    (select count(*) from public.conversation_participants where conversation_id = :'group_conversation_id'::uuid) = 4,
    'group conversation and all participants must commit together'
);
select pg_temp.assert_true(
    (select count(*) from public.conversation_participants where conversation_id = :'self_conversation_id'::uuid) = 1,
    'self-chat must contain exactly its real user'
);

insert into public.messages (
    id, conversation_id, sender_id, content, client_message_id
) values (
    '13000000-0000-4000-8000-000000000001',
    :'direct_conversation_id'::uuid,
    'a3000000-0000-4000-8000-000000000001',
    'C-3 direct message',
    '23000000-0000-4000-8000-000000000001'
);

select pg_temp.assert_true(
    exists (
        select 1 from public.message_receipts
        where message_id = '13000000-0000-4000-8000-000000000001'
          and user_id = 'b3000000-0000-4000-8000-000000000002'
          and delivered_at is null and read_at is null
    )
    and (select count(*) from public.message_receipts where message_id = '13000000-0000-4000-8000-000000000001') = 1,
    '1:1 send must atomically create only B receipt'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', 'b3000000-0000-4000-8000-000000000002', true);
select (public.mark_message_receipt(
    '13000000-0000-4000-8000-000000000001', 'delivered', null
)).message_id;
select (public.mark_message_receipt(
    '13000000-0000-4000-8000-000000000001', 'read', null
)).message_id;
reset role;

select pg_temp.assert_true(
    exists (
        select 1 from public.message_receipts
        where message_id = '13000000-0000-4000-8000-000000000001'
          and user_id = 'b3000000-0000-4000-8000-000000000002'
          and delivered_at is not null and read_at is not null
    )
    and (select status from public.messages where id = '13000000-0000-4000-8000-000000000001') = 'read',
    'B delivery/read must advance its receipt and the all-recipients legacy projection'
);

-- A may observe the receipt because A participates; external E sees no rows.
set local role authenticated;
select set_config('request.jwt.claim.sub', 'a3000000-0000-4000-8000-000000000001', true);
select count(*)::int as sender_visible_receipts
from public.message_receipts where message_id = '13000000-0000-4000-8000-000000000001' \gset
reset role;
select pg_temp.assert_true(:'sender_visible_receipts'::int = 1, 'sender must observe aggregate receipt inputs');

set local role authenticated;
select set_config('request.jwt.claim.sub', 'e3000000-0000-4000-8000-000000000005', true);
select count(*)::int as external_visible_receipts
from public.message_receipts where message_id = '13000000-0000-4000-8000-000000000001' \gset
do $$
begin
    begin
        perform public.mark_message_receipt(
            '13000000-0000-4000-8000-000000000001', 'read', null
        );
        raise exception 'external receipt write unexpectedly succeeded';
    exception when insufficient_privilege then
        null;
    end;
end;
$$;
reset role;
select pg_temp.assert_true(:'external_visible_receipts'::int = 0, 'external user must not read receipts');

-- Grupo: B read, C delivered, D pending remain independent.
insert into public.messages (
    id, conversation_id, sender_id, content, client_message_id
) values (
    '13000000-0000-4000-8000-000000000002',
    :'group_conversation_id'::uuid,
    'a3000000-0000-4000-8000-000000000001',
    'C-3 group message',
    '23000000-0000-4000-8000-000000000002'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', 'b3000000-0000-4000-8000-000000000002', true);
select (public.mark_message_receipt('13000000-0000-4000-8000-000000000002', 'read', null)).message_id;
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', 'c3000000-0000-4000-8000-000000000003', true);
select (public.mark_message_receipt('13000000-0000-4000-8000-000000000002', 'delivered', null)).message_id;
do $$
begin
    begin
        perform public.mark_message_receipt(
            '13000000-0000-4000-8000-000000000002',
            'read',
            'b3000000-0000-4000-8000-000000000002'
        );
        raise exception 'participant changed another receipt unexpectedly';
    exception when insufficient_privilege then
        null;
    end;
end;
$$;
reset role;

select pg_temp.assert_true(
    (select count(*) from public.message_receipts where message_id = '13000000-0000-4000-8000-000000000002') = 3
    and exists (
        select 1 from public.message_receipts
        where message_id = '13000000-0000-4000-8000-000000000002'
          and user_id = 'b3000000-0000-4000-8000-000000000002'
          and delivered_at is not null and read_at is not null
    )
    and exists (
        select 1 from public.message_receipts
        where message_id = '13000000-0000-4000-8000-000000000002'
          and user_id = 'c3000000-0000-4000-8000-000000000003'
          and delivered_at is not null and read_at is null
    )
    and exists (
        select 1 from public.message_receipts
        where message_id = '13000000-0000-4000-8000-000000000002'
          and user_id = 'd3000000-0000-4000-8000-000000000004'
          and delivered_at is null and read_at is null
    )
    and (select status from public.messages where id = '13000000-0000-4000-8000-000000000002') = 'sent',
    'group receipts must remain independent and global status must not advance on first reader'
);

-- Self-chat: no fictitious recipient, so delivery/read is not applicable.
insert into public.messages (
    id, conversation_id, sender_id, content, client_message_id
) values (
    '13000000-0000-4000-8000-000000000003',
    :'self_conversation_id'::uuid,
    'a3000000-0000-4000-8000-000000000001',
    'C-3 self message',
    '23000000-0000-4000-8000-000000000003'
);
select pg_temp.assert_true(
    (select count(*) from public.message_receipts where message_id = '13000000-0000-4000-8000-000000000003') = 0
    and (select status from public.messages where id = '13000000-0000-4000-8000-000000000003') = 'sent',
    'self-chat must have zero receipts and persisted/sent legacy status'
);

-- client_message_id is the deterministic idempotency key.
do $$
begin
    begin
        insert into public.messages (conversation_id, sender_id, content, client_message_id)
        values (
            (select conversation_id from public.messages where id = '13000000-0000-4000-8000-000000000001'),
            'a3000000-0000-4000-8000-000000000001',
            'duplicate retry',
            '23000000-0000-4000-8000-000000000001'
        );
        raise exception 'duplicate client_message_id unexpectedly succeeded';
    exception when unique_violation then
        null;
    end;
end;
$$;
select pg_temp.assert_true(
    (select count(*) from public.messages where sender_id = 'a3000000-0000-4000-8000-000000000001' and client_message_id = '23000000-0000-4000-8000-000000000001') = 1,
    'retry must preserve exactly one message'
);

-- Provenance: tombstone preserves the source row and proposal FK atomically.
insert into public.commitment_proposals (
    id, proposed_by_user_id, proposed_responsible_user_id,
    conversation_id, source_message_id, source_kind, title, type, status
) values (
    '33000000-0000-4000-8000-000000000001',
    'a3000000-0000-4000-8000-000000000001',
    'b3000000-0000-4000-8000-000000000002',
    :'direct_conversation_id'::uuid,
    '13000000-0000-4000-8000-000000000001',
    'conversation_message',
    'C-3 source integrity',
    'task',
    'pending'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', 'a3000000-0000-4000-8000-000000000001', true);
select (public.tombstone_message(
    '13000000-0000-4000-8000-000000000001', null, 'user_deleted'
)).id;
reset role;

select pg_temp.assert_true(
    exists (
        select 1 from public.messages
        where id = '13000000-0000-4000-8000-000000000001'
          and deleted_at is not null
          and content = 'C-3 direct message'
    )
    and (select source_message_id from public.commitment_proposals where id = '33000000-0000-4000-8000-000000000001') = '13000000-0000-4000-8000-000000000001'
    and exists (
        select 1 from public.message_events
        where message_id = '13000000-0000-4000-8000-000000000001'
          and event_type = 'tombstoned'
    ),
    'tombstone must preserve content/provenance and append deletion evidence'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', 'b3000000-0000-4000-8000-000000000002', true);
do $$
begin
    begin
        insert into public.message_reactions (message_id, user_id, reaction)
        values (
            '13000000-0000-4000-8000-000000000001',
            'b3000000-0000-4000-8000-000000000002',
            'ok'
        );
        raise exception 'reaction on tombstone unexpectedly succeeded';
    exception when insufficient_privilege then
        null;
    end;
end;
$$;
reset role;

do $$
begin
    begin
        delete from public.messages where id = '13000000-0000-4000-8000-000000000001';
        raise exception 'physical delete unexpectedly succeeded';
    exception when insufficient_privilege then
        null;
    end;
    begin
        update public.messages set status = 'read' where id = '13000000-0000-4000-8000-000000000002';
        raise exception 'direct global status write unexpectedly succeeded';
    exception when insufficient_privilege then
        null;
    end;
end;
$$;

select pg_temp.assert_true(
    not has_table_privilege('anon', 'public.message_receipts', 'SELECT,INSERT,UPDATE,DELETE')
    and has_table_privilege('authenticated', 'public.message_receipts', 'SELECT')
    and not has_table_privilege('authenticated', 'public.message_receipts', 'INSERT,UPDATE,DELETE'),
    'receipt table grants must be read-only for authenticated and closed to anon'
);
select pg_temp.assert_true(
    not has_function_privilege('anon', 'public.mark_message_receipt(uuid,text,uuid)', 'EXECUTE')
    and has_function_privilege('authenticated', 'public.mark_message_receipt(uuid,text,uuid)', 'EXECUTE')
    and has_function_privilege('service_role', 'public.mark_message_receipt(uuid,text,uuid)', 'EXECUTE'),
    'receipt RPC grants must exclude anon and permit authenticated/service backend'
);
select pg_temp.assert_true(
    not has_function_privilege('authenticated', 'public.create_conversation_with_participants(uuid,text,uuid[],text,text,boolean)', 'EXECUTE')
    and has_function_privilege('service_role', 'public.create_conversation_with_participants(uuid,text,uuid[],text,text,boolean)', 'EXECUTE'),
    'conversation creation RPC must remain backend-only'
);

select 'C-3 PostgreSQL Messaging Core integration passed' as result;

rollback;
