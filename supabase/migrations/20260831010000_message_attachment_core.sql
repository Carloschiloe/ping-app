-- Ping C-4B: Message Attachment Core.
--
-- Migracion aditiva. Mantiene media_url/media_bucket/media_object_path y los
-- contratos legacy, pero agrega una identidad y lifecycle canonicos para los
-- adjuntos nuevos de mensajes. No elimina objetos de Storage.

create table public.attachments (
    id uuid primary key default gen_random_uuid(),
    kind text not null,
    purpose text not null default 'message_attachment',
    created_by_user_id uuid not null references public.profiles(id) on delete restrict,
    context_conversation_id uuid not null references public.conversations(id) on delete restrict,
    message_id uuid references public.messages(id) on delete restrict,
    bucket text not null,
    object_path text not null,
    mime_type text not null,
    size_bytes bigint,
    original_filename text not null,
    metadata jsonb not null default '{}'::jsonb,
    source_type text not null default 'mobile_upload',
    client_upload_id uuid not null,
    lifecycle_status text not null default 'pending',
    expires_at timestamptz not null default (now() + interval '24 hours'),
    uploaded_at timestamptz,
    attached_at timestamptz,
    tombstoned_at timestamptz,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint attachments_kind_check
        check (kind in ('image', 'video', 'audio', 'document')),
    constraint attachments_purpose_check
        check (purpose = 'message_attachment'),
    constraint attachments_bucket_check
        check (bucket = 'chat-media'),
    constraint attachments_object_path_check
        check (
            object_path <> ''
            and object_path !~ '(^/|(^|/)\.\.(/|$)|://|[?#])'
        ),
    constraint attachments_mime_type_check
        check (mime_type <> '' and length(mime_type) <= 100),
    constraint attachments_size_check
        check (size_bytes is null or (size_bytes > 0 and size_bytes <= 20971520)),
    constraint attachments_filename_check
        check (original_filename <> '' and length(original_filename) <= 200),
    constraint attachments_source_type_check
        check (source_type in ('mobile_upload', 'legacy_adapter')),
    constraint attachments_lifecycle_check
        check (lifecycle_status in ('pending', 'uploaded', 'attached', 'tombstoned')),
    constraint attachments_lifecycle_shape_check
        check (
            (lifecycle_status = 'pending'
                and message_id is null
                and uploaded_at is null
                and attached_at is null
                and tombstoned_at is null)
            or
            (lifecycle_status = 'uploaded'
                and message_id is null
                and uploaded_at is not null
                and size_bytes is not null
                and attached_at is null
                and tombstoned_at is null)
            or
            (lifecycle_status = 'attached'
                and message_id is not null
                and uploaded_at is not null
                and size_bytes is not null
                and attached_at is not null
                and tombstoned_at is null)
            or
            (lifecycle_status = 'tombstoned'
                and message_id is not null
                and uploaded_at is not null
                and size_bytes is not null
                and attached_at is not null
                and tombstoned_at is not null)
        ),
    constraint attachments_creator_upload_unique
        unique (created_by_user_id, client_upload_id),
    constraint attachments_storage_object_unique
        unique (bucket, object_path),
    constraint attachments_message_unique
        unique (message_id)
);

create index attachments_context_lifecycle_idx
    on public.attachments (context_conversation_id, lifecycle_status, created_at desc);

create index attachments_expired_unattached_idx
    on public.attachments (expires_at)
    where message_id is null and lifecycle_status in ('pending', 'uploaded');

create trigger trg_attachments_updated_at
    before update on public.attachments
    for each row execute procedure public.set_updated_at();

comment on table public.attachments is
    'C-4B: identidad, ubicacion privada, ownership y lifecycle de un unico adjunto por mensaje.';
comment on column public.attachments.expires_at is
    'Ventana para identificar uploads pending/uploaded sin mensaje. C-4B no los purga automaticamente.';
comment on column public.attachments.client_upload_id is
    'Idempotencia del upload intent dentro del actor creador.';

