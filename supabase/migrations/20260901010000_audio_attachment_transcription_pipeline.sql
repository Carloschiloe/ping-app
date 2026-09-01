-- Ping C-5B: durable transcription and message-understanding pipeline for
-- canonical audio attachments. Additive only; no historical audio backfill.

alter table public.attachments
    add column duration_ms bigint,
    add column duration_source text;

alter table public.attachments
    add constraint attachments_duration_check check (
        (duration_ms is null and duration_source is null)
        or (
            kind = 'audio'
            and duration_ms > 0
            and duration_ms <= 14400000
            and duration_source = 'client_recorder'
        )
    );

comment on column public.attachments.duration_ms is
    'Client-declared recorder duration. It is not presented as server-measured media metadata.';
comment on column public.attachments.duration_source is
    'C-5B provenance for duration_ms; currently only client_recorder is accepted.';

create table public.audio_transcriptions (
    id uuid primary key default gen_random_uuid(),
    attachment_id uuid not null unique references public.attachments(id) on delete restrict,
    status text not null default 'pending',
    transcript_text text,
    provider text not null default 'openai',
    model text not null default 'whisper-1',
    pipeline_version text not null default 'c5b-v1',
    language_requested text,
    language_detected text,
    attempt_count integer not null default 0,
    next_retry_at timestamptz,
    locked_at timestamptz,
    locked_by uuid,
    last_error_code text,
    analysis_status text not null default 'pending',
    analysis_attempt_count integer not null default 0,
    analysis_next_retry_at timestamptz,
    analysis_locked_at timestamptz,
    analysis_locked_by uuid,
    analysis_last_error_code text,
    created_at timestamptz not null default now(),
    started_at timestamptz,
    completed_at timestamptz,
    updated_at timestamptz not null default now(),
    constraint audio_transcriptions_status_check
        check (status in ('pending', 'processing', 'completed', 'failed', 'cancelled')),
    constraint audio_transcriptions_analysis_status_check
        check (analysis_status in ('pending', 'processing', 'completed', 'failed', 'cancelled')),
    constraint audio_transcriptions_attempt_count_check
        check (attempt_count >= 0 and attempt_count <= 3),
    constraint audio_transcriptions_analysis_attempt_count_check
        check (analysis_attempt_count >= 0 and analysis_attempt_count <= 3),
    constraint audio_transcriptions_identity_check
        check (
            provider <> '' and length(provider) <= 50
            and model <> '' and length(model) <= 100
            and pipeline_version <> '' and length(pipeline_version) <= 50
        ),
    constraint audio_transcriptions_error_code_check
        check (
            (last_error_code is null or length(last_error_code) <= 100)
            and (analysis_last_error_code is null or length(analysis_last_error_code) <= 100)
        ),
    constraint audio_transcriptions_completed_shape_check
        check (
            status <> 'completed'
            or (
                transcript_text is not null
                and length(trim(transcript_text)) > 0
                and completed_at is not null
            )
        ),
    constraint audio_transcriptions_cancelled_shape_check
        check (status <> 'cancelled' or transcript_text is null)
);

create index audio_transcriptions_transcription_queue_idx
    on public.audio_transcriptions (status, next_retry_at, created_at)
    where status in ('pending', 'processing', 'failed');

create index audio_transcriptions_analysis_queue_idx
    on public.audio_transcriptions (analysis_status, analysis_next_retry_at, completed_at)
    where status = 'completed' and analysis_status in ('pending', 'processing', 'failed');

create trigger trg_audio_transcriptions_updated_at
    before update on public.audio_transcriptions
    for each row execute procedure public.set_updated_at();

comment on table public.audio_transcriptions is
    'C-5B durable derived transcript and message-understanding job. The source audio remains in attachments.';

