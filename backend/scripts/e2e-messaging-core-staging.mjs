import 'dotenv/config';
import { randomBytes, randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

const EXPECTED_STAGING_REF = 'oonijgmddgyymhrlnvuu';
const required = [
  'SUPABASE_URL',
  'SUPABASE_ANON_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
  'SUPABASE_ACCESS_TOKEN',
];
for (const name of required) {
  if (!process.env[name]) throw new Error(`Missing required environment variable: ${name}`);
}

const target = new URL(process.env.SUPABASE_URL);
if (target.protocol !== 'https:' || target.hostname !== `${EXPECTED_STAGING_REF}.supabase.co`) {
  throw new Error('C-3 staging E2E target mismatch');
}

Object.assign(process.env, {
  NODE_ENV: 'test',
  PING_ENVIRONMENT: 'staging-c3-certification',
  PING_EXPECTED_SUPABASE_PROJECT_REF: EXPECTED_STAGING_REF,
  ENCRYPTION_KEY: 'c3-staging-only-encryption-key-32',
  ENABLE_NON_MVP_CAPABILITIES: 'false',
  ENABLE_OPERATION_MODULE: 'false',
  ENABLE_CALENDAR_INTEGRATION: 'false',
  ENABLE_CALLS: 'false',
  ENABLE_AUTOMATIONS: 'false',
  RUN_CRON_JOBS: 'false',
  OPENAI_API_KEY: '',
});

const fetchWithTimeout = (input, init = {}) => {
  const timeoutSignal = AbortSignal.timeout(30_000);
  const signal = init.signal
    ? AbortSignal.any([init.signal, timeoutSignal])
    : timeoutSignal;
  return fetch(input, { ...init, signal });
};

const admin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
  global: { fetch: fetchWithTimeout },
});
const publicClient = () => createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY,
  {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { fetch: fetchWithTimeout },
  },
);

const marker = `ping-c3-staging-${randomUUID()}`;
const password = randomBytes(24).toString('base64url');
const userIds = [];
const conversationIds = new Set();
const messageIds = new Set();
const commitmentIds = new Set();
const proposalIds = new Set();
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

async function managementSql(query) {
  const response = await fetchWithTimeout(
    `https://api.supabase.com/v1/projects/${EXPECTED_STAGING_REF}/database/query`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.SUPABASE_ACCESS_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query }),
    },
  );
  if (!response.ok) {
    throw new Error(`Supabase management SQL failed with HTTP ${response.status}`);
  }
  return response.json();
}

async function createUser(label) {
  const email = `${marker}-${label}@example.invalid`;
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (error || !data.user) throw error || new Error(`Could not create ${label}`);
  userIds.push(data.user.id);
  const { error: profileError } = await admin.from('profiles').upsert({
    id: data.user.id,
    email,
    full_name: `C3 ${label}`,
  });
  if (profileError) throw profileError;

  const client = publicClient();
  const { data: session, error: signInError } = await client.auth.signInWithPassword({
    email,
    password,
  });
  if (signInError || !session.session?.access_token) {
    throw signInError || new Error(`Could not sign in ${label}`);
  }
  await client.realtime.setAuth(session.session.access_token);
  return { id: data.user.id, email, token: session.session.access_token, client };
}

async function subscribe(channel, timeoutMs = 15_000) {
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Realtime subscription timed out')), timeoutMs);
    channel.subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        clearTimeout(timeout);
        resolve();
      } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        clearTimeout(timeout);
        reject(new Error(`Realtime subscription failed: ${status}`));
      }
    });
  });
}