create or replace function public.create_message_attachment_intent(
    p_actor_user_id uuid,
    p_conversation_id uuid,
    p_kind text,
    p_mime_type text,
    p_original_filename text,
    p_client_upload_id uuid,
    p_bucket text,
    p_object_path text,
    p_metadata jsonb default '{}'::jsonb
)
returns public.attachments
language plpgsql
security definer
set search_path = public
as $$
declare
    v_actor_user_id uuid := public.messaging_actor(p_actor_user_id);
    v_conversation public.conversations;
    v_attachment public.attachments;
begin
    if p_client_upload_id is null then
        raise exception 'client_upload_id is required' using errcode = '22023';
    end if;

    perform pg_advisory_xact_lock(
        hashtextextended(v_actor_user_id::text || ':' || p_client_upload_id::text, 0)
    );

    select * into v_attachment
    from public.attachments
    where created_by_user_id = v_actor_user_id
      and client_upload_id = p_client_upload_id
    for update;

    if found then
        if v_attachment.context_conversation_id is distinct from p_conversation_id
           or v_attachment.mime_type is distinct from p_mime_type
           or v_attachment.kind is distinct from p_kind then
            raise exception 'client_upload_id belongs to a different attachment intent'
                using errcode = '22023';
        end if;
        if v_attachment.lifecycle_status <> 'pending' or v_attachment.expires_at <= now() then
            raise exception 'Attachment intent is no longer uploadable' using errcode = '55000';
        end if;
        return v_attachment;
    end if;

    select * into v_conversation
    from public.conversations
    where id = p_conversation_id
    for share;

    if not found or v_conversation.deleted_at is not null then
        raise exception 'Conversation is unavailable' using errcode = 'P0002';
    end if;
    if not public.is_conversation_participant(p_conversation_id, v_actor_user_id) then
        raise exception 'Actor is not a conversation participant' using errcode = '42501';
    end if;

    insert into public.attachments (
        kind,
        purpose,
        created_by_user_id,
        context_conversation_id,
        bucket,
        object_path,
        mime_type,
        original_filename,
        metadata,
        source_type,
        client_upload_id
    ) values (
        p_kind,
        'message_attachment',
        v_actor_user_id,
        p_conversation_id,
        p_bucket,
        p_object_path,
        p_mime_type,
        left(p_original_filename, 200),
        coalesce(p_metadata, '{}'::jsonb),
        'mobile_upload',
        p_client_upload_id
    )
    returning * into v_attachment;

    return v_attachment;
end;
$$;

create or replace function public.complete_message_attachment(
    p_attachment_id uuid,
    p_actor_user_id uuid,
    p_verified_mime_type text,
    p_verified_size_bytes bigint
)
returns public.attachments
language plpgsql
security definer
set search_path = public
as $$
declare
    v_actor_user_id uuid := public.messaging_actor(p_actor_user_id);
    v_attachment public.attachments;
    v_deleted_at timestamptz;
begin
    select * into v_attachment
    from public.attachments
    where id = p_attachment_id
    for update;

    if not found then
        raise exception 'Attachment not found' using errcode = 'P0002';
    end if;
    if v_attachment.created_by_user_id is distinct from v_actor_user_id then
        raise exception 'Actor cannot complete this attachment' using errcode = '42501';
    end if;

    select deleted_at into v_deleted_at
    from public.conversations
    where id = v_attachment.context_conversation_id
    for share;

    if not found or v_deleted_at is not null then
        raise exception 'Conversation is unavailable' using errcode = 'P0002';
    end if;
    if not public.is_conversation_participant(v_attachment.context_conversation_id, v_actor_user_id) then
        raise exception 'Actor is not a conversation participant' using errcode = '42501';
    end if;
    if v_attachment.lifecycle_status = 'uploaded' then
        if v_attachment.mime_type is distinct from p_verified_mime_type
           or v_attachment.size_bytes is distinct from p_verified_size_bytes then
            raise exception 'Completed attachment metadata does not match' using errcode = '22023';
        end if;
        return v_attachment;
    end if;
    if v_attachment.lifecycle_status <> 'pending' then
        raise exception 'Attachment cannot be completed in its current lifecycle' using errcode = '55000';
    end if;
    if v_attachment.expires_at <= now() then
        raise exception 'Attachment intent expired' using errcode = '55000';
    end if;
    if v_attachment.mime_type is distinct from p_verified_mime_type then
        raise exception 'Uploaded MIME type does not match the intent' using errcode = '22023';
    end if;
    if p_verified_size_bytes is null
       or p_verified_size_bytes <= 0
       or p_verified_size_bytes > 20971520 then
        raise exception 'Uploaded file size is not allowed' using errcode = '22023';
    end if;

    update public.attachments
    set lifecycle_status = 'uploaded',
        size_bytes = p_verified_size_bytes,
        uploaded_at = now()
    where id = p_attachment_id
    returning * into v_attachment;

    return v_attachment;