-- Duration is supplied only by the recorder client at intent creation. An
-- idempotent retry must retain exactly the same declared duration.
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
    v_duration_ms bigint := case
        when jsonb_typeof(coalesce(p_metadata, '{}'::jsonb) #> '{audio,durationMs}') = 'number'
            then (p_metadata #>> '{audio,durationMs}')::bigint
        else null
    end;
begin
    if p_client_upload_id is null then
        raise exception 'client_upload_id is required' using errcode = '22023';
    end if;
    if v_duration_ms is not null and (
        p_kind <> 'audio' or v_duration_ms <= 0 or v_duration_ms > 14400000
    ) then
        raise exception 'Audio duration is invalid' using errcode = '22023';
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
           or v_attachment.kind is distinct from p_kind
           or v_attachment.duration_ms is distinct from v_duration_ms then
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
        kind, purpose, created_by_user_id, context_conversation_id,
        bucket, object_path, mime_type, original_filename, metadata,
        source_type, client_upload_id, duration_ms, duration_source
    ) values (
        p_kind, 'message_attachment', v_actor_user_id, p_conversation_id,
        p_bucket, p_object_path, p_mime_type, left(p_original_filename, 200),
        coalesce(p_metadata, '{}'::jsonb), 'mobile_upload', p_client_upload_id,
        v_duration_ms, case when v_duration_ms is not null then 'client_recorder' else null end
    )
    returning * into v_attachment;

    return v_attachment;
end;
$$;

-- Replaces the C-4B writer without changing its public signature. Audio job
-- creation occurs in the same transaction as message, receipts and attach.
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
            if p_attachment_id is not null then
                select a.* into v_attachment
                from public.attachments a
                where a.id = p_attachment_id and a.message_id = v_message.id
                for update;
                if not found then
                    raise exception 'Idempotent retry references another attachment'
                        using errcode = '22023';
                end if;
                if v_attachment.mime_type like 'audio/%' then
                    insert into public.audio_transcriptions (
                        attachment_id, provider, model, pipeline_version, language_requested
                    ) values (
                        v_attachment.id, 'openai', 'whisper-1', 'c5b-v1', 'es'
                    ) on conflict (attachment_id) do nothing;
                end if;
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
                'size', v_attachment.size_bytes,
                'durationMs', v_attachment.duration_ms
            )
        );
    end if;

    insert into public.messages (
        sender_id, conversation_id, content, metadata, reply_to_id,
        client_message_id, media_bucket, media_object_path
    ) values (
        v_actor_user_id, p_conversation_id, p_content, v_metadata, p_reply_to_id,
        p_client_message_id,
        case when p_attachment_id is not null then v_attachment.bucket else null end,
        case when p_attachment_id is not null then v_attachment.object_path else null end
    ) returning * into v_message;

    if p_attachment_id is not null then
        update public.attachments
        set message_id = v_message.id,
            lifecycle_status = 'attached',
            attached_at = now()
        where id = p_attachment_id;

        if v_attachment.mime_type like 'audio/%' then
            insert into public.audio_transcriptions (
                attachment_id, provider, model, pipeline_version, language_requested
            ) values (
                v_attachment.id, 'openai', 'whisper-1', 'c5b-v1', 'es'
            ) on conflict (attachment_id) do nothing;
        end if;
    end if;

    return query select v_message.id, false;
end;
$$;

create or replace function public.claim_audio_transcription_job(
    p_worker_id uuid
)
returns public.audio_transcriptions
language plpgsql
security definer
set search_path = public
as $$
declare
    v_job public.audio_transcriptions;
begin
    if p_worker_id is null then
        raise exception 'worker_id is required' using errcode = '22023';
    end if;

    select t.* into v_job
    from public.audio_transcriptions t
    where t.attempt_count < 3
      and (
        t.status = 'pending'
        or (t.status = 'failed' and t.next_retry_at is not null and t.next_retry_at <= now())
        or (t.status = 'processing' and t.locked_at < now() - interval '5 minutes')
      )
    order by coalesce(t.next_retry_at, t.created_at), t.created_at
    for update skip locked
    limit 1;

    if not found then
        return null;
    end if;

    update public.audio_transcriptions
    set status = 'processing',
        attempt_count = attempt_count + 1,
        locked_at = now(),
        locked_by = p_worker_id,
        started_at = coalesce(started_at, now()),
        next_retry_at = null,
        last_error_code = null
    where id = v_job.id
    returning * into v_job;

    return v_job;
end;
$$;

