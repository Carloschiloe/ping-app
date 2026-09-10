-- Ping: canonical message-attachment size policy.
--
-- Raises the message-attachment size ceiling from 20MB to 50MB, matching
-- backend/src/services/privateFile.service.ts's MAX_MESSAGE_ATTACHMENT_BYTES
-- (the single canonical owner of this value) and the chat-media Storage
-- bucket's file_size_limit (see supabase/storage/chat-media-private.sql,
-- the reproducible provisioning record — not merely a one-off Admin API
-- mutation). Motivated by one real physical sample: a 2:05 recorded video
-- measured ~32.8MB, which exceeded the previous 20MB cap. This does not
-- claim every 2-minute recording fits under 50MB (bitrate varies by
-- device/resolution/motion) — mobile's preflight check and this backend's
-- post-upload verification remain the actual enforcement, this migration
-- only raises the ceiling both agree on. Does not change kind/mime/
-- filename/lifecycle rules — only the size bound.

alter table public.attachments
    drop constraint attachments_size_check,
    add constraint attachments_size_check
        check (size_bytes is null or (size_bytes > 0 and size_bytes <= 52428800));

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
       or p_verified_size_bytes > 52428800 then
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

revoke execute on function public.complete_message_attachment(uuid, uuid, text, bigint)
    from public, anon, authenticated;
grant execute on function public.complete_message_attachment(uuid, uuid, text, bigint)
    to service_role;