end;
$$;

create or replace function public.register_legacy_message_attachment(
    p_actor_user_id uuid,
    p_conversation_id uuid,
    p_kind text,
    p_mime_type text,
    p_size_bytes bigint,
    p_original_filename text,
    p_client_upload_id uuid,
    p_bucket text,
    p_object_path text,
    p_metadata jsonb default '{}'::jsonb
)
returns public.attachments
language plpgsql
security definer
set search_path = public
as $$
declare
    v_actor_user_id uuid := public.messaging_actor(p_actor_user_id);
    v_attachment public.attachments;
    v_deleted_at timestamptz;
begin
    perform pg_advisory_xact_lock(
        hashtextextended(v_actor_user_id::text || ':' || p_client_upload_id::text, 0)
    );

    select * into v_attachment
    from public.attachments
    where (created_by_user_id = v_actor_user_id and client_upload_id = p_client_upload_id)
       or (bucket = p_bucket and object_path = p_object_path)
    order by (created_by_user_id = v_actor_user_id and client_upload_id = p_client_upload_id) desc
    limit 1
    for update;

    if found then
        if v_attachment.created_by_user_id is distinct from v_actor_user_id
           or v_attachment.context_conversation_id is distinct from p_conversation_id
           or v_attachment.bucket is distinct from p_bucket
           or v_attachment.object_path is distinct from p_object_path then
            raise exception 'Legacy attachment reference conflicts with an existing attachment'
                using errcode = '42501';
        end if;
        return v_attachment;
    end if;

    select deleted_at into v_deleted_at
    from public.conversations
    where id = p_conversation_id
    for share;
    if not found or v_deleted_at is not null then
        raise exception 'Conversation is unavailable' using errcode = 'P0002';
    end if;
    if not public.is_conversation_participant(p_conversation_id, v_actor_user_id) then
        raise exception 'Actor is not a conversation participant' using errcode = '42501';
    end if;

    insert into public.attachments (
        kind,
        created_by_user_id,
        context_conversation_id,
        bucket,
        object_path,
        mime_type,
        size_bytes,
        original_filename,
        metadata,
        source_type,
        client_upload_id,
        lifecycle_status,
        uploaded_at
    ) values (
        p_kind,
        v_actor_user_id,
        p_conversation_id,
        p_bucket,
        p_object_path,
        p_mime_type,
        p_size_bytes,
        left(p_original_filename, 200),
        coalesce(p_metadata, '{}'::jsonb),
        'legacy_adapter',
        p_client_upload_id,
        'uploaded',
        now()
    )
    returning * into v_attachment;

    return v_attachment;
end;
$$;

create or replace function public.persist_message_with_attachment(
    p_actor_user_id uuid,
    p_conversation_id uuid,
    p_content text,
    p_reply_to_id uuid default null,
    p_client_message_id uuid default null,
    p_metadata jsonb default '{}'::jsonb,
    p_attachment_id uuid default null
)
returns table (message_id uuid, idempotent_replay boolean)
language plpgsql
security definer
set search_path = public
as $$
declare
    v_actor_user_id uuid := public.messaging_actor(p_actor_user_id);
    v_message public.messages;
    v_attachment public.attachments;
    v_deleted_at timestamptz;
    v_metadata jsonb := coalesce(p_metadata, '{}'::jsonb);