create or replace function public.get_audio_transcription_context(
    p_job_id uuid,
    p_worker_id uuid,
    p_phase text default 'transcription'
)
returns table (
    attachment_id uuid,
    message_id uuid,
    conversation_id uuid,
    bucket text,
    object_path text,
    mime_type text,
    size_bytes bigint,
    attachment_lifecycle text,
    message_deleted_at timestamptz,
    conversation_deleted_at timestamptz,
    transcript_text text,
    pipeline_version text
)
language plpgsql
security definer
set search_path = public
stable
as $$
begin
    return query
    select
        a.id, a.message_id, a.context_conversation_id, a.bucket, a.object_path,
        a.mime_type, a.size_bytes, a.lifecycle_status, m.deleted_at, c.deleted_at,
        t.transcript_text, t.pipeline_version
    from public.audio_transcriptions t
    join public.attachments a on a.id = t.attachment_id
    join public.messages m on m.id = a.message_id
    join public.conversations c on c.id = a.context_conversation_id
    where t.id = p_job_id
      and (
        (p_phase = 'transcription' and t.status = 'processing' and t.locked_by = p_worker_id)
        or
        (p_phase = 'analysis' and t.status = 'completed'
            and t.analysis_status = 'processing' and t.analysis_locked_by = p_worker_id)
      );
end;
$$;

create or replace function public.complete_audio_transcription_job(
    p_job_id uuid,
    p_worker_id uuid,
    p_transcript_text text,
    p_language_detected text default null
)
returns public.audio_transcriptions
language plpgsql
security definer
set search_path = public
as $$
declare
    v_job public.audio_transcriptions;
    v_active boolean;
begin
    select * into v_job from public.audio_transcriptions where id = p_job_id for update;
    if not found then raise exception 'Transcription job not found' using errcode = 'P0002'; end if;
    if v_job.status <> 'processing' or v_job.locked_by is distinct from p_worker_id then
        raise exception 'Transcription job lease is not owned by worker' using errcode = '55000';
    end if;

    select (
        a.lifecycle_status = 'attached'
        and a.mime_type like 'audio/%'
        and m.deleted_at is null
        and c.deleted_at is null
    ) into v_active
    from public.attachments a
    join public.messages m on m.id = a.message_id
    join public.conversations c on c.id = a.context_conversation_id
    where a.id = v_job.attachment_id;

    if coalesce(v_active, false) = false then
        update public.audio_transcriptions
        set status = 'cancelled', transcript_text = null, completed_at = null,
            locked_at = null, locked_by = null, next_retry_at = null,
            last_error_code = 'source_unavailable', analysis_status = 'cancelled'
        where id = p_job_id returning * into v_job;
        return v_job;
    end if;

    if p_transcript_text is null or length(trim(p_transcript_text)) = 0 then
        raise exception 'Transcript is empty' using errcode = '22023';
    end if;

    update public.audio_transcriptions
    set status = 'completed', transcript_text = p_transcript_text,
        language_detected = nullif(trim(p_language_detected), ''),
        completed_at = now(), locked_at = null, locked_by = null,
        next_retry_at = null, last_error_code = null,
        analysis_status = 'pending'
    where id = p_job_id returning * into v_job;
    return v_job;
end;
$$;

create or replace function public.fail_audio_transcription_job(
    p_job_id uuid,
    p_worker_id uuid,
    p_error_code text,
    p_retryable boolean
)
returns public.audio_transcriptions
language plpgsql
security definer
set search_path = public
as $$
declare
    v_job public.audio_transcriptions;
    v_retry_at timestamptz;
begin
    select * into v_job from public.audio_transcriptions where id = p_job_id for update;
    if not found then raise exception 'Transcription job not found' using errcode = 'P0002'; end if;
    if v_job.status <> 'processing' or v_job.locked_by is distinct from p_worker_id then
        raise exception 'Transcription job lease is not owned by worker' using errcode = '55000';
    end if;

    if p_retryable and v_job.attempt_count < 3 then
        v_retry_at := now() + case v_job.attempt_count
            when 1 then interval '30 seconds'
            when 2 then interval '2 minutes'
            else interval '10 minutes'
        end;
    end if;

    update public.audio_transcriptions
    set status = 'failed', transcript_text = null, completed_at = null,
        locked_at = null, locked_by = null, next_retry_at = v_retry_at,
        last_error_code = left(coalesce(nullif(trim(p_error_code), ''), 'provider_error'), 100)
    where id = p_job_id returning * into v_job;
    return v_job;
