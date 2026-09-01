\set ON_ERROR_STOP on

begin;

insert into auth.users (id, email) values
    ('a4100000-0000-4000-8000-000000000001', 'c4b-a@example.invalid'),
    ('a4100000-0000-4000-8000-000000000002', 'c4b-b@example.invalid'),
    ('a4100000-0000-4000-8000-000000000003', 'c4b-outsider@example.invalid');

select public.create_conversation_with_participants(
    'a4100000-0000-4000-8000-000000000001',
    'group',
    array[
        'a4100000-0000-4000-8000-000000000001'::uuid,
        'a4100000-0000-4000-8000-000000000002'::uuid
    ],
    'C-4B integration',
    null,
    false
) as conversation_id
\gset c4b_
select set_config('c4b.conversation_id', :'c4b_conversation_id', true);

select id as attachment_id
from public.create_message_attachment_intent(
    'a4100000-0000-4000-8000-000000000001',
    :'c4b_conversation_id',
    'document',
    'application/pdf',
    'evidence.pdf',
    'a4100000-0000-4000-8000-000000000010',
    'chat-media',
    'conversations/c4b/attachments/a/evidence.pdf',
    '{"origin":"integration"}'::jsonb
)
\gset c4b_
select set_config('c4b.attachment_id', :'c4b_attachment_id', true);

-- Mismo actor + client_upload_id converge en la misma fila.
do $$
declare
    v_first uuid;
    v_retry uuid;
begin
    select id into v_first
    from public.attachments
    where client_upload_id = 'a4100000-0000-4000-8000-000000000010';

    select id into v_retry
    from public.create_message_attachment_intent(
        'a4100000-0000-4000-8000-000000000001',
        current_setting('c4b.conversation_id')::uuid,
        'document',
        'application/pdf',
        'evidence.pdf',
        'a4100000-0000-4000-8000-000000000010',
        'chat-media',
        'conversations/c4b/attachments/a/ignored-on-retry.pdf',
        '{}'::jsonb
    );

    if v_first is distinct from v_retry then
        raise exception 'upload intent retry created another attachment';
    end if;
end;
$$;

select public.complete_message_attachment(
    :'c4b_attachment_id',
    'a4100000-0000-4000-8000-000000000001',
    'application/pdf',
    128
);

select *
from public.persist_message_with_attachment(
    'a4100000-0000-4000-8000-000000000001',
    :'c4b_conversation_id',
    'C-4B message',
    null,
    'a4100000-0000-4000-8000-000000000020',
    '{}'::jsonb,
    :'c4b_attachment_id'
)
\gset c4b_message_
select set_config('c4b.message_id', :'c4b_message_message_id', true);

do $$
declare
    v_attachment public.attachments;
    v_message public.messages;
begin
    select * into v_attachment from public.attachments where id = current_setting('c4b.attachment_id')::uuid;
    select * into v_message from public.messages where id = current_setting('c4b.message_id')::uuid;

    if v_attachment.lifecycle_status <> 'attached'
       or v_attachment.message_id is distinct from v_message.id
       or v_attachment.attached_at is null then
        raise exception 'message and attachment were not associated atomically';
    end if;
    if v_message.media_bucket <> 'chat-media'
       or v_message.media_object_path <> v_attachment.object_path
       or v_message.metadata #>> '{attachment,id}' <> v_attachment.id::text then
        raise exception 'legacy projection or canonical attachment metadata is incomplete';
    end if;
    if (select count(*) from public.message_receipts where message_id = v_message.id) <> 1 then
        raise exception 'receipt snapshot was not created with the message';
    end if;
end;
$$;

-- Retry del mensaje devuelve la misma identidad y marca replay.
do $$
declare
    v_result record;
begin
    select * into v_result
    from public.persist_message_with_attachment(
        'a4100000-0000-4000-8000-000000000001',
        current_setting('c4b.conversation_id')::uuid,
        'C-4B message',
        null,
        'a4100000-0000-4000-8000-000000000020',
        '{}'::jsonb,
        current_setting('c4b.attachment_id')::uuid
    );
    if v_result.message_id is distinct from current_setting('c4b.message_id')::uuid
       or v_result.idempotent_replay is distinct from true then
        raise exception 'message retry was not idempotent';
    end if;
end;
$$;

-- Participante lee; outsider no obtiene referencia.
select count(*) as authorized_read_count
from public.authorize_message_attachment_read(
    :'c4b_attachment_id',
    'a4100000-0000-4000-8000-000000000002'
)
\gset c4b_
select set_config('c4b.authorized_read_count', :'c4b_authorized_read_count', true);

do $$
begin
    if current_setting('c4b.authorized_read_count')::integer <> 1 then
        raise exception 'participant could not authorize attachment read';
    end if;
    begin
        perform * from public.authorize_message_attachment_read(
            current_setting('c4b.attachment_id')::uuid,
            'a4100000-0000-4000-8000-000000000003'
        );
        raise exception 'outsider unexpectedly read attachment';
    exception when insufficient_privilege then
        null;
    end;
end;
$$;

-- Usuario que abandona el grupo no puede renovar acceso.
delete from public.conversation_participants
where conversation_id = :'c4b_conversation_id'
  and user_id = 'a4100000-0000-4000-8000-000000000002';