begin
    if p_client_message_id is not null then
        perform pg_advisory_xact_lock(
            hashtextextended(v_actor_user_id::text || ':' || p_client_message_id::text, 0)
        );

        select * into v_message
        from public.messages
        where sender_id = v_actor_user_id
          and client_message_id = p_client_message_id
        for update;

        if found then
            if v_message.conversation_id is distinct from p_conversation_id then
                raise exception 'client_message_id belongs to another conversation'
                    using errcode = '22023';
            end if;
            if p_attachment_id is not null and not exists (
                select 1 from public.attachments a
                where a.id = p_attachment_id and a.message_id = v_message.id
            ) then
                raise exception 'Idempotent retry references another attachment'
                    using errcode = '22023';
            end if;
            return query select v_message.id, true;
            return;
        end if;
    end if;

    select deleted_at into v_deleted_at
    from public.conversations
    where id = p_conversation_id
    for share;
    if not found or v_deleted_at is not null then
        raise exception 'Conversation is unavailable' using errcode = 'P0002';
    end if;
    if not public.is_conversation_participant(p_conversation_id, v_actor_user_id) then
        raise exception 'Actor is not a conversation participant' using errcode = '42501';
    end if;

    if p_attachment_id is not null then
        select * into v_attachment
        from public.attachments
        where id = p_attachment_id
        for update;

        if not found then
            raise exception 'Attachment not found' using errcode = 'P0002';
        end if;
        if v_attachment.created_by_user_id is distinct from v_actor_user_id
           or v_attachment.context_conversation_id is distinct from p_conversation_id then
            raise exception 'Attachment does not belong to this actor and conversation'
                using errcode = '42501';
        end if;
        if v_attachment.lifecycle_status <> 'uploaded' or v_attachment.message_id is not null then
            raise exception 'Attachment was already claimed or is not uploaded'
                using errcode = '55000';
        end if;
        if v_attachment.expires_at <= now() then
            raise exception 'Attachment expired before it was attached' using errcode = '55000';
        end if;

        v_metadata := v_metadata || jsonb_build_object(
            'attachment',
            jsonb_build_object(
                'id', v_attachment.id,
                'kind', v_attachment.kind,
                'mimeType', v_attachment.mime_type,
                'fileName', v_attachment.original_filename,
                'size', v_attachment.size_bytes
            )
        );
    end if;

    insert into public.messages (
        sender_id,
        conversation_id,
        content,
        metadata,
        reply_to_id,
        client_message_id,
        media_bucket,
        media_object_path
    ) values (
        v_actor_user_id,
        p_conversation_id,
        p_content,
        v_metadata,
        p_reply_to_id,
        p_client_message_id,
        case when p_attachment_id is not null then v_attachment.bucket else null end,
        case when p_attachment_id is not null then v_attachment.object_path else null end
    )
    returning * into v_message;

    if p_attachment_id is not null then
        update public.attachments
        set message_id = v_message.id,
            lifecycle_status = 'attached',
            attached_at = now()
        where id = p_attachment_id;
    end if;

    return query select v_message.id, false;
    return;
end;
$$;

create or replace function public.authorize_message_attachment_read(
    p_attachment_id uuid,
    p_actor_user_id uuid default null
)
returns table (
    attachment_id uuid,
    bucket text,
    object_path text,
    mime_type text,
    size_bytes bigint,
    original_filename text
)
language plpgsql
security definer
set search_path = public
as $$
declare
    v_actor_user_id uuid := public.messaging_actor(p_actor_user_id);
begin
    return query
    select
        a.id,
        a.bucket,
        a.object_path,
        a.mime_type,
        a.size_bytes,
        a.original_filename
    from public.attachments a
    join public.messages m on m.id = a.message_id
    join public.conversations c on c.id = a.context_conversation_id
    where a.id = p_attachment_id
      and a.lifecycle_status = 'attached'
      and m.deleted_at is null
      and c.deleted_at is null
      and public.is_conversation_participant(c.id, v_actor_user_id);

    if not found then
        raise exception 'Attachment is unavailable or unauthorized' using errcode = '42501';
    end if;
end;
$$;

create or replace function public.list_expired_message_attachments(
    p_limit integer default 100
)
returns setof public.attachments
language sql
security definer
set search_path = public
stable
as $$
    select a.*
    from public.attachments a
    where a.message_id is null
      and a.lifecycle_status in ('pending', 'uploaded')
      and a.expires_at <= now()
    order by a.expires_at
    limit greatest(1, least(coalesce(p_limit, 100), 1000));
$$;

