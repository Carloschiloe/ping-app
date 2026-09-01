import 'dotenv/config';
import { readFile } from 'node:fs/promises';
import { randomBytes, randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

const PROJECT_REF = 'oonijgmddgyymhrlnvuu';
const required = [
  'SUPABASE_URL', 'SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_ROLE_KEY',
  'SUPABASE_ACCESS_TOKEN', 'OPENAI_API_KEY', 'PING_C5C_AUDIO_FIXTURE',
];
for (const name of required) {
  if (!process.env[name]) throw new Error(`Missing required environment variable: ${name}`);
}

const target = new URL(process.env.SUPABASE_URL);
if (target.protocol !== 'https:' || target.hostname !== `${PROJECT_REF}.supabase.co`) {
  throw new Error('C-5C staging target mismatch');
}

Object.assign(process.env, {
  NODE_ENV: 'test',
  PING_ENVIRONMENT: 'staging-c5c-certification',
  PING_EXPECTED_SUPABASE_PROJECT_REF: PROJECT_REF,
  ENCRYPTION_KEY: 'c5c-staging-only-encryption-key',
  ENABLE_NON_MVP_CAPABILITIES: 'false',
  ENABLE_PRIVATE_FILE_READS: 'true',
  ENABLE_PRIVATE_FILE_UPLOADS: 'true',
  ENABLE_PRIVATE_AVATAR_UPLOADS: 'false',
  ENABLE_PRIVATE_MESSAGE_UPLOADS: 'true',
  ENABLE_OPERATION_MODULE: 'false',
  ENABLE_CALENDAR_INTEGRATION: 'false',
  ENABLE_CALLS: 'false',
  ENABLE_AUTOMATIONS: 'false',
  RUN_CRON_JOBS: 'false',
});

const fetchWithTimeout = (input, init = {}) => {
  const timeout = AbortSignal.timeout(45_000);
  const signal = init.signal ? AbortSignal.any([init.signal, timeout]) : timeout;
  return fetch(input, { ...init, signal });
};

const admin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
  global: { fetch: fetchWithTimeout },
});
const publicClient = () => createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
  global: { fetch: fetchWithTimeout },
});

const marker = `ping-c5c-staging-${randomUUID()}`;
const password = randomBytes(24).toString('base64url');
const userIds = [];
const conversationIds = new Set();
const messageIds = new Set();
const attachmentIds = new Set();
const transcriptionIds = new Set();
const objectPaths = new Set();
const checks = [];
let server;

function check(name, condition) {
  if (!condition) throw new Error(`Check failed: ${name}`);
  checks.push(name);
}

function rpcRow(data) {
  return Array.isArray(data) ? data[0] ?? null : data;
}

function uuidList(values) {
  const ids = [...values];
  for (const value of ids) {
    if (!/^[0-9a-f-]{36}$/i.test(value)) throw new Error('Unsafe cleanup identifier');
  }
  return ids.length ? ids.map((value) => `'${value}'::uuid`).join(',') : 'null::uuid';
}

function textList(values) {
  const items = [...values];
  for (const value of items) {
    if (typeof value !== 'string' || !/^conversations\/[a-z0-9/_-]+\.[a-z0-9]+$/i.test(value)) {
      throw new Error('Unsafe storage cleanup path');
    }
  }
  return items.length ? items.map((value) => `'${value}'`).join(',') : 'null::text';
}

function wavDurationMs(bytes) {
  if (bytes.toString('ascii', 0, 4) !== 'RIFF' || bytes.toString('ascii', 8, 12) !== 'WAVE') {
    throw new Error('C-5C fixture is not a WAV file');
  }
  let offset = 12;
  let byteRate;
  let dataSize;
  while (offset + 8 <= bytes.length) {
    const chunk = bytes.toString('ascii', offset, offset + 4);
    const size = bytes.readUInt32LE(offset + 4);
    if (chunk === 'fmt ' && size >= 16) byteRate = bytes.readUInt32LE(offset + 16);
    if (chunk === 'data') { dataSize = size; break; }
    offset += 8 + size + (size % 2);
  }
  if (!byteRate || !dataSize) throw new Error('WAV duration metadata is unavailable');
  return Math.max(1, Math.round((dataSize / byteRate) * 1000));
}