end;
$$;

create or replace function public.cancel_audio_transcription_job(
    p_job_id uuid,
    p_worker_id uuid,
    p_error_code text default 'source_unavailable'
)
returns public.audio_transcriptions
language plpgsql
security definer
set search_path = public
as $$
declare
    v_job public.audio_transcriptions;
begin
    select * into v_job from public.audio_transcriptions where id = p_job_id for update;
    if not found then raise exception 'Transcription job not found' using errcode = 'P0002'; end if;
    if v_job.status = 'processing' and v_job.locked_by is distinct from p_worker_id then
        raise exception 'Transcription job lease is not owned by worker' using errcode = '55000';
    end if;
    update public.audio_transcriptions
    set status = 'cancelled', transcript_text = null, completed_at = null,
        locked_at = null, locked_by = null, next_retry_at = null,
        last_error_code = left(coalesce(p_error_code, 'source_unavailable'), 100),
        analysis_status = 'cancelled', analysis_locked_at = null,
        analysis_locked_by = null, analysis_next_retry_at = null
    where id = p_job_id returning * into v_job;
    return v_job;
end;
$$;

create or replace function public.claim_audio_transcription_analysis(
    p_worker_id uuid
)
returns public.audio_transcriptions
language plpgsql
security definer
set search_path = public
as $$
declare
    v_job public.audio_transcriptions;
begin
    select t.* into v_job
    from public.audio_transcriptions t
    where t.status = 'completed'
      and t.analysis_attempt_count < 3
      and (
        t.analysis_status = 'pending'
        or (t.analysis_status = 'failed' and t.analysis_next_retry_at is not null
            and t.analysis_next_retry_at <= now())
        or (t.analysis_status = 'processing'
            and t.analysis_locked_at < now() - interval '5 minutes')
      )
    order by coalesce(t.analysis_next_retry_at, t.completed_at), t.created_at
    for update skip locked
    limit 1;
    if not found then return null; end if;

    update public.audio_transcriptions
    set analysis_status = 'processing',
        analysis_attempt_count = analysis_attempt_count + 1,
        analysis_locked_at = now(), analysis_locked_by = p_worker_id,
        analysis_next_retry_at = null, analysis_last_error_code = null
    where id = v_job.id returning * into v_job;
    return v_job;
end;
$$;

create or replace function public.complete_audio_transcription_analysis(
    p_job_id uuid,
    p_worker_id uuid,
    p_suggested_task jsonb default null
)
returns public.audio_transcriptions
language plpgsql
security definer
set search_path = public
as $$
declare
    v_job public.audio_transcriptions;
    v_message_id uuid;
    v_attachment_id uuid;
    v_active boolean;
    v_suggestion jsonb;
begin
    select * into v_job from public.audio_transcriptions where id = p_job_id for update;
    if not found then raise exception 'Transcription job not found' using errcode = 'P0002'; end if;
    if v_job.status <> 'completed' or v_job.analysis_status <> 'processing'
       or v_job.analysis_locked_by is distinct from p_worker_id then
        raise exception 'Analysis job lease is not owned by worker' using errcode = '55000';
    end if;

    select a.message_id, a.id, (
        a.lifecycle_status = 'attached' and m.deleted_at is null and c.deleted_at is null
    ) into v_message_id, v_attachment_id, v_active
    from public.attachments a
    join public.messages m on m.id = a.message_id
    join public.conversations c on c.id = a.context_conversation_id
    where a.id = v_job.attachment_id
    for update of m;

    if coalesce(v_active, false) = false then
        update public.audio_transcriptions
        set analysis_status = 'cancelled', analysis_locked_at = null,
            analysis_locked_by = null, analysis_next_retry_at = null,
            analysis_last_error_code = 'source_unavailable'
        where id = p_job_id returning * into v_job;
        return v_job;
    end if;

    if p_suggested_task is not null then
        v_suggestion := p_suggested_task || jsonb_build_object(
            'sourceType', 'audio_transcription',
            'transcriptionId', v_job.id,
            'attachmentId', v_attachment_id,
            'pipelineVersion', v_job.pipeline_version
        );
        update public.messages
        set metadata = coalesce(metadata, '{}'::jsonb)
            || jsonb_build_object('suggestedTask', v_suggestion)
        where id = v_message_id;
    end if;

    update public.audio_transcriptions
    set analysis_status = 'completed', analysis_locked_at = null,
        analysis_locked_by = null, analysis_next_retry_at = null,
        analysis_last_error_code = null
    where id = p_job_id returning * into v_job;
    return v_job;