-- Extiende el tombstone canonico de C-3: mensaje, evento y attachment quedan
-- registrados en la misma transaccion. El objeto fisico no se elimina.
create or replace function public.tombstone_message(
    p_message_id uuid,
    p_actor_user_id uuid default null,
    p_reason text default 'user_deleted'
)
returns public.messages
language plpgsql
security definer
set search_path = public
as $$
declare
    v_actor_user_id uuid := public.messaging_actor(p_actor_user_id);
    v_message public.messages;
begin
    select * into v_message
    from public.messages
    where id = p_message_id
    for update;

    if not found then
        raise exception 'Message not found' using errcode = 'P0002';
    end if;

    if v_message.sender_id is distinct from v_actor_user_id and not exists (
        select 1
        from public.conversation_participants cp
        where cp.conversation_id = v_message.conversation_id
          and cp.user_id = v_actor_user_id
          and cp.role = 'admin'
    ) then
        raise exception 'Actor cannot delete this message' using errcode = '42501';
    end if;

    if v_message.deleted_at is null then
        update public.messages
        set deleted_at = now(),
            deleted_by_user_id = v_actor_user_id,
            deletion_reason = left(coalesce(nullif(trim(p_reason), ''), 'user_deleted'), 100)
        where id = p_message_id
        returning * into v_message;

        update public.attachments
        set lifecycle_status = 'tombstoned',
            tombstoned_at = now()
        where message_id = p_message_id
          and lifecycle_status = 'attached';

        insert into public.message_events (
            message_id,
            conversation_id,
            actor_user_id,
            event_type,
            details
        ) values (
            v_message.id,
            v_message.conversation_id,
            v_actor_user_id,
            'tombstoned',
            jsonb_build_object('reason', v_message.deletion_reason)
        );
    end if;

    return v_message;
end;
$$;

alter table public.attachments enable row level security;

create policy attachments_select_authorized
    on public.attachments for select
    to authenticated
    using (
        exists (
            select 1
            from public.conversations c
            where c.id = attachments.context_conversation_id
              and c.deleted_at is null
              and public.is_conversation_participant(c.id, auth.uid())
        )
        and (
            (
                attachments.message_id is null
                and attachments.created_by_user_id = auth.uid()
                and attachments.lifecycle_status in ('pending', 'uploaded')
            )
            or attachments.message_id is not null
        )
    );

revoke all on table public.attachments from anon, authenticated;
grant select on table public.attachments to authenticated;
grant all on table public.attachments to service_role;

revoke execute on function public.create_message_attachment_intent(uuid, uuid, text, text, text, uuid, text, text, jsonb)
    from public, anon, authenticated;
grant execute on function public.create_message_attachment_intent(uuid, uuid, text, text, text, uuid, text, text, jsonb)
    to service_role;

revoke execute on function public.complete_message_attachment(uuid, uuid, text, bigint)
    from public, anon, authenticated;
grant execute on function public.complete_message_attachment(uuid, uuid, text, bigint)
    to service_role;

revoke execute on function public.register_legacy_message_attachment(uuid, uuid, text, text, bigint, text, uuid, text, text, jsonb)
    from public, anon, authenticated;
grant execute on function public.register_legacy_message_attachment(uuid, uuid, text, text, bigint, text, uuid, text, text, jsonb)
    to service_role;

revoke execute on function public.persist_message_with_attachment(uuid, uuid, text, uuid, uuid, jsonb, uuid)
    from public, anon, authenticated;
grant execute on function public.persist_message_with_attachment(uuid, uuid, text, uuid, uuid, jsonb, uuid)
    to service_role;

revoke execute on function public.authorize_message_attachment_read(uuid, uuid)
    from public, anon, authenticated;
grant execute on function public.authorize_message_attachment_read(uuid, uuid)
    to service_role;

revoke execute on function public.list_expired_message_attachments(integer)
    from public, anon, authenticated;
grant execute on function public.list_expired_message_attachments(integer)
    to service_role;

-- Conserva el acceso de C-3 al tombstone reemplazado.
revoke execute on function public.tombstone_message(uuid, uuid, text) from public, anon;
grant execute on function public.tombstone_message(uuid, uuid, text) to authenticated, service_role;