async function managementSql(query) {
  const response = await fetchWithTimeout(
    `https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.SUPABASE_ACCESS_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query }),
    },
  );
  const text = await response.text();
  if (!response.ok) throw new Error(`Management SQL HTTP ${response.status}`);
  return text ? JSON.parse(text) : null;
}

async function createUser(label) {
  const email = `${marker}-${label}@example.invalid`;
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (error || !data.user) throw error || new Error(`Could not create user ${label}`);
  userIds.push(data.user.id);
  const { error: profileError } = await admin.from('profiles').upsert({
    id: data.user.id,
    email,
    full_name: `C5C ${label}`,
  });
  if (profileError) throw profileError;
  const client = publicClient();
  const { data: session, error: signInError } = await client.auth.signInWithPassword({ email, password });
  if (signInError || !session.session?.access_token) throw signInError || new Error('Sign-in failed');
  return { id: data.user.id, email, token: session.session.access_token, client };
}

async function waitFor(label, read, predicate, timeoutMs = 180_000) {
  const deadline = Date.now() + timeoutMs;
  let latest;
  while (Date.now() < deadline) {
    latest = await read();
    if (predicate(latest)) return latest;
    await new Promise((resolve) => setTimeout(resolve, 1_500));
  }
  throw new Error(`${label} timed out`);
}

async function cleanup() {
  if (objectPaths.size) {
    const { error } = await admin.storage.from('chat-media').remove([...objectPaths]);
    if (error) throw error;
  }

  const conversations = uuidList(conversationIds);
  const messages = uuidList(messageIds);
  const attachments = uuidList(attachmentIds);
  const transcriptions = uuidList(transcriptionIds);
  await managementSql(`
begin;
alter table public.messages disable trigger user;
alter table public.conversations disable trigger user;
delete from public.audio_transcriptions
where id in (${transcriptions}) or attachment_id in (${attachments});
delete from public.message_events
where message_id in (${messages}) or conversation_id in (${conversations});
delete from public.message_reactions
where message_id in (${messages}) or message_id in (
  select id from public.messages where conversation_id in (${conversations})
);
delete from public.message_receipts
where message_id in (${messages}) or message_id in (
  select id from public.messages where conversation_id in (${conversations})
);
delete from public.attachments
where id in (${attachments}) or context_conversation_id in (${conversations});
delete from public.messages
where id in (${messages}) or conversation_id in (${conversations});
delete from public.conversation_participants where conversation_id in (${conversations});
delete from public.conversations where id in (${conversations});
alter table public.conversations enable trigger user;
alter table public.messages enable trigger user;
commit;
  `);

  for (const userId of userIds) {
    const { error } = await admin.auth.admin.deleteUser(userId);
    if (error) throw error;
  }

  const verification = await managementSql(`
select jsonb_build_object(
  'users', (select count(*) from auth.users where id in (${uuidList(userIds)})),
  'profiles', (select count(*) from public.profiles where id in (${uuidList(userIds)})),
  'conversations', (select count(*) from public.conversations where id in (${conversations})),
  'messages', (select count(*) from public.messages where id in (${messages}) or conversation_id in (${conversations})),
  'attachments', (select count(*) from public.attachments where id in (${attachments}) or context_conversation_id in (${conversations})),
  'audio_transcriptions', (select count(*) from public.audio_transcriptions where id in (${transcriptions}) or attachment_id in (${attachments})),
  'storage_objects', (select count(*) from storage.objects where bucket_id='chat-media' and name in (${textList(objectPaths)}))
) as cleanup;
  `);
  const result = verification?.[0]?.cleanup;
  if (!result || Object.values(result).some((value) => Number(value) !== 0)) {
    throw new Error('C-5C cleanup verification failed');
  }
  return result;
}

let runError;
try {
  const fixture = await readFile(process.env.PING_C5C_AUDIO_FIXTURE);
  const durationMs = wavDurationMs(fixture);
  check('real WAV fixture is small and has duration', fixture.length > 1000 && fixture.length < 1_000_000 && durationMs > 500);

  const a = await createUser('a');
  const b = await createUser('b');
  const c = await createUser('c');

  const { data: conversationId, error: conversationError } = await admin.rpc(
    'create_conversation_with_participants',
    {
      p_creator_user_id: a.id,
      p_conversation_type: 'group',
      p_participant_ids: [a.id, b.id],
      p_name: marker,
      p_avatar_url: null,
      p_reuse_existing: false,
    },
  );
  if (conversationError || !conversationId) throw conversationError || new Error('Could not create conversation');
  conversationIds.add(conversationId);

  const { app } = await import('../dist/app.js');
  const worker = await import('../dist/services/audioTranscriptionWorker.service.js');
  server = app.listen(0, '127.0.0.1');
  await new Promise((resolve, reject) => {
    server.once('listening', resolve);
    server.once('error', reject);
  });
  const baseUrl = `http://127.0.0.1:${server.address().port}/api`;

  async function request(route, { token, method = 'GET', body } = {}) {
    const response = await fetchWithTimeout(`${baseUrl}${route}`, {
      method,
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    const text = await response.text();
    let payload;
    try { payload = text ? JSON.parse(text) : null; } catch { payload = text; }
    return { response, payload };
  }

  async function createAudio(label) {
    const intent = await request('/attachments/upload-intents', {
      token: a.token,
      method: 'POST',
      body: {
        conversationId,
        mimeType: 'audio/wav',
        originalFilename: `${label}.wav`,
        clientUploadId: randomUUID(),
        durationMs,
        metadata: { marker, label },
      },
    });
    check(`${label}: upload intent created`, intent.response.status === 201 && Boolean(intent.payload?.attachmentId));
    attachmentIds.add(intent.payload.attachmentId);
    objectPaths.add(intent.payload.upload.objectPath);
    const { error: uploadError } = await a.client.storage
      .from(intent.payload.upload.bucket)
      .uploadToSignedUrl(intent.payload.upload.objectPath, intent.payload.upload.token, fixture, {
        contentType: 'audio/wav',
      });
    if (uploadError) throw uploadError;
    const completed = await request(`/attachments/${intent.payload.attachmentId}/complete`, {
      token: a.token,
      method: 'POST',
    });
    check(`${label}: real Storage upload completed`, completed.response.status === 200);
    return intent.payload;
  }

  async function persistDirect(attachmentId, label) {
    const { data, error } = await admin.rpc('persist_message_with_attachment', {
      p_actor_user_id: a.id,
      p_conversation_id: conversationId,
      p_content: 'Audio',
      p_reply_to_id: null,
      p_client_message_id: randomUUID(),
      p_metadata: { marker, label },
      p_attachment_id: attachmentId,
    });
    if (error) throw error;
    const row = Array.isArray(data) ? data[0] : data;
    messageIds.add(row.message_id);
    return row.message_id;
  }

  const main = await createAudio('main');
  const sendStarted = performance.now();
  const sent = await request(`/conversations/${conversationId}/messages`, {
    token: a.token,
    method: 'POST',
    body: {
      text: 'Audio',
      client_message_id: randomUUID(),
      attachmentId: main.attachmentId,
    },
  });
  const sendElapsedMs = Math.round(performance.now() - sendStarted);
  check('audio HTTP send completed without waiting for provider', sent.response.status === 201 && sendElapsedMs < 10_000);
  const mainMessageId = sent.payload.message.id;
  messageIds.add(mainMessageId);

  const { data: mainAttachment, error: attachmentError } = await admin.from('attachments')
    .select('*').eq('id', main.attachmentId).single();
  if (attachmentError) throw attachmentError;
  check('message remains Audio and Attachment is attached',
    sent.payload.message.content === 'Audio'
      && mainAttachment.lifecycle_status === 'attached'
      && mainAttachment.message_id === mainMessageId);
  check('client recorder duration persisted',
    Number(mainAttachment.duration_ms) === durationMs
      && mainAttachment.duration_source === 'client_recorder');

  const { data: initialJobs, error: initialJobError } = await admin.from('audio_transcriptions')
    .select('*').eq('attachment_id', main.attachmentId);
  if (initialJobError) throw initialJobError;
  check('exactly one durable job exists immediately', initialJobs.length === 1);
  transcriptionIds.add(initialJobs[0].id);

  await worker.runAudioTranscriptionSweep();
  const completedJob = await waitFor(
    'real OpenAI transcription and analysis',
    async () => {
      const { data, error } = await admin.from('audio_transcriptions')
        .select('*').eq('attachment_id', main.attachmentId).single();
      if (error) throw error;
      return data;
    },
    (row) => row.status === 'completed' && row.analysis_status === 'completed',
  );
  check('OpenAI real transcription completed',
    completedJob.provider === 'openai'
      && completedJob.model === 'whisper-1'
      && completedJob.pipeline_version === 'c5b-v1'
      && typeof completedJob.transcript_text === 'string'
      && completedJob.transcript_text.length > 10);
  const normalizedTranscript = completedJob.transcript_text
    .toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  check('real transcript preserves fixture intent',
    normalizedTranscript.includes('juan')
      && (normalizedTranscript.includes('llamar') || normalizedTranscript.includes('llame')));

  const { data: analyzedMessage, error: analyzedMessageError } = await admin.from('messages')
    .select('id, content, metadata').eq('id', mainMessageId).single();
  if (analyzedMessageError) throw analyzedMessageError;
  const audioSuggestion = analyzedMessage.metadata?.suggestedTask;
  check('audio suggestion and provenance persisted',
    analyzedMessage.content === 'Audio'
      && Boolean(audioSuggestion?.title)
      && Boolean(audioSuggestion?.dueAt)
      && audioSuggestion.sourceType === 'audio_transcription'
      && audioSuggestion.transcriptionId === completedJob.id
      && audioSuggestion.attachmentId === main.attachmentId
      && audioSuggestion.pipelineVersion === 'c5b-v1');

  const { count: autoCommitments } = await admin.from('commitments')
    .select('*', { count: 'exact', head: true }).eq('message_id', mainMessageId);
  check('audio analysis did not create Commitment', autoCommitments === 0);

  const textSent = await request(`/conversations/${conversationId}/messages`, {
    token: a.token,
    method: 'POST',
    body: { text: 'Recuérdame llamar a Juan mañana.', client_message_id: randomUUID() },
  });
  check('equivalent text message sent', textSent.response.status === 201);
  const textMessageId = textSent.payload.message.id;
  messageIds.add(textMessageId);
  const textMessage = await waitFor(
    'text suggestion',
    async () => {
      const { data, error } = await admin.from('messages').select('metadata').eq('id', textMessageId).single();
      if (error) throw error;
      return data;
    },
    (row) => Boolean(row.metadata?.suggestedTask?.title && row.metadata?.suggestedTask?.dueAt),
    90_000,
  );
  const textSuggestion = textMessage.metadata.suggestedTask;
  check('text and audio retain same commitment intent',
    /juan|llamar/i.test(`${audioSuggestion.title} ${textSuggestion.title}`)
      && new Date(audioSuggestion.dueAt).toISOString().slice(0, 10)
        === new Date(textSuggestion.dueAt).toISOString().slice(0, 10));

  const persistedJson = JSON.stringify({ mainAttachment, completedJob, analyzedMessage });
  check('no signed URL or token persisted',
    !persistedJson.includes(main.upload?.signedUrl || '__not_present__')
      && !persistedJson.includes(main.upload?.token || '__not_present__')
      && !/signed_url|upload_token|download_token/i.test(persistedJson));

  const retryAttachment = await createAudio('retry');
  const retryMessageId = await persistDirect(retryAttachment.attachmentId, 'retry');
  const retryWorker = randomUUID();
  const { data: retryClaim, error: retryClaimError } = await admin.rpc('claim_audio_transcription_job', {
    p_worker_id: retryWorker,
  });
  if (retryClaimError || !retryClaim) throw retryClaimError || new Error('Retry claim failed');
  transcriptionIds.add(retryClaim.id);
  const { error: retryFailureError } = await admin.rpc('fail_audio_transcription_job', {
    p_job_id: retryClaim.id,
    p_worker_id: retryWorker,
    p_error_code: 'provider_timeout',
    p_retryable: true,
  });
  if (retryFailureError) throw retryFailureError;
  const { data: retryRow } = await admin.from('audio_transcriptions').select('*').eq('id', retryClaim.id).single();
  const { count: retryCount } = await admin.from('audio_transcriptions')
    .select('*', { count: 'exact', head: true }).eq('attachment_id', retryAttachment.attachmentId);
  check('controlled provider failure schedules retry without duplicate',
    retryRow.status === 'failed'
      && retryRow.attempt_count === 1
      && Boolean(retryRow.next_retry_at)
      && retryRow.last_error_code === 'provider_timeout'
      && retryCount === 1);
  check('provider failure preserves message and Attachment',
    Boolean(retryMessageId)
      && (await admin.from('attachments').select('lifecycle_status').eq('id', retryAttachment.attachmentId).single()).data?.lifecycle_status === 'attached');
  // Keep the retry fixture intentionally outside the eligibility window while
  // the independent two-worker race is certified.
  const { error: deferRetryError } = await admin.from('audio_transcriptions')
    .update({ next_retry_at: new Date(Date.now() + 60 * 60 * 1000).toISOString() })
    .eq('id', retryClaim.id);
  if (deferRetryError) throw deferRetryError;

  const raceAttachment = await createAudio('race');
  const raceMessageId = await persistDirect(raceAttachment.attachmentId, 'race');
  const raceWorkers = [randomUUID(), randomUUID()];
  const raceClaims = await Promise.all(raceWorkers.map((p_worker_id) =>
    admin.rpc('claim_audio_transcription_job', { p_worker_id })));
  raceClaims.forEach(({ error }) => { if (error) throw error; });
  const raceRows = raceClaims.map(({ data }) => rpcRow(data));
  const raceWinners = raceRows.filter((row) => Boolean(row?.id));
  check('two workers produce exactly one lease winner', raceWinners.length === 1);
  transcriptionIds.add(raceWinners[0].id);
  const raceJobId = raceWinners[0].id;
  const raceWorkerId = raceWorkers[raceRows.findIndex((row) => Boolean(row?.id))];
  const { error: raceCancelError } = await admin.rpc('cancel_audio_transcription_job', {
    p_job_id: raceJobId,
    p_worker_id: raceWorkerId,
    p_error_code: 'certification_cleanup',
  });
  if (raceCancelError) throw raceCancelError;
  check('losing worker did not obtain a provider lease', raceRows.filter((row) => !row?.id).length === 1 && Boolean(raceMessageId));

  const beforeAttachment = await createAudio('tombstone-before');
  const beforeMessageId = await persistDirect(beforeAttachment.attachmentId, 'tombstone-before');
  const { error: beforeTombstoneError } = await admin.rpc('tombstone_message', {
    p_message_id: beforeMessageId,
    p_actor_user_id: a.id,
    p_reason: 'c5c_before_claim',
  });
  if (beforeTombstoneError) throw beforeTombstoneError;
  const { data: beforeJob } = await admin.from('audio_transcriptions')
    .select('*').eq('attachment_id', beforeAttachment.attachmentId).single();
  transcriptionIds.add(beforeJob.id);
  check('tombstone before processing cancels without transcript',
    beforeJob.status === 'cancelled' && beforeJob.transcript_text === null);

  const lateAttachment = await createAudio('tombstone-late');
  const lateMessageId = await persistDirect(lateAttachment.attachmentId, 'tombstone-late');
  const lateWorker = randomUUID();
  const { data: lateClaim, error: lateClaimError } = await admin.rpc('claim_audio_transcription_job', {
    p_worker_id: lateWorker,
  });
  if (lateClaimError || !lateClaim) throw lateClaimError || new Error('Late-result claim failed');
  transcriptionIds.add(lateClaim.id);
  const { error: lateTombstoneError } = await admin.rpc('tombstone_message', {
    p_message_id: lateMessageId,
    p_actor_user_id: a.id,
    p_reason: 'c5c_during_provider',
  });
  if (lateTombstoneError) throw lateTombstoneError;
  const { error: lateCompletionError } = await admin.rpc('complete_audio_transcription_job', {
    p_job_id: lateClaim.id,
    p_worker_id: lateWorker,
    p_transcript_text: 'Late result must not persist',
    p_language_detected: 'es',
  });
  const { data: lateRow } = await admin.from('audio_transcriptions').select('*').eq('id', lateClaim.id).single();
  const { data: lateMessage } = await admin.from('messages').select('metadata').eq('id', lateMessageId).single();
  check('late provider result is rejected and discarded',
    Boolean(lateCompletionError)
      && lateRow.status === 'cancelled'
      && lateRow.transcript_text === null
      && lateRow.analysis_status === 'cancelled'
      && !lateMessage.metadata?.suggestedTask);

  const [aRls, bRls, cRls] = await Promise.all([
    a.client.from('audio_transcriptions').select('id').eq('id', completedJob.id),
    b.client.from('audio_transcriptions').select('id').eq('id', completedJob.id),
    c.client.from('audio_transcriptions').select('id').eq('id', completedJob.id),
  ]);
  check('RLS allows active A and B but hides from C',
    !aRls.error && aRls.data?.length === 1
      && !bRls.error && bRls.data?.length === 1
      && !cRls.error && cRls.data?.length === 0);
  const directInsert = await a.client.from('audio_transcriptions').insert({
    attachment_id: main.attachmentId,
  });
  const directUpdate = await a.client.from('audio_transcriptions')
    .update({ status: 'failed' }).eq('id', completedJob.id);
  check('authenticated cannot create or modify jobs directly', Boolean(directInsert.error) && Boolean(directUpdate.error));
  const anon = publicClient();
  const anonRead = await anon.from('audio_transcriptions').select('id').eq('id', completedJob.id);
  const anonWrite = await anon.from('audio_transcriptions').insert({ id: randomUUID() });
  check('anon has no audio transcription access',
    (Boolean(anonRead.error) || anonRead.data?.length === 0) && Boolean(anonWrite.error));
  const cAttachment = await c.client.from('attachments').select('id').eq('id', main.attachmentId);
  check('Attachment RLS still hides source from C', !cAttachment.error && cAttachment.data?.length === 0);

  console.log(JSON.stringify({
    projectRef: PROJECT_REF,
    marker,
    fixturePhrase: 'Recuérdame llamar a Juan mañana.',
    fixtureDurationMs: durationMs,
    sendElapsedMs,
    transcriptVerified: true,
    suggestionVerified: true,
    checksPassed: checks.length,
    checks,
    cleanup: 'pending',
  }, null, 2));
} catch (error) {
  runError = error;
} finally {
  if (server) await new Promise((resolve) => server.close(resolve));
  try {
    const cleanupResult = await cleanup();
    console.log(JSON.stringify({
      projectRef: PROJECT_REF,
      cleanup: 'verified-zero-fixtures',
      counts: cleanupResult,
    }));
  } catch (cleanupError) {
    if (runError) throw new AggregateError([runError, cleanupError], 'C-5C E2E and cleanup failed');
    throw cleanupError;
  }
  if (runError) throw runError;
}
