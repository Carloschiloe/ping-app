\set ON_ERROR_STOP on
begin;

insert into auth.users (id, email) values
    ('a5100000-0000-4000-8000-000000000001', 'c5b-a@example.test'),
    ('a5100000-0000-4000-8000-000000000002', 'c5b-b@example.test'),
    ('a5100000-0000-4000-8000-000000000003', 'c5b-c@example.test');

select public.create_conversation_with_participants(
    'a5100000-0000-4000-8000-000000000001',
    'group',
    array[
        'a5100000-0000-4000-8000-000000000001'::uuid,
        'a5100000-0000-4000-8000-000000000002'::uuid
    ],
    'C-5B integration', null, false
) as conversation_id \gset c5b_

select id as attachment_id
from public.create_message_attachment_intent(
    'a5100000-0000-4000-8000-000000000001',
    :'c5b_conversation_id',
    'audio', 'audio/m4a', 'voice.m4a',
    'a5100000-0000-4000-8000-000000000010',
    'chat-media',
    'conversations/c5b/attachments/a/voice.m4a',
    '{"audio":{"durationMs":4200,"durationSource":"client_recorder"}}'::jsonb
) \gset c5b_

select public.complete_message_attachment(
    :'c5b_attachment_id',
    'a5100000-0000-4000-8000-000000000001',
    'audio/m4a',
    512
);

select message_id
from public.persist_message_with_attachment(
    'a5100000-0000-4000-8000-000000000001',
    :'c5b_conversation_id',
    'Audio', null,
    'a5100000-0000-4000-8000-000000000020',
    '{"concurrentMetadata":"preserved"}'::jsonb,
    :'c5b_attachment_id'
) \gset c5b_

create temporary table c5b_test_context (
    attachment_id uuid not null,
    message_id uuid not null,
    job_id uuid
) on commit drop;

insert into c5b_test_context (attachment_id, message_id)
values (:'c5b_attachment_id', :'c5b_message_id');

grant select on c5b_test_context to authenticated;

do $$
declare
    v_attachment public.attachments;
    v_message public.messages;
    v_jobs integer;
begin
    select * into v_attachment from public.attachments
    where id = (select attachment_id from c5b_test_context);
    select * into v_message from public.messages
    where id = (select message_id from c5b_test_context);
    select count(*) into v_jobs from public.audio_transcriptions
    where attachment_id = v_attachment.id;

    if v_attachment.duration_ms <> 4200
       or v_attachment.duration_source <> 'client_recorder'
       or v_attachment.lifecycle_status <> 'attached'
       or v_message.content <> 'Audio'
       or v_jobs <> 1 then
        raise exception 'atomic audio message/job contract failed';
    end if;
    if v_message.metadata ? 'transcript'
       or v_message.metadata::text ilike '%signed%'
       or v_message.metadata::text ilike '%token%' then
        raise exception 'derived text or credentials leaked into original message';
    end if;
end $$;

-- Message retry must not create a second durable job.
select * from public.persist_message_with_attachment(
    'a5100000-0000-4000-8000-000000000001',
    :'c5b_conversation_id',
    'Audio', null,
    'a5100000-0000-4000-8000-000000000020',
    '{}'::jsonb,
    :'c5b_attachment_id'
);

do $$
begin
    if (select count(*) from public.audio_transcriptions
        where attachment_id = (select attachment_id from c5b_test_context)) <> 1 then
        raise exception 'idempotent retry duplicated transcription job';
    end if;
end $$;

-- Claim, abandoned lease recovery and controlled retry.
select id as job_id from public.claim_audio_transcription_job(
    'a5100000-0000-4000-8000-000000000101'
) \gset c5b_

update c5b_test_context set job_id = :'c5b_job_id';

update public.audio_transcriptions
set locked_at = now() - interval '10 minutes'
where id = :'c5b_job_id';

select id as recovered_job_id from public.claim_audio_transcription_job(
    'a5100000-0000-4000-8000-000000000102'
) \gset c5b_

select public.fail_audio_transcription_job(
    :'c5b_recovered_job_id',
    'a5100000-0000-4000-8000-000000000102',
    'provider_timeout',
    true
);

do $$
declare v_job public.audio_transcriptions;
begin
    select * into v_job from public.audio_transcriptions
    where id = (select job_id from c5b_test_context);
    if v_job.status <> 'failed' or v_job.attempt_count <> 2 or v_job.next_retry_at is null then
        raise exception 'transient retry contract failed';
    end if;
