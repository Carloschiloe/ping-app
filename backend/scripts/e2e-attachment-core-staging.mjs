import 'dotenv/config';
import { randomBytes, randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

const PROJECT_REF = 'oonijgmddgyymhrlnvuu';
const required = ['SUPABASE_URL', 'SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_ROLE_KEY', 'SUPABASE_ACCESS_TOKEN'];
for (const name of required) {
  if (!process.env[name]) throw new Error(`Missing required environment variable: ${name}`);
}

const target = new URL(process.env.SUPABASE_URL);
if (target.protocol !== 'https:' || target.hostname !== `${PROJECT_REF}.supabase.co`) {
  throw new Error('C-4C staging target mismatch');
}

Object.assign(process.env, {
  NODE_ENV: 'test',
  PING_ENVIRONMENT: 'staging-c4c-certification',
  PING_EXPECTED_SUPABASE_PROJECT_REF: PROJECT_REF,
  ENCRYPTION_KEY: 'c4c-staging-only-encryption-key',
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
  OPENAI_API_KEY: '',
});

const fetchWithTimeout = (input, init = {}) => {
  const timeout = AbortSignal.timeout(30_000);
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

const marker = `ping-c4c-staging-${randomUUID()}`;
const password = randomBytes(24).toString('base64url');
const userIds = [];
const conversationIds = new Set();
const attachmentIds = new Set();
const objectPaths = new Set();
const messageIds = new Set();
const checks = [];
let server;

function check(name, condition) {
  if (!condition) throw new Error(`Check failed: ${name}`);
  checks.push(name);
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
  const responseText = await response.text();
  if (!response.ok) {
    throw new Error(`Supabase management SQL failed with HTTP ${response.status}: ${responseText}`);
  }
  return responseText ? JSON.parse(responseText) : null;
}

async function createUser(label) {
  const email = `${marker}-${label}@example.invalid`;
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (error || !data.user) throw error || new Error(`Could not create user ${label}`);
  userIds.push(data.user.id);

  const { error: profileError } = await admin.from('profiles').upsert({
    id: data.user.id,
    email,
    full_name: `C4C ${label}`,
  });
  if (profileError) throw profileError;

  const client = publicClient();
  const { data: session, error: signInError } = await client.auth.signInWithPassword({ email, password });
  if (signInError || !session.session?.access_token) {
    throw signInError || new Error(`Could not sign in user ${label}`);
  }
  return { id: data.user.id, email, token: session.session.access_token, client };
}

async function cleanup() {
  if (objectPaths.size) {
    const { error } = await admin.storage.from('chat-media').remove([...objectPaths]);
    if (error) throw error;
  }

  const conversations = uuidList(conversationIds);
  const attachments = uuidList(attachmentIds);
  const messages = uuidList(messageIds);
  const storagePaths = textList(objectPaths);
  await managementSql(`
begin;
alter table public.messages disable trigger user;
alter table public.conversations disable trigger user;
delete from public.message_events where message_id in (${messages}) or conversation_id in (${conversations});
delete from public.message_reactions where message_id in (${messages}) or message_id in (
  select id from public.messages where conversation_id in (${conversations})
);
delete from public.message_receipts where message_id in (${messages}) or message_id in (
  select id from public.messages where conversation_id in (${conversations})
);
delete from public.attachments where id in (${attachments}) or context_conversation_id in (${conversations});
delete from public.messages where id in (${messages}) or conversation_id in (${conversations});
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
  'storage_objects', (select count(*) from storage.objects where bucket_id = 'chat-media' and name in (${storagePaths}))
) as cleanup;
  `);
  const result = verification?.[0]?.cleanup;
  if (!result || Object.values(result).some((value) => Number(value) !== 0)) {
    throw new Error('C-4C cleanup verification failed');
  }
  return result;
}

let runError;
try {
  const schemaRows = await managementSql(`
select jsonb_build_object(
  'migration', exists (
    select 1 from supabase_migrations.schema_migrations where version = '20260831010000'
  ),
  'table', to_regclass('public.attachments') is not null,
  'rls', (select relrowsecurity from pg_class where oid = 'public.attachments'::regclass),
  'policy', exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'attachments'
      and policyname = 'attachments_select_authorized'
  ),
  'constraints', (
    select count(*) from pg_constraint where conrelid = 'public.attachments'::regclass
  ),
  'rpcs', (
    select count(distinct proname) from pg_proc
    where pronamespace = 'public'::regnamespace
      and proname in (
        'create_message_attachment_intent', 'complete_message_attachment',
        'register_legacy_message_attachment', 'persist_message_with_attachment',
        'authorize_message_attachment_read', 'list_expired_message_attachments', 'tombstone_message'
      )
  ),
  'authenticated_grants', (
    select array_agg(privilege_type order by privilege_type)
    from information_schema.role_table_grants
    where table_schema = 'public' and table_name = 'attachments' and grantee = 'authenticated'
  ),
  'anon_grants', (
    select count(*) from information_schema.role_table_grants
    where table_schema = 'public' and table_name = 'attachments' and grantee = 'anon'
  )
) as schema;
  `);
  const schema = schemaRows?.[0]?.schema;
  check('migration recorded', schema?.migration === true);
  check('attachments table exists', schema?.table === true);
  check('attachments RLS enabled', schema?.rls === true);
  check('canonical attachments policy exists', schema?.policy === true);
  check('attachment constraints installed', Number(schema?.constraints) >= 13);
  check('attachment RPCs installed', Number(schema?.rpcs) === 7);
  check('authenticated has SELECT only', JSON.stringify(schema?.authenticated_grants) === '["SELECT"]');
  check('anon has no attachments grants', Number(schema?.anon_grants) === 0);

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
  if (conversationError || !conversationId) throw conversationError || new Error('Could not create fixture conversation');
  conversationIds.add(conversationId);

  const { app } = await import('../dist/app.js');
  server = app.listen(0, '127.0.0.1');
  await new Promise((resolve, reject) => {
    server.once('listening', resolve);
    server.once('error', reject);
  });
  const address = server.address();
  const baseUrl = `http://127.0.0.1:${address.port}/api`;

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

  async function uploadIntent(label, { clientUploadId = randomUUID(), upload = true } = {}) {
    const intent = await request('/attachments/upload-intents', {
      token: a.token,
      method: 'POST',
      body: {
        conversationId,
        mimeType: 'application/pdf',
        originalFilename: `${label}.pdf`,
        clientUploadId,
        metadata: { marker, label },
      },
    });
    check(`${label} upload intent created`, intent.response.status === 201 && Boolean(intent.payload?.attachmentId));
    attachmentIds.add(intent.payload.attachmentId);
    objectPaths.add(intent.payload.upload.objectPath);

    const bytes = Buffer.from(`%PDF-1.4\n${marker}\n${label}\n%%EOF\n`);
    if (upload) {
      const { error } = await a.client.storage
        .from(intent.payload.upload.bucket)
        .uploadToSignedUrl(intent.payload.upload.objectPath, intent.payload.upload.token, bytes, {
          contentType: 'application/pdf',
        });
      if (error) throw error;
    }
    return { ...intent.payload, bytes };
  }

  async function complete(attachmentId, token = a.token) {
    return request(`/attachments/${attachmentId}/complete`, { token, method: 'POST' });
  }

  async function readAndVerify(attachmentId, actor, bytes) {
    const read = await request(`/attachments/${attachmentId}/read-url`, {
      token: actor.token,
      method: 'POST',
    });
    check(`${actor.email} read URL authorized`, read.response.status === 200 && Boolean(read.payload?.signedUrl));
    const download = await fetchWithTimeout(read.payload.signedUrl);
    const downloaded = Buffer.from(await download.arrayBuffer());
    check(`${actor.email} downloaded exact bytes`, download.ok && downloaded.equals(bytes));
    return read.payload;
  }

  const pendingClientId = randomUUID();
  const pending = await uploadIntent('pending', { clientUploadId: pendingClientId, upload: false });
  const pendingRetry = await uploadIntent('pending-retry', { clientUploadId: pendingClientId, upload: false });
  check('client_upload_id retry returns same attachment', pendingRetry.attachmentId === pending.attachmentId);
  check('client_upload_id retry returns same object path', pendingRetry.upload.objectPath === pending.upload.objectPath);
  const { count: pendingCount } = await admin.from('attachments')
    .select('*', { count: 'exact', head: true })
    .eq('created_by_user_id', a.id)
    .eq('client_upload_id', pendingClientId);
  check('client_upload_id creates one row', pendingCount === 1);

  const main = await uploadIntent('main');
  const mainComplete = await complete(main.attachmentId);
  check('complete transitions to uploaded', mainComplete.response.status === 200 && mainComplete.payload?.lifecycleStatus === 'uploaded');

  const cComplete = await complete(main.attachmentId, c.token);
  check('external user cannot complete attachment', [403, 404].includes(cComplete.response.status));
  const cIntent = await request('/attachments/upload-intents', {
    token: c.token,
    method: 'POST',
    body: {
      conversationId,
      mimeType: 'application/pdf',
      originalFilename: 'forbidden.pdf',
      clientUploadId: randomUUID(),
    },
  });
  check('external user cannot create intent in conversation', [403, 404].includes(cIntent.response.status));

  const mainClientMessageId = randomUUID();
  const mainMessage = await request(`/conversations/${conversationId}/messages`, {
    token: a.token,
    method: 'POST',
    body: { text: `C4C main ${marker}`, client_message_id: mainClientMessageId, attachmentId: main.attachmentId },
  });
  check('message atomically attaches attachment', mainMessage.response.status === 201 && Boolean(mainMessage.payload?.message?.id));
  const mainMessageId = mainMessage.payload.message.id;
  messageIds.add(mainMessageId);

  const messageRetry = await request(`/conversations/${conversationId}/messages`, {
    token: a.token,
    method: 'POST',
    body: { text: `C4C main retry ${marker}`, client_message_id: mainClientMessageId, attachmentId: main.attachmentId },
  });
  check('message retry reuses same message and attachment',
    messageRetry.response.status === 201
      && messageRetry.payload?.message?.id === mainMessageId
      && messageRetry.payload?.idempotentReplay === true);

  const { data: mainRow, error: mainRowError } = await admin.from('attachments')
    .select('*')
    .eq('id', main.attachmentId)
    .single();
  if (mainRowError) throw mainRowError;
  check('database persists canonical bucket and path',
    mainRow.lifecycle_status === 'attached'
      && mainRow.message_id === mainMessageId
      && mainRow.bucket === 'chat-media'
      && mainRow.object_path === main.upload.objectPath);
  const persisted = JSON.stringify({ attachment: mainRow, message: mainMessage.payload.message });
  check('signed upload URL is not persisted', !persisted.includes(main.upload.signedUrl));
  check('upload token is not persisted', !persisted.includes(main.upload.token));

  const readA = await readAndVerify(main.attachmentId, a, main.bytes);
  const readB = await readAndVerify(main.attachmentId, b, main.bytes);
  const persistedAfterReads = JSON.stringify((await admin.from('attachments').select('*').eq('id', main.attachmentId).single()).data);
  check('signed read URLs are not persisted',
    !persistedAfterReads.includes(readA.signedUrl) && !persistedAfterReads.includes(readB.signedUrl));

  const cRead = await request(`/attachments/${main.attachmentId}/read-url`, { token: c.token, method: 'POST' });
  check('external user cannot obtain read URL', [403, 404].includes(cRead.response.status));
  const cReclaim = await request(`/conversations/${conversationId}/messages`, {
    token: c.token,
    method: 'POST',
    body: { text: `C4C forbidden ${marker}`, client_message_id: randomUUID(), attachmentId: main.attachmentId },
  });
  check('external user cannot reclaim attachment', cReclaim.response.status === 403);

  const [aRls, bRls, cRls] = await Promise.all([
    a.client.from('attachments').select('id').eq('id', main.attachmentId),
    b.client.from('attachments').select('id').eq('id', main.attachmentId),
    c.client.from('attachments').select('id').eq('id', main.attachmentId),
  ]);
  check('RLS allows uploader', !aRls.error && aRls.data?.length === 1);
  check('RLS allows active participant', !bRls.error && bRls.data?.length === 1);
  check('RLS hides attachment from outsider', !cRls.error && cRls.data?.length === 0);

  const forbiddenDirectWrite = await a.client.from('attachments').insert({
    id: randomUUID(),
    kind: 'document',
    purpose: 'message_attachment',
    created_by_user_id: a.id,
    context_conversation_id: conversationId,
    bucket: 'chat-media',
    object_path: `conversations/${conversationId}/attachments/${a.id}/forbidden-${marker}.pdf`,
    mime_type: 'application/pdf',
    original_filename: 'forbidden.pdf',
    client_upload_id: randomUUID(),
  });
  check('authenticated direct attachment write denied', Boolean(forbiddenDirectWrite.error));

  const anon = publicClient();
  const anonRead = await anon.from('attachments').select('id').eq('id', main.attachmentId);
  const anonWrite = await anon.from('attachments').insert({ id: randomUUID() });
  check('anon cannot read attachments', Boolean(anonRead.error) || anonRead.data?.length === 0);
  check('anon cannot write attachments', Boolean(anonWrite.error));

  const failure = await uploadIntent('message-failure');
  const failureComplete = await complete(failure.attachmentId);
  check('failure fixture reaches uploaded', failureComplete.response.status === 200);
  const { error: failedMessageError } = await admin.rpc('persist_message_with_attachment', {
    p_actor_user_id: a.id,
    p_conversation_id: conversationId,
    p_content: `C4C expected failure ${marker}`,
    p_reply_to_id: randomUUID(),
    p_client_message_id: randomUUID(),
    p_metadata: { marker, expectedFailure: true },
    p_attachment_id: failure.attachmentId,
  });
  check('message failure after attachment lock is rejected', Boolean(failedMessageError));
  const { data: failureRow } = await admin.from('attachments')
    .select('lifecycle_status, message_id')
    .eq('id', failure.attachmentId)
    .single();
  check('message failure preserves reusable uploaded attachment',
    failureRow?.lifecycle_status === 'uploaded' && failureRow?.message_id === null);

  const race = await uploadIntent('race');
  const raceComplete = await complete(race.attachmentId);
  check('race fixture reaches uploaded', raceComplete.response.status === 200);
  const raceResults = await Promise.all([
    request(`/conversations/${conversationId}/messages`, {
      token: a.token,
      method: 'POST',
      body: { text: `C4C race one ${marker}`, client_message_id: randomUUID(), attachmentId: race.attachmentId },
    }),
    request(`/conversations/${conversationId}/messages`, {
      token: a.token,
      method: 'POST',
      body: { text: `C4C race two ${marker}`, client_message_id: randomUUID(), attachmentId: race.attachmentId },
    }),
  ]);
  const raceWinners = raceResults.filter(({ response }) => response.status === 201);
  const raceLosers = raceResults.filter(({ response }) => response.status !== 201);
  check('concurrent claim has exactly one winner', raceWinners.length === 1 && raceLosers.length === 1);
  check('concurrent loser is controlled', raceLosers[0].response.status === 409);
  const raceMessageId = raceWinners[0].payload.message.id;
  messageIds.add(raceMessageId);

  const legacyUpload = await request('/files/message-attachment/upload-url', {
    token: a.token,
    method: 'POST',
    body: { conversationId, mimeType: 'application/pdf' },
  });
  check('legacy upload URL remains available', legacyUpload.response.status === 200 && Boolean(legacyUpload.payload?.token));
  objectPaths.add(legacyUpload.payload.objectPath);
  const legacyBytes = Buffer.from(`%PDF-1.4\n${marker}\nlegacy\n%%EOF\n`);
  const { error: legacyUploadError } = await a.client.storage
    .from(legacyUpload.payload.bucket)
    .uploadToSignedUrl(legacyUpload.payload.objectPath, legacyUpload.payload.token, legacyBytes, {
      contentType: 'application/pdf',
    });
  if (legacyUploadError) throw legacyUploadError;
  const legacyMessage = await request(`/conversations/${conversationId}/messages`, {
    token: a.token,
    method: 'POST',
    body: {
      text: `[document=legacy.pdf] C4C legacy ${marker}`,
      client_message_id: randomUUID(),
      attachment: {
        bucket: legacyUpload.payload.bucket,
        objectPath: legacyUpload.payload.objectPath,
        mimeType: 'application/pdf',
        fileName: 'legacy.pdf',
      },
    },
  });
  check('legacy bucket/path adapter creates message', legacyMessage.response.status === 201);
  const legacyMessageId = legacyMessage.payload.message.id;
  const legacyAttachmentId = legacyMessage.payload.message.attachment?.id;
  check('legacy response exposes canonical attachment identity', Boolean(legacyAttachmentId));
  messageIds.add(legacyMessageId);
  attachmentIds.add(legacyAttachmentId);
  const { data: legacyRow } = await admin.from('attachments')
    .select('source_type, lifecycle_status, message_id, object_path')
    .eq('id', legacyAttachmentId)
    .single();
  check('legacy adapter resolves canonical attachment',
    legacyRow?.source_type === 'legacy_adapter'
      && legacyRow?.lifecycle_status === 'attached'
      && legacyRow?.message_id === legacyMessageId
      && legacyRow?.object_path === legacyUpload.payload.objectPath);

  const tombstone = await request(`/messages/${mainMessageId}`, { token: a.token, method: 'DELETE' });
  check('message tombstone succeeds', tombstone.response.status === 200);
  const { data: tombstonedRow } = await admin.from('attachments')
    .select('lifecycle_status, message_id, object_path, tombstoned_at')
    .eq('id', main.attachmentId)
    .single();
  check('message tombstone preserves attachment provenance',
    tombstonedRow?.lifecycle_status === 'tombstoned'
      && tombstonedRow?.message_id === mainMessageId
      && tombstonedRow?.object_path === main.upload.objectPath
      && Boolean(tombstonedRow?.tombstoned_at));
  const tombstoneRead = await request(`/attachments/${main.attachmentId}/read-url`, {
    token: a.token,
    method: 'POST',
  });
  check('tombstoned attachment rejects new read URL', [403, 404].includes(tombstoneRead.response.status));
  const { data: tombstonedBinary, error: tombstonedBinaryError } = await admin.storage
    .from('chat-media')
    .download(main.upload.objectPath);
  check('tombstone does not physically delete binary', !tombstonedBinaryError && tombstonedBinary?.size === main.bytes.length);

  const { error: revokeError } = await admin.from('conversation_participants')
    .delete()
    .eq('conversation_id', conversationId)
    .eq('user_id', b.id);
  if (revokeError) throw revokeError;
  const revokedRead = await request(`/attachments/${race.attachmentId}/read-url`, {
    token: b.token,
    method: 'POST',
  });
  check('revoked member cannot renew read URL', [403, 404].includes(revokedRead.response.status));

  const conversationTombstone = await request(`/groups/${conversationId}`, {
    token: a.token,
    method: 'DELETE',
  });
  check('conversation tombstone succeeds', [200, 204].includes(conversationTombstone.response.status));
  const afterConversationTombstone = await request(`/attachments/${race.attachmentId}/read-url`, {
    token: a.token,
    method: 'POST',
  });
  check('conversation tombstone rejects new read URL', [403, 404].includes(afterConversationTombstone.response.status));

  console.log(JSON.stringify({
    projectRef: PROJECT_REF,
    marker,
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
    console.log(JSON.stringify({ projectRef: PROJECT_REF, cleanup: 'verified-zero-fixtures', counts: cleanupResult }));
  } catch (cleanupError) {
    if (runError) throw new AggregateError([runError, cleanupError], 'C-4C E2E and cleanup failed');
    throw cleanupError;
  }
  if (runError) throw runError;
}