async function cleanup() {
  const conversations = uuidList(conversationIds);
  const messages = uuidList(messageIds);
  const commitments = uuidList(commitmentIds);
  const proposals = uuidList(proposalIds);

  await managementSql(`
begin;
alter table public.commitments disable trigger user;
alter table public.commitment_proposals disable trigger user;
alter table public.messages disable trigger user;
alter table public.conversations disable trigger user;

delete from public.commitment_audit_records
 where commitment_id in (${commitments}) or proposal_id in (${proposals});
delete from public.commitment_events where commitment_id in (${commitments});
delete from public.commitments where id in (${commitments}) or conversation_id in (${conversations});
delete from public.commitment_proposal_responses where proposal_id in (${proposals});
delete from public.commitment_proposal_events where proposal_id in (${proposals});
delete from public.commitment_proposals where id in (${proposals}) or conversation_id in (${conversations});
delete from public.message_events where message_id in (${messages}) or conversation_id in (${conversations});
delete from public.message_reactions where message_id in (${messages});
delete from public.message_receipts where message_id in (${messages});
delete from public.messages where id in (${messages}) or conversation_id in (${conversations});
delete from public.conversation_participants where conversation_id in (${conversations});
delete from public.conversations where id in (${conversations});

alter table public.conversations enable trigger user;
alter table public.messages enable trigger user;
alter table public.commitment_proposals enable trigger user;
alter table public.commitments enable trigger user;
commit;
  `);

  for (const userId of userIds) {
    const { error } = await admin.auth.admin.deleteUser(userId);
    if (error) throw error;
  }

  const [{ count: conversationsLeft }, { count: messagesLeft }, { count: profilesLeft }] = await Promise.all([
    admin.from('conversations').select('*', { count: 'exact', head: true }).in('id', [...conversationIds]),
    admin.from('messages').select('*', { count: 'exact', head: true }).in('id', [...messageIds]),
    admin.from('profiles').select('*', { count: 'exact', head: true }).in('id', userIds),
  ]);
  if (conversationsLeft !== 0 || messagesLeft !== 0 || profilesLeft !== 0) {
    throw new Error('C-3 staging cleanup verification failed');
  }
}