end $$;

update public.audio_transcriptions
set next_retry_at = now() - interval '1 second'
where id = :'c5b_job_id';

select id as final_job_id from public.claim_audio_transcription_job(
    'a5100000-0000-4000-8000-000000000103'
) \gset c5b_

select public.complete_audio_transcription_job(
    :'c5b_final_job_id',
    'a5100000-0000-4000-8000-000000000103',
    'Recuérdame llamar a Juan mañana',
    'es'
);

select id as analysis_job_id from public.claim_audio_transcription_analysis(
    'a5100000-0000-4000-8000-000000000103'
) \gset c5b_

select public.complete_audio_transcription_analysis(
    :'c5b_analysis_job_id',
    'a5100000-0000-4000-8000-000000000103',
    '{"title":"Llamar a Juan","dueAt":"2026-09-02T12:00:00.000Z","replyText":"Agendar","type":"meeting"}'::jsonb
);

do $$
declare v_message public.messages; v_job public.audio_transcriptions;
begin
    select * into v_message from public.messages where id = (select message_id from c5b_test_context);
    select * into v_job from public.audio_transcriptions where id = (select job_id from c5b_test_context);
    if v_message.content <> 'Audio'
       or v_message.metadata->>'concurrentMetadata' <> 'preserved'
       or v_message.metadata #>> '{suggestedTask,sourceType}' <> 'audio_transcription'
       or v_message.metadata #>> '{suggestedTask,attachmentId}' <> (select attachment_id::text from c5b_test_context)
       or v_job.analysis_status <> 'completed' then
        raise exception 'atomic suggestion merge/provenance failed';
    end if;
    if exists (select 1 from public.commitments where message_id = v_message.id) then
        raise exception 'audio analysis created a commitment without confirmation';
    end if;
end $$;

-- RLS: active participants can read; outsider cannot; direct writes fail.
set local role authenticated;
select set_config('request.jwt.claim.sub', 'a5100000-0000-4000-8000-000000000002', true);
do $$ begin
    if (select count(*) from public.audio_transcriptions
        where id = (select job_id from c5b_test_context)) <> 1 then
        raise exception 'participant cannot read transcription state';
    end if;
    begin
        update public.audio_transcriptions set status = 'failed'
        where id = (select job_id from c5b_test_context);
        raise exception 'authenticated direct write unexpectedly succeeded';
    exception when insufficient_privilege then null;
    end;
end $$;

select set_config('request.jwt.claim.sub', 'a5100000-0000-4000-8000-000000000003', true);
do $$ begin
    if (select count(*) from public.audio_transcriptions
        where id = (select job_id from c5b_test_context)) <> 0 then
        raise exception 'outsider read transcription through RLS';
    end if;
end $$;
reset role;

-- A tombstone cancels derived state and discards the transcript atomically.
-- Simulate a provider call already in flight before the tombstone wins.
update public.audio_transcriptions
set status = 'processing', transcript_text = null, completed_at = null,
    locked_by = 'a5100000-0000-4000-8000-000000000104', locked_at = now(),
    analysis_status = 'pending'
where id = (select job_id from c5b_test_context);

select set_config('request.jwt.claim.sub', 'a5100000-0000-4000-8000-000000000001', true);
select public.tombstone_message(
    :'c5b_message_id',
    'a5100000-0000-4000-8000-000000000001',
    'integration_test'
);

do $$
begin
    begin
        perform public.complete_audio_transcription_job(
            (select job_id from c5b_test_context),
            'a5100000-0000-4000-8000-000000000104',
            'This late provider result must be discarded',
            'es'
        );
        raise exception 'late provider result unexpectedly persisted';
    exception when object_not_in_prerequisite_state then null;
    end;
end $$;

do $$
declare v_job public.audio_transcriptions; v_message public.messages;
begin
    select * into v_job from public.audio_transcriptions where id = (select job_id from c5b_test_context);
    select * into v_message from public.messages where id = (select message_id from c5b_test_context);
    if v_job.status <> 'cancelled' or v_job.transcript_text is not null
       or v_job.analysis_status <> 'cancelled' or v_message.content <> 'Audio' then
        raise exception 'tombstone did not cancel/discard derived transcript safely';
    end if;
end $$;

rollback;