end;
$$;

create or replace function public.fail_audio_transcription_analysis(
    p_job_id uuid,
    p_worker_id uuid,
    p_error_code text,
    p_retryable boolean
)
returns public.audio_transcriptions
language plpgsql
security definer
set search_path = public
as $$
declare
    v_job public.audio_transcriptions;
    v_retry_at timestamptz;
begin
    select * into v_job from public.audio_transcriptions where id = p_job_id for update;
    if not found then raise exception 'Transcription job not found' using errcode = 'P0002'; end if;
    if v_job.analysis_status <> 'processing'
       or v_job.analysis_locked_by is distinct from p_worker_id then
        raise exception 'Analysis job lease is not owned by worker' using errcode = '55000';
    end if;
    if p_retryable and v_job.analysis_attempt_count < 3 then
        v_retry_at := now() + case v_job.analysis_attempt_count
            when 1 then interval '30 seconds'
            when 2 then interval '2 minutes'
            else interval '10 minutes'
        end;
    end if;
    update public.audio_transcriptions
    set analysis_status = 'failed', analysis_locked_at = null,
        analysis_locked_by = null, analysis_next_retry_at = v_retry_at,
        analysis_last_error_code = left(coalesce(nullif(trim(p_error_code), ''), 'analysis_error'), 100)
    where id = p_job_id returning * into v_job;
    return v_job;
end;
$$;

-- Atomic metadata merge for the existing text-message understanding path.
create or replace function public.merge_message_suggested_task(
    p_message_id uuid,
    p_suggested_task jsonb
)
returns public.messages
language plpgsql
security definer
set search_path = public
as $$
declare
    v_message public.messages;
begin
    if p_suggested_task is null then
        raise exception 'suggestedTask is required' using errcode = '22023';
    end if;
    update public.messages m
    set metadata = coalesce(m.metadata, '{}'::jsonb)
        || jsonb_build_object('suggestedTask', p_suggested_task)
    from public.conversations c
    where m.id = p_message_id
      and c.id = m.conversation_id
      and m.deleted_at is null
      and c.deleted_at is null
    returning m.* into v_message;
    if not found then
        raise exception 'Message is unavailable' using errcode = 'P0002';
    end if;
    return v_message;
end;
$$;

-- Tombstone cancels pending/in-flight derived work atomically and discards a
-- transcript if it was produced before deletion. The source audio provenance
-- remains on the tombstoned attachment as established by C-4B.
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
    select * into v_message from public.messages where id = p_message_id for update;
    if not found then raise exception 'Message not found' using errcode = 'P0002'; end if;
    if v_message.sender_id is distinct from v_actor_user_id and not exists (
        select 1 from public.conversation_participants cp
        where cp.conversation_id = v_message.conversation_id
          and cp.user_id = v_actor_user_id and cp.role = 'admin'
    ) then
        raise exception 'Actor cannot delete this message' using errcode = '42501';
    end if;

    if v_message.deleted_at is null then
        update public.messages
        set deleted_at = now(), deleted_by_user_id = v_actor_user_id,
            deletion_reason = left(coalesce(nullif(trim(p_reason), ''), 'user_deleted'), 100)
        where id = p_message_id returning * into v_message;

        update public.audio_transcriptions t
        set status = 'cancelled', transcript_text = null, completed_at = null,
            locked_at = null, locked_by = null, next_retry_at = null,
            last_error_code = 'message_tombstoned',
            analysis_status = 'cancelled', analysis_locked_at = null,
            analysis_locked_by = null, analysis_next_retry_at = null,
            analysis_last_error_code = 'message_tombstoned'
        from public.attachments a
        where a.message_id = p_message_id and t.attachment_id = a.id;

        update public.attachments
        set lifecycle_status = 'tombstoned', tombstoned_at = now()
        where message_id = p_message_id and lifecycle_status = 'attached';

        insert into public.message_events (
            message_id, conversation_id, actor_user_id, event_type, details
        ) values (
            v_message.id, v_message.conversation_id, v_actor_user_id,
            'tombstoned', jsonb_build_object('reason', v_message.deletion_reason)
        );
    end if;
    return v_message;