let runError;
try {
  const migration = await managementSql(
    "select exists (select 1 from supabase_migrations.schema_migrations where version = '20260830010000') as present",
  );
  check('staging migration identity verified', migration?.[0]?.present === true);

  const a = await createUser('a');
  const b = await createUser('b');
  const c = await createUser('c');

  const { app } = await import('../dist/app.js');
  server = app.listen(0, '127.0.0.1');
  await new Promise((resolve, reject) => {
    server.once('listening', resolve);
    server.once('error', reject);
  });
  const address = server.address();
  const baseUrl = `http://127.0.0.1:${address.port}/api`;

  async function request(route, { token, method = 'GET', body } = {}) {
    let response;
    for (let attempt = 0; attempt < (method === 'GET' ? 2 : 1); attempt += 1) {
      try {
        response = await fetchWithTimeout(`${baseUrl}${route}`, {
          method,
          headers: {
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
            ...(body ? { 'Content-Type': 'application/json' } : {}),
          },
          ...(body ? { body: JSON.stringify(body) } : {}),
        });
        break;
      } catch (error) {
        if (attempt > 0 || error?.name !== 'TimeoutError') throw error;
      }
    }
    if (!response) throw new Error(`No response for ${method} ${route}`);
    const text = await response.text();
    let payload;
    try { payload = text ? JSON.parse(text) : null; } catch { payload = text; }
    return { response, payload };
  }

  async function createDirectByInvitation(inviter, invitee) {
    const invite = await request('/conversation-invitations', {
      token: inviter.token,
      method: 'POST',
      body: { inviteeEmail: invitee.email },
    });
    check(`invitation ${invitee.email} created`, invite.response.status === 200 && Boolean(invite.payload?.token));
    const accepted = await request('/conversation-invitations/accept', {
      token: invitee.token,
      method: 'POST',
      body: { token: invite.payload.token },
    });
    check(`invitation ${invitee.email} accepted`, accepted.response.status === 200 && Boolean(accepted.payload?.conversationId));
    conversationIds.add(accepted.payload.conversationId);
    return accepted.payload.conversationId;
  }

  const directAb = await createDirectByInvitation(a, b);
  await createDirectByInvitation(a, c);

  const concurrentConversation = await Promise.all([
    request('/conversations', { token: a.token, method: 'POST', body: { otherUserId: b.id } }),
    request('/conversations', { token: a.token, method: 'POST', body: { otherUserId: b.id } }),
  ]);
  check('concurrent direct creation is canonical and idempotent',
    concurrentConversation.every(({ response, payload }) => [200, 201].includes(response.status) && payload.conversationId === directAb));

  let realtimeMessage;
  let realtimeReceipt;
  const realtimeMessagePromise = new Promise((resolve) => { realtimeMessage = resolve; });
  const realtimeReceiptPromise = new Promise((resolve) => { realtimeReceipt = resolve; });
  const realtimeChannel = b.client
    .channel(`c3-${randomUUID()}`)
    .on('postgres_changes', {
      event: 'INSERT', schema: 'public', table: 'messages', filter: `conversation_id=eq.${directAb}`,
    }, (payload) => realtimeMessage(payload.new))
    .on('postgres_changes', {
      event: 'UPDATE', schema: 'public', table: 'message_receipts', filter: `user_id=eq.${b.id}`,
    }, (payload) => realtimeReceipt(payload.new));
  await subscribe(realtimeChannel);
  await new Promise((resolve) => setTimeout(resolve, 2_000));

  const directClientId = randomUUID();
  const directSend = await request(`/conversations/${directAb}/messages`, {
    token: a.token,
    method: 'POST',
    body: { text: `C3 direct ${marker}`, client_message_id: directClientId },
  });
  check('E2E A to B message created', directSend.response.status === 201 && Boolean(directSend.payload?.message?.id));
  const directMessageId = directSend.payload.message.id;
  messageIds.add(directMessageId);
  const realtimeMessageRow = await Promise.race([
    realtimeMessagePromise,
    new Promise((_, reject) => setTimeout(() => reject(new Error('Realtime message timed out')), 30_000)),
  ]);
  check('Realtime message uses persisted UUID', realtimeMessageRow.id === directMessageId);

  const directRetry = await request(`/conversations/${directAb}/messages`, {
    token: a.token,
    method: 'POST',
    body: { text: `C3 direct ${marker}`, client_message_id: directClientId },
  });
  const { count: directIdempotentCount } = await admin
    .from('messages').select('*', { count: 'exact', head: true })
    .eq('sender_id', a.id).eq('client_message_id', directClientId);
  check('client_message_id retry returns one message',
    directRetry.response.status === 201
      && directRetry.payload.message.id === directMessageId
      && directIdempotentCount === 1);

  const bReconcile = await request(`/conversations/${directAb}/messages`, { token: b.token });
  check('HTTP reconciliation converges with Realtime UUID',
    bReconcile.response.status === 200
      && bReconcile.payload.messages.some((message) => message.id === realtimeMessageRow.id));

  const delivered = await request(`/messages/${directMessageId}/status`, {
    token: b.token, method: 'PATCH', body: { status: 'delivered' },
  });
  check('1:1 receipt delivered by B', delivered.response.status === 200 && Boolean(delivered.payload?.receipt?.delivered_at));
  const read = await request(`/conversations/${directAb}/read`, { token: b.token, method: 'PATCH' });
  check('1:1 conversation read by B', read.response.status === 200 && read.payload.updated >= 1);
  const realtimeReceiptRow = await Promise.race([
    realtimeReceiptPromise,
    new Promise((_, reject) => setTimeout(() => reject(new Error('Realtime receipt timed out')), 30_000)),
  ]);
  check('Realtime receipt reconciles recipient identity', realtimeReceiptRow.message_id === directMessageId && realtimeReceiptRow.user_id === b.id);
  const { data: directPersisted } = await admin
    .from('messages').select('status, message_receipts(*)').eq('id', directMessageId).single();
  check('1:1 canonical receipt projects read status',
    directPersisted.status === 'read'
      && directPersisted.message_receipts.length === 1
      && Boolean(directPersisted.message_receipts[0].read_at));

  const cVisibleReceipts = await c.client.from('message_receipts').select('*').eq('message_id', directMessageId);
  check('RLS hides 1:1 receipts from C', !cVisibleReceipts.error && cVisibleReceipts.data.length === 0);
  const cUnauthorizedReceipt = await c.client.rpc('mark_message_receipt', {
    p_message_id: directMessageId, p_state: 'read', p_actor_user_id: c.id,
  });
  check('receipt RPC rejects non-recipient C', Boolean(cUnauthorizedReceipt.error));
  const cUnauthorizedMessages = await request(`/conversations/${directAb}/messages`, { token: c.token });
  check('backend rejects cross-conversation read by C', [403, 404].includes(cUnauthorizedMessages.response.status));
  const directStatusBypass = await a.client
    .from('messages')
    .update({ status: 'sent' })
    .eq('id', directMessageId)
    .select('id, status');
  const { data: stateAfterBypass } = await admin
    .from('messages').select('status').eq('id', directMessageId).single();
  check('RLS/grants block direct lifecycle projection update',
    (Boolean(directStatusBypass.error) || directStatusBypass.data?.length === 0)
      && stateAfterBypass.status === 'read');

  const group = await request('/groups', {
    token: a.token,
    method: 'POST',
    body: { name: marker, participantIds: [b.id, c.id] },
  });
  check('E2E group A/B/C created', group.response.status === 201 && Boolean(group.payload?.conversationId));
  const groupId = group.payload.conversationId;
  conversationIds.add(groupId);
  const groupSend = await request(`/conversations/${groupId}/messages`, {
    token: a.token,
    method: 'POST',
    body: { text: `C3 group ${marker}`, client_message_id: randomUUID() },
  });
  check('E2E group message created by A', groupSend.response.status === 201);
  const groupMessageId = groupSend.payload.message.id;
  messageIds.add(groupMessageId);
  let { data: groupPersisted } = await admin
    .from('messages').select('status, message_receipts(*)').eq('id', groupMessageId).single();
  check('group snapshots independent B/C receipts',
    groupPersisted.status === 'sent'
      && groupPersisted.message_receipts.length === 2
      && new Set(groupPersisted.message_receipts.map((receipt) => receipt.user_id)).size === 2);
  await request(`/messages/${groupMessageId}/status`, { token: b.token, method: 'PATCH', body: { status: 'delivered' } });
  ({ data: groupPersisted } = await admin.from('messages').select('status').eq('id', groupMessageId).single());
  check('group legacy status waits for every recipient delivery', groupPersisted.status === 'sent');
  await request(`/messages/${groupMessageId}/status`, { token: c.token, method: 'PATCH', body: { status: 'delivered' } });
  ({ data: groupPersisted } = await admin.from('messages').select('status').eq('id', groupMessageId).single());
  check('group legacy status becomes delivered after B/C', groupPersisted.status === 'delivered');
  await request(`/messages/${groupMessageId}/status`, { token: b.token, method: 'PATCH', body: { status: 'read' } });
  ({ data: groupPersisted } = await admin.from('messages').select('status').eq('id', groupMessageId).single());
  check('group legacy status waits for every recipient read', groupPersisted.status === 'delivered');
  await request(`/conversations/${groupId}/read`, { token: c.token, method: 'PATCH' });
  ({ data: groupPersisted } = await admin.from('messages').select('status, message_receipts(*)').eq('id', groupMessageId).single());
  check('group receipts converge to read independently',
    groupPersisted.status === 'read'
      && groupPersisted.message_receipts.every((receipt) => Boolean(receipt.read_at)));

  const self = await request('/conversations/self', { token: a.token, method: 'POST' });
  check('self-chat created through canonical boundary', self.response.status === 200 && Boolean(self.payload?.conversationId));
  const selfId = self.payload.conversationId;
  conversationIds.add(selfId);
  const selfSend = await request(`/conversations/${selfId}/messages`, {
    token: a.token,
    method: 'POST',
    body: { text: `C3 self ${marker}`, client_message_id: randomUUID() },
  });
  check('self-chat message created', selfSend.response.status === 201);
  const selfMessageId = selfSend.payload.message.id;
  messageIds.add(selfMessageId);
  const { data: selfPersisted } = await admin
    .from('messages').select('status, message_receipts(*)').eq('id', selfMessageId).single();
  check('self-chat has no fake receiver receipts', selfPersisted.status === 'sent' && selfPersisted.message_receipts.length === 0);

  const concurrentClientId = randomUUID();
  const concurrentSends = await Promise.all([
    request(`/conversations/${directAb}/messages`, {
      token: a.token, method: 'POST', body: { text: `C3 concurrent ${marker}`, client_message_id: concurrentClientId },
    }),
    request(`/conversations/${directAb}/messages`, {
      token: a.token, method: 'POST', body: { text: `C3 concurrent ${marker}`, client_message_id: concurrentClientId },
    }),
  ]);
  const concurrentIds = concurrentSends.map(({ payload }) => payload?.message?.id).filter(Boolean);
  concurrentIds.forEach((id) => messageIds.add(id));
  const { count: concurrentCount } = await admin
    .from('messages').select('*', { count: 'exact', head: true })
    .eq('sender_id', a.id).eq('client_message_id', concurrentClientId);
  check('concurrent client_message_id creates exactly one row',
    concurrentSends.every(({ response }) => response.status === 201)
      && new Set(concurrentIds).size === 1
      && concurrentCount === 1);

  const sourceText = `C3 proposal source ${marker}`;
  const source = await request(`/conversations/${directAb}/messages`, {
    token: a.token,
    method: 'POST',
    body: { text: sourceText, client_message_id: randomUUID() },
  });
  check('proposal source message created', source.response.status === 201);
  const sourceMessageId = source.payload.message.id;
  messageIds.add(sourceMessageId);
  const commitment = await request('/commitments', {
    token: a.token,
    method: 'POST',
    body: {
      title: 'Validar integridad C-3',
      description: marker,
      conversation_id: directAb,
      message_id: sourceMessageId,
      assigned_to_user_id: b.id,
      expected_result: 'Trazabilidad intacta',
      source_kind: 'conversation_message',
    },
  });
  check('explicit confirmation creates linked Commitment',
    commitment.response.status === 201 && Boolean(commitment.payload?.id) && Boolean(commitment.payload?.proposal_id));
  commitmentIds.add(commitment.payload.id);
  proposalIds.add(commitment.payload.proposal_id);

  const tombstone = await request(`/messages/${sourceMessageId}`, { token: a.token, method: 'DELETE' });
  check('message tombstone succeeds through explicit operation',
    tombstone.response.status === 200 && Boolean(tombstone.payload?.message?.deleted_at));
  const [{ data: sourcePersisted }, { data: proposal }, { data: commitmentPersisted }, { data: tombstoneEvents }] = await Promise.all([
    admin.from('messages').select('content, deleted_at').eq('id', sourceMessageId).single(),
    admin.from('commitment_proposals').select('source_message_id, conversation_id, status').eq('id', commitment.payload.proposal_id).single(),
    admin.from('commitments').select('message_id, conversation_id, proposal_id').eq('id', commitment.payload.id).single(),
    admin.from('message_events').select('event_type, actor_user_id').eq('message_id', sourceMessageId),
  ]);
  check('tombstone preserves original source and audit event',
    sourcePersisted.content === sourceText
      && Boolean(sourcePersisted.deleted_at)
      && tombstoneEvents.length === 1
      && tombstoneEvents[0].event_type === 'tombstoned'
      && tombstoneEvents[0].actor_user_id === a.id);
  check('Proposal/Commitment integrity survives tombstone',
    proposal.source_message_id === sourceMessageId
      && proposal.conversation_id === directAb
      && proposal.status === 'confirmed'
      && commitmentPersisted.message_id === sourceMessageId
      && commitmentPersisted.proposal_id === commitment.payload.proposal_id);
  const masked = await request(`/conversations/${directAb}/messages`, { token: b.token });
  const maskedSource = masked.payload.messages.find((message) => message.id === sourceMessageId);
  check('backend masks tombstoned content while retaining row', maskedSource?.text === 'Mensaje eliminado' && maskedSource?.content === null);

  await b.client.removeChannel(realtimeChannel);
  console.log(JSON.stringify({
    projectRef: EXPECTED_STAGING_REF,
    target: 'Ping Staging V2',
    status: 'passed',
    checks: checks.length,
    cleanup: 'pending',
  }));
} catch (error) {
  runError = error;
} finally {
  if (server) await new Promise((resolve) => server.close(resolve));
  try {
    await cleanup();
    console.log(JSON.stringify({ projectRef: EXPECTED_STAGING_REF, cleanup: 'verified-zero-fixtures' }));
  } catch (cleanupError) {
    if (runError) {
      throw new AggregateError([runError, cleanupError], 'C-3 staging E2E and cleanup failed');
    }
    throw cleanupError;
  }
}

if (runError) throw runError;
