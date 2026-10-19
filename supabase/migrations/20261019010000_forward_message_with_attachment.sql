-- Ping: canonical forwarding of a confirmed message.
--
-- Storage is copied by the trusted backend before this RPC is called. This
-- function is the database transaction boundary: it authorizes both
-- conversations, creates the destination message, and attaches a distinct
-- attachment row. A failed transaction rolls back all database state; the
-- backend removes the copied Storage object in its failure path.

alter table public.attachments
    drop constraint if exists attachments_source_type_check,
    add constraint attachments_source_type_check
        check (source_type in ('mobile_upload', 'legacy_adapter', 'forwarded'));

create or replace function public.forward_message_with_attachment(
    p_actor_user_id uuid,
    p_source_conversation_id uuid,
    p_source_message_id uuid,
    p_destination_conversation_id uuid,
    p_destination_object_path text default null,
    p_client_message_id uuid default null
)
returns table (message_id uuid, idempotent_replay boolean)
language plpgsql
security definer
set search_path = public
as $$
declare
    v_actor_user_id uuid := public.messaging_actor(p_actor_user_id);
    v_source public.messages;
    v_source_attachment public.attachments;
    v_destination public.conversations;
    v_message public.messages;
    v_deleted_at timestamptz;
    v_expected_prefix text;
    v_has_attachment boolean := false;
    v_metadata jsonb := jsonb_build_object(
        'forwarded', true,
        'forwarded_from_message_id', p_source_message_id
    );
begin
    if p_source_conversation_id is null
       or p_destination_conversation_id is null
       or p_source_conversation_id = p_destination_conversation_id then
        raise exception 'Source and destination conversations must be different'
            using errcode = '22023';
    end if;

    select deleted_at into v_deleted_at
    from public.conversations
    where id = p_source_conversation_id
    for share;
    if not found or v_deleted_at is not null then
        raise exception 'Source conversation is unavailable' using errcode = 'P0002';
    end if;
    if not public.is_conversation_participant(p_source_conversation_id, v_actor_user_id) then
        raise exception 'Actor is not a source conversation participant' using errcode = '42501';
    end if;

    select * into v_destination
    from public.conversations
    where id = p_destination_conversation_id
    for share;
    if not found or v_destination.deleted_at is not null then
        raise exception 'Destination conversation is unavailable' using errcode = 'P0002';
    end if;
    if not public.is_conversation_participant(p_destination_conversation_id, v_actor_user_id) then
        raise exception 'Actor is not a destination conversation participant' using errcode = '42501';
    end if;

    -- Match the existing messaging idempotency contract. This check is before
    -- source loading so a confirmed retry does not depend on mutable source
    -- state, but it remains bound to the destination conversation.
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
            if v_message.conversation_id is distinct from p_destination_conversation_id then
                raise exception 'client_message_id belongs to another conversation'
                    using errcode = '22023';
            end if;
            if v_message.metadata ->> 'forwarded_from_message_id' is distinct from p_source_message_id::text then
                raise exception 'client_message_id belongs to another message'
                    using errcode = '22023';
            end if;
            return query select v_message.id, true;
            return;
        end if;
    end if;

    select * into v_source
    from public.messages
    where id = p_source_message_id
      and conversation_id = p_source_conversation_id
      and deleted_at is null
    for share;
    if not found then
        raise exception 'Message not found in source conversation' using errcode = 'P0002';
    end if;
    if v_source.sender_id is null then
        raise exception 'Only confirmed user messages can be forwarded' using errcode = '22023';
    end if;

    select * into v_source_attachment
    from public.attachments
    where message_id = v_source.id
    limit 1
    for share;
    v_has_attachment := found;

    if v_has_attachment then
        if v_source_attachment.lifecycle_status <> 'attached'
           or v_source_attachment.context_conversation_id is distinct from p_source_conversation_id
           or v_source_attachment.bucket <> 'chat-media'
           or v_source_attachment.object_path is null
           or v_source_attachment.object_path = ''
           or v_source_attachment.object_path ~ '(^/|(^|/)\.\.(/|$)|://|[?#])' then
            raise exception 'Message attachment is unavailable for forwarding' using errcode = '55000';
        end if;

        v_expected_prefix := 'conversations/' || p_destination_conversation_id::text
            || '/attachments/' || v_actor_user_id::text || '/';
        if p_destination_object_path is null
           or left(p_destination_object_path, length(v_expected_prefix)) <> v_expected_prefix
           or p_destination_object_path ~ '(^/|(^|/)\.\.(/|$)|://|[?#])' then
            raise exception 'Forwarded attachment path is invalid' using errcode = '22023';
        end if;

        v_metadata := v_metadata || jsonb_build_object(
            'attachment', jsonb_build_object(
                'kind', v_source_attachment.kind,
                'mimeType', v_source_attachment.mime_type,
                'fileName', v_source_attachment.original_filename,
                'size', v_source_attachment.size_bytes,
                'durationMs', v_source_attachment.duration_ms
            )
        );
    elsif p_destination_object_path is not null then
        raise exception 'Forwarded attachment path provided for a message without an attachment'
            using errcode = '22023';
    end if;

    insert into public.messages (
        sender_id,
        conversation_id,
        content,
        message_type,
        metadata,
        client_message_id,
        media_bucket,
        media_object_path
    ) values (
        v_actor_user_id,
        p_destination_conversation_id,
        v_source.content,
        v_source.message_type,
        v_metadata,
        p_client_message_id,
        case when v_has_attachment then 'chat-media' else null end,
        case when v_has_attachment then p_destination_object_path else null end
    )
    returning * into v_message;

    if v_has_attachment then
        insert into public.attachments (
            kind,
            purpose,
            created_by_user_id,
            context_conversation_id,
            message_id,
            bucket,
            object_path,
            mime_type,
            size_bytes,
            original_filename,
            metadata,
            source_type,
            client_upload_id,
            lifecycle_status,
            expires_at,
            uploaded_at,
            attached_at,
            duration_ms,
            duration_source
        ) values (
            v_source_attachment.kind,
            'message_attachment',
            v_actor_user_id,
            p_destination_conversation_id,
            v_message.id,
            'chat-media',
            p_destination_object_path,
            v_source_attachment.mime_type,
            v_source_attachment.size_bytes,
            v_source_attachment.original_filename,
            coalesce(v_source_attachment.metadata, '{}'::jsonb),
            'forwarded',
            gen_random_uuid(),
            'attached',
            now(),
            now(),
            now(),
            v_source_attachment.duration_ms,
            v_source_attachment.duration_source
        );

    end if;

    return query select v_message.id, false;
end;
$$;

revoke execute on function public.forward_message_with_attachment(uuid, uuid, uuid, uuid, text, uuid)
    from public, anon, authenticated;
grant execute on function public.forward_message_with_attachment(uuid, uuid, uuid, uuid, text, uuid)
    to service_role;