do $$
begin
    begin
        perform * from public.authorize_message_attachment_read(
            current_setting('c4b.attachment_id')::uuid,
            'a4100000-0000-4000-8000-000000000002'
        );
        raise exception 'former participant unexpectedly renewed access';
    exception when insufficient_privilege then
        null;
    end;
end;
$$;

-- Upload completo + mensaje fallido conserva el attachment uploaded.
select id as failed_attachment_id
from public.create_message_attachment_intent(
    'a4100000-0000-4000-8000-000000000001',
    :'c4b_conversation_id',
    'document',
    'application/pdf',
    'pending.pdf',
    'a4100000-0000-4000-8000-000000000011',
    'chat-media',
    'conversations/c4b/attachments/a/pending.pdf',
    '{}'::jsonb
)
\gset c4b_
select set_config('c4b.failed_attachment_id', :'c4b_failed_attachment_id', true);

select public.complete_message_attachment(
    :'c4b_failed_attachment_id',
    'a4100000-0000-4000-8000-000000000001',
    'application/pdf',
    256
);

do $$
begin
    begin
        perform * from public.persist_message_with_attachment(
            'a4100000-0000-4000-8000-000000000001',
            current_setting('c4b.conversation_id')::uuid,
            'Must fail',
            'ffffffff-ffff-4fff-8fff-ffffffffffff',
            'a4100000-0000-4000-8000-000000000021',
            '{}'::jsonb,
            current_setting('c4b.failed_attachment_id')::uuid
        );
        raise exception 'invalid message unexpectedly succeeded';
    exception when foreign_key_violation then
        null;
    end;

    if not exists (
        select 1 from public.attachments
        where id = current_setting('c4b.failed_attachment_id')::uuid
          and lifecycle_status = 'uploaded'
          and message_id is null
    ) then
        raise exception 'failed message did not preserve uploaded attachment';
    end if;
end;
$$;

-- RLS: participante ve attached; outsider no. Authenticated no escribe.
do $$
begin
    if has_table_privilege('authenticated', 'public.attachments', 'INSERT')
       or has_table_privilege('authenticated', 'public.attachments', 'UPDATE')
       or has_table_privilege('authenticated', 'public.attachments', 'DELETE') then
        raise exception 'authenticated has direct attachment write privileges';
    end if;
end;
$$;

set local role authenticated;
select set_config('request.jwt.claim.sub', 'a4100000-0000-4000-8000-000000000001', true);
select 1 / case when count(*) >= 2 then 1 else 0 end
from public.attachments
where context_conversation_id = :'c4b_conversation_id';

select set_config('request.jwt.claim.sub', 'a4100000-0000-4000-8000-000000000003', true);
select 1 / case when count(*) = 0 then 1 else 0 end
from public.attachments
where context_conversation_id = :'c4b_conversation_id';
reset role;
select set_config('request.jwt.claim.sub', 'a4100000-0000-4000-8000-000000000001', true);

-- Tombstone conserva procedencia pero revoca nuevas lecturas.
select public.tombstone_message(
    :'c4b_message_message_id',
    'a4100000-0000-4000-8000-000000000001',
    'integration_test'
);

do $$
declare
    v_attachment public.attachments;
begin
    select * into v_attachment from public.attachments where id = current_setting('c4b.attachment_id')::uuid;
    if v_attachment.lifecycle_status <> 'tombstoned'
       or v_attachment.message_id is null
       or v_attachment.object_path = ''
       or v_attachment.tombstoned_at is null then
        raise exception 'tombstone did not preserve attachment provenance';
    end if;
    begin
        perform * from public.authorize_message_attachment_read(
            current_setting('c4b.attachment_id')::uuid,
            'a4100000-0000-4000-8000-000000000001'
        );
        raise exception 'tombstoned attachment unexpectedly authorized read';
    exception when insufficient_privilege then
        null;
    end;
end;
$$;

-- Conversacion tombstoned bloquea la firma aunque el mensaje siga activo.
select id as conversation_tombstone_attachment_id
from public.create_message_attachment_intent(
    'a4100000-0000-4000-8000-000000000001',
    :'c4b_conversation_id',
    'document',
    'application/pdf',
    'conversation-tombstone.pdf',
    'a4100000-0000-4000-8000-000000000012',
    'chat-media',
    'conversations/c4b/attachments/a/conversation-tombstone.pdf',
    '{}'::jsonb
)
\gset c4b_
select set_config(
    'c4b.conversation_tombstone_attachment_id',
    :'c4b_conversation_tombstone_attachment_id',
    true
);

select public.complete_message_attachment(
    :'c4b_conversation_tombstone_attachment_id',
    'a4100000-0000-4000-8000-000000000001',
    'application/pdf',
    64
);

select * from public.persist_message_with_attachment(
    'a4100000-0000-4000-8000-000000000001',
    :'c4b_conversation_id',
    'Before conversation tombstone',
    null,
    'a4100000-0000-4000-8000-000000000022',
    '{}'::jsonb,
    :'c4b_conversation_tombstone_attachment_id'
);

select public.tombstone_conversation(
    :'c4b_conversation_id',
    'a4100000-0000-4000-8000-000000000001'
);

do $$
begin
    begin
        perform * from public.authorize_message_attachment_read(
            current_setting('c4b.conversation_tombstone_attachment_id')::uuid,
            'a4100000-0000-4000-8000-000000000001'
        );
        raise exception 'conversation tombstone unexpectedly authorized attachment read';
    exception when insufficient_privilege then
        null;
    end;
end;
$$;

rollback;