end;
$$;

alter table public.audio_transcriptions enable row level security;

create policy audio_transcriptions_select_authorized
    on public.audio_transcriptions for select
    to authenticated
    using (
        exists (
            select 1
            from public.attachments a
            join public.messages m on m.id = a.message_id
            join public.conversations c on c.id = a.context_conversation_id
            where a.id = audio_transcriptions.attachment_id
              and a.lifecycle_status = 'attached'
              and m.deleted_at is null
              and c.deleted_at is null
              and public.is_conversation_participant(c.id, auth.uid())
        )
    );

revoke all on table public.audio_transcriptions from anon, authenticated;
grant select on table public.audio_transcriptions to authenticated;
grant all on table public.audio_transcriptions to service_role;

revoke execute on function public.create_message_attachment_intent(uuid, uuid, text, text, text, uuid, text, text, jsonb)
    from public, anon, authenticated;
grant execute on function public.create_message_attachment_intent(uuid, uuid, text, text, text, uuid, text, text, jsonb)
    to service_role;

revoke execute on function public.persist_message_with_attachment(uuid, uuid, text, uuid, uuid, jsonb, uuid)
    from public, anon, authenticated;
grant execute on function public.persist_message_with_attachment(uuid, uuid, text, uuid, uuid, jsonb, uuid)
    to service_role;

revoke execute on function public.claim_audio_transcription_job(uuid) from public, anon, authenticated;
revoke execute on function public.get_audio_transcription_context(uuid, uuid, text) from public, anon, authenticated;
revoke execute on function public.complete_audio_transcription_job(uuid, uuid, text, text) from public, anon, authenticated;
revoke execute on function public.fail_audio_transcription_job(uuid, uuid, text, boolean) from public, anon, authenticated;
revoke execute on function public.cancel_audio_transcription_job(uuid, uuid, text) from public, anon, authenticated;
revoke execute on function public.claim_audio_transcription_analysis(uuid) from public, anon, authenticated;
revoke execute on function public.complete_audio_transcription_analysis(uuid, uuid, jsonb) from public, anon, authenticated;
revoke execute on function public.fail_audio_transcription_analysis(uuid, uuid, text, boolean) from public, anon, authenticated;
revoke execute on function public.merge_message_suggested_task(uuid, jsonb) from public, anon, authenticated;

grant execute on function public.claim_audio_transcription_job(uuid) to service_role;
grant execute on function public.get_audio_transcription_context(uuid, uuid, text) to service_role;
grant execute on function public.complete_audio_transcription_job(uuid, uuid, text, text) to service_role;
grant execute on function public.fail_audio_transcription_job(uuid, uuid, text, boolean) to service_role;
grant execute on function public.cancel_audio_transcription_job(uuid, uuid, text) to service_role;
grant execute on function public.claim_audio_transcription_analysis(uuid) to service_role;
grant execute on function public.complete_audio_transcription_analysis(uuid, uuid, jsonb) to service_role;
grant execute on function public.fail_audio_transcription_analysis(uuid, uuid, text, boolean) to service_role;
grant execute on function public.merge_message_suggested_task(uuid, jsonb) to service_role;

revoke execute on function public.tombstone_message(uuid, uuid, text) from public, anon;
grant execute on function public.tombstone_message(uuid, uuid, text) to authenticated, service_role;
