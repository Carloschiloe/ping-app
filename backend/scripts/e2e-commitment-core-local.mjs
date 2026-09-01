import { randomBytes, randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

for (const name of ['SUPABASE_URL', 'SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_ROLE_KEY']) {
  if (!process.env[name]) throw new Error(`Missing required environment variable: ${name}`);
}

const EXPECTED_STAGING_REF = 'oonijgmddgyymhrlnvuu';
const certificationTarget = process.env.PING_C2_TARGET ?? 'local';
const target = new URL(process.env.SUPABASE_URL);
const isLocalTarget = target.protocol === 'http:'
  && ['127.0.0.1', 'localhost'].includes(target.hostname);
const isStagingTarget = target.protocol === 'https:'
  && target.hostname === `${EXPECTED_STAGING_REF}.supabase.co`;
if (
  (certificationTarget === 'local' && !isLocalTarget)
  || (certificationTarget === 'staging' && !isStagingTarget)
  || !['local', 'staging'].includes(certificationTarget)
) {
  throw new Error(`C-2 backend E2E target mismatch for ${certificationTarget}`);
}

if (certificationTarget === 'staging') {
  process.env.PING_EXPECTED_SUPABASE_PROJECT_REF = EXPECTED_STAGING_REF;
} else {
  delete process.env.PING_EXPECTED_SUPABASE_PROJECT_REF;
}
Object.assign(process.env, {
  NODE_ENV: 'test',
  PING_ENVIRONMENT: `${certificationTarget}-c2`,
  ENCRYPTION_KEY: 'c2-local-only-encryption-key-32b',
  ENABLE_NON_MVP_CAPABILITIES: 'false',
  ENABLE_OPERATION_MODULE: 'false',
  ENABLE_CALENDAR_INTEGRATION: 'false',
  ENABLE_CALLS: 'false',
  ENABLE_AUTOMATIONS: 'false',
  RUN_CRON_JOBS: 'false',
  OPENAI_API_KEY: '',
});

const fetchWithTimeout = (input, init = {}) => {
  const timeoutSignal = AbortSignal.timeout(60_000);
  const signal = init.signal
    ? AbortSignal.any([init.signal, timeoutSignal])
    : timeoutSignal;
  return fetch(input, { ...init, signal });
};

const admin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
  global: { fetch: fetchWithTimeout },
});
const makePublicClient = () => createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY,
  {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { fetch: fetchWithTimeout },
  },
);

const marker = `ping-c2-${certificationTarget}-${randomUUID()}`;
const password = randomBytes(24).toString('base64url');
const userIds = [];
let conversationId;
let proposalId;
let commitmentId;
let selfConversationId;
let selfProposalId;
let selfCommitmentId;
const checks = [];

function check(name, condition) {
  if (!condition) throw new Error(`Check failed: ${name}`);
  checks.push(name);
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
    full_name: `C2 ${label}`,
  });
  if (profileError) throw profileError;

  const client = makePublicClient();
  const { data: session, error: signInError } = await client.auth.signInWithPassword({
    email,
    password,
  });
  if (signInError || !session.session?.access_token) {
    throw signInError || new Error(`Could not sign in ${label}`);
  }
  return { id: data.user.id, token: session.session.access_token, client };
}

async function deleteWhere(table, column, value) {
  if (!value) return;
  const { error } = await admin.from(table).delete().eq(column, value);
  if (error) throw error;
}

async function cleanup() {
  const cleanupErrors = [];
  const attempt = async (operation) => {
    try { await operation(); } catch (error) { cleanupErrors.push(error); }
  };

  for (const id of [commitmentId, selfCommitmentId].filter(Boolean)) {
    await attempt(() => deleteWhere('commitment_audit_records', 'commitment_id', id));
    await attempt(() => deleteWhere('commitment_events', 'commitment_id', id));
    await attempt(() => deleteWhere('commitments', 'id', id));
  }
  for (const id of [proposalId, selfProposalId].filter(Boolean)) {
    await attempt(() => deleteWhere('commitment_audit_records', 'proposal_id', id));
    await attempt(() => deleteWhere('commitment_proposal_events', 'proposal_id', id));
    await attempt(() => deleteWhere('commitment_proposal_responses', 'proposal_id', id));
    await attempt(() => deleteWhere('commitment_proposals', 'id', id));
  }
  for (const id of [conversationId, selfConversationId].filter(Boolean)) {
    await attempt(() => deleteWhere('conversation_participants', 'conversation_id', id));
    await attempt(() => deleteWhere('conversations', 'id', id));
  }
  for (const userId of userIds) {
    await attempt(async () => {
      const { error } = await admin.auth.admin.deleteUser(userId);
      if (error) throw error;
    });
  }
  if (cleanupErrors.length) throw new AggregateError(cleanupErrors, 'C-2 local E2E cleanup failed');
}

let server;
let runError;
try {
  const owner = await createUser('owner');
  const participant = await createUser('participant');
  const unrelated = await createUser('unrelated');

  const { data: conversation, error: conversationError } = await admin
    .from('conversations')
    .insert({ conversation_type: 'group', name: marker, created_by: owner.id })
    .select('id')
    .single();
  if (conversationError) throw conversationError;
  conversationId = conversation.id;
  const { error: participantError } = await admin.from('conversation_participants').insert([
    { conversation_id: conversationId, user_id: owner.id, role: 'admin' },
    { conversation_id: conversationId, user_id: participant.id, role: 'member' },
  ]);
  if (participantError) throw participantError;

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

  const self = await request('/conversations/self', {
    token: owner.token,
    method: 'POST',
  });
  check('self-chat created', self.response.status === 200 && Boolean(self.payload?.conversationId));
  selfConversationId = self.payload.conversationId;
  const selfText = 'Manana a las 9 enviar resumen desde self-chat C-2R';
  const selfSource = await request(`/conversations/${selfConversationId}/messages`, {
    token: owner.token,
    method: 'POST',
    body: { text: selfText, client_message_id: randomUUID() },
  });
  check('self-chat source message created', selfSource.response.status === 201);
  const selfMessageId = selfSource.payload.message.id;
  const selfDeadline = Date.now() + 10_000;
  let selfSuggestion;
  let selfOriginalContent;
  while (Date.now() < selfDeadline && !selfSuggestion) {
    const { data, error } = await admin
      .from('messages')
      .select('content, metadata')
      .eq('id', selfMessageId)
      .single();
    if (error) throw error;
    selfOriginalContent = data.content;
    selfSuggestion = data.metadata?.suggestedTask;
    if (!selfSuggestion) await new Promise((resolve) => setTimeout(resolve, 100));
  }
  check('self-chat original message remains unchanged', selfOriginalContent === selfText);
  check('self-chat suggestion exists before confirmation', Boolean(selfSuggestion));
  const selfCreated = await request('/commitments', {
    token: owner.token,
    method: 'POST',
    body: {
      title: selfSuggestion.title,
      due_at: selfSuggestion.dueAt,
      expected_result: 'Resumen enviado',
      conversation_id: selfConversationId,
      message_id: selfMessageId,
      assigned_to_user_id: owner.id,
      source_kind: 'ai_suggestion',
    },
  });
  check('self-chat explicit confirmation creates Commitment', selfCreated.response.status === 201);
  selfCommitmentId = selfCreated.payload.id;
  selfProposalId = selfCreated.payload.proposal_id;
  check('self-chat source and proposal links are preserved',
    selfCreated.payload.message_id === selfMessageId && Boolean(selfProposalId));
  const selfFollowUp = await request(`/commitments/${selfCommitmentId}/follow-up`, {
    token: owner.token,
    method: 'POST',
    body: {
      followUpAt: new Date(Date.now() + 86_400_000).toISOString(),
      nextAction: 'Confirmar envio del resumen',
    },
  });
  check('self-chat follow-up succeeds', selfFollowUp.response.status === 200);
  const selfResolved = await request(`/commitments/${selfCommitmentId}/resolve`, {
    token: owner.token,
    method: 'POST',
    body: { result: 'Resumen enviado correctamente' },
  });
  check('self-chat resolve preserves result',
    selfResolved.response.status === 200
      && selfResolved.payload.status === 'resolved'
      && selfResolved.payload.resolution_result === 'Resumen enviado correctamente');
  const [{ data: selfProposal }, { data: selfEvents }, { data: selfAudits }] = await Promise.all([
    admin.from('commitment_proposals').select('status, source_message_id').eq('id', selfProposalId).single(),
    admin.from('commitment_events').select('event_type').eq('commitment_id', selfCommitmentId),
    admin.from('commitment_audit_records').select('action').eq('commitment_id', selfCommitmentId),
  ]);
  check('self-chat evidence is complete and coherent',
    selfProposal?.status === 'confirmed'
      && selfProposal.source_message_id === selfMessageId
      && selfEvents?.some((event) => event.event_type === 'follow_up_scheduled')
      && selfEvents?.some((event) => event.event_type === 'resolved')
      && selfEvents.length === selfAudits?.length);

  const source = await request(`/conversations/${conversationId}/messages`, {
    token: owner.token,
    method: 'POST',
    body: {
      text: 'Manana a las 12 enviar el informe C-2',
      client_message_id: randomUUID(),
    },
  });
  check('source message created', source.response.status === 201);
  const messageId = source.payload.message.id;

  const deadline = Date.now() + 10_000;
  let suggestedTask;
  while (Date.now() < deadline && !suggestedTask) {
    const { data, error } = await admin.from('messages').select('metadata').eq('id', messageId).single();
    if (error) throw error;
    suggestedTask = data.metadata?.suggestedTask;
    if (!suggestedTask) await new Promise((resolve) => setTimeout(resolve, 100));
  }
  check('suggestion exists without rewriting source', Boolean(suggestedTask));

  const created = await request('/commitments', {
    token: owner.token,
    method: 'POST',
    body: {
      title: suggestedTask.title,
      due_at: suggestedTask.dueAt,
      description: 'C-2 backend integration',
      expected_result: 'Informe aprobado',
      priority: 'medium',
      conversation_id: conversationId,
      message_id: messageId,
      assigned_to_user_id: participant.id,
      source_kind: 'ai_suggestion',
    },
  });
  check('explicit confirmation creates Commitment', created.response.status === 201);
  commitmentId = created.payload.id;
  proposalId = created.payload.proposal_id;
  check('source and proposal links preserved', created.payload.message_id === messageId && Boolean(proposalId));

  const participantList = await request('/commitments', { token: participant.token });
  check('authorized participant reads Commitment',
    participantList.response.status === 200
      && participantList.payload.some((item) => item.id === commitmentId));
  const unrelatedList = await request('/commitments', { token: unrelated.token });
  check('unrelated user cannot read Commitment',
    unrelatedList.response.status === 200
      && !unrelatedList.payload.some((item) => item.id === commitmentId));

  const unrelatedEdit = await request(`/commitments/${commitmentId}`, {
    token: unrelated.token,
    method: 'PATCH',
    body: { title: 'Unauthorized edit' },
  });
  check('backend rejects unrelated edit', [403, 404].includes(unrelatedEdit.response.status));
  for (const [operation, body] of [
    ['resolve', { result: 'Unauthorized resolution' }],
    ['cancel', { reason: 'Unauthorized cancellation' }],
    ['reopen', undefined],
  ]) {
    const rejected = await request(`/commitments/${commitmentId}/${operation}`, {
      token: unrelated.token,
      method: 'POST',
      body,
    });
    check(`backend rejects unrelated ${operation}`, [403, 404].includes(rejected.response.status));
  }

  const edited = await request(`/commitments/${commitmentId}`, {
    token: owner.token,
    method: 'PATCH',
    body: {
      title: 'Informe C-2 editado por backend',
      description: 'Descripcion editada',
      priority: 'high',
      expected_result: 'Informe aceptado',
    },
  });
  check('legacy PATCH descriptive edit delegates successfully',
    edited.response.status === 200 && edited.payload.title === 'Informe C-2 editado por backend');

  const resolvedBypass = await request(`/commitments/${commitmentId}`, {
    token: owner.token,
    method: 'PATCH',
    body: { status: 'completed' },
  });
  check('legacy PATCH cannot bypass resolution result', resolvedBypass.response.status === 400);
  const mixedPatch = await request(`/commitments/${commitmentId}`, {
    token: owner.token,
    method: 'PATCH',
    body: { title: 'Mixed', status: 'accepted' },
  });
  check('legacy PATCH rejects lifecycle plus edit', mixedPatch.response.status === 400);

  const followUpAt = new Date(Date.now() + 86_400_000).toISOString();
  const followUp = await request(`/commitments/${commitmentId}/follow-up`, {
    token: participant.token,
    method: 'POST',
    body: { followUpAt, nextAction: 'Confirmar recepcion' },
  });
  check('authorized participant schedules follow-up', followUp.response.status === 200);
  const postponedAt = new Date(Date.now() + 172_800_000).toISOString();
  const postponed = await request(`/commitments/${commitmentId}/postpone`, {
    token: participant.token,
    method: 'POST',
    body: { newDate: postponedAt },
  });
  check('legacy postpone maps to counter proposal',
    postponed.response.status === 200 && postponed.payload.status === 'counter_proposal');
  const accepted = await request(`/commitments/${commitmentId}/accept`, {
    token: participant.token,
    method: 'POST',
  });
  check('explicit accept succeeds', accepted.response.status === 200 && accepted.payload.status === 'accepted');
  const resolved = await request(`/commitments/${commitmentId}/resolve`, {
    token: participant.token,
    method: 'POST',
    body: { result: 'Informe recibido y aprobado' },
  });
  check('resolve requires and preserves result',
    resolved.response.status === 200
      && resolved.payload.status === 'resolved'
      && resolved.payload.resolution_result === 'Informe recibido y aprobado');
  const reopened = await request(`/commitments/${commitmentId}/reopen`, {
    token: participant.token,
    method: 'POST',
  });
  check('reopen succeeds for assignee', reopened.response.status === 200 && reopened.payload.status === 'accepted');
  const cancelled = await request(`/commitments/${commitmentId}/cancel`, {
    token: owner.token,
    method: 'POST',
    body: { reason: 'Cambio controlado C-2' },
  });
  check('owner cancellation succeeds', cancelled.response.status === 200 && cancelled.payload.status === 'cancelled');
  const reopenedByOwner = await request(`/commitments/${commitmentId}/reopen`, {
    token: owner.token,
    method: 'POST',
  });
  check('owner reopens cancelled Commitment',
    reopenedByOwner.response.status === 200 && reopenedByOwner.payload.status === 'accepted');

  if (certificationTarget === 'staging') {
    const [{ count: eventsBeforeRace }, { count: auditsBeforeRace }] = await Promise.all([
      admin.from('commitment_events').select('*', { count: 'exact', head: true }).eq('commitment_id', commitmentId),
      admin.from('commitment_audit_records').select('*', { count: 'exact', head: true }).eq('commitment_id', commitmentId),
    ]);
    const [concurrentResolve, concurrentCancel] = await Promise.all([
      admin.rpc('apply_commitment_transition_with_evidence', {
        p_commitment_id: commitmentId,
        p_actor_user_id: participant.id,
        p_expected_status: 'accepted',
        p_patch: {
          status: 'resolved',
          resolved_at: new Date().toISOString(),
          resolution_result: 'Resultado de concurrencia C-2R',
          waiting_on_user_id: null,
          waiting_on_contact_id: null,
        },
        p_event_type: 'resolved',
        p_event_payload: { result: 'Resultado de concurrencia C-2R' },
      }),
      admin.rpc('apply_commitment_transition_with_evidence', {
        p_commitment_id: commitmentId,
        p_actor_user_id: owner.id,
        p_expected_status: 'accepted',
        p_patch: {
          status: 'cancelled',
          waiting_on_user_id: null,
          waiting_on_contact_id: null,
        },
        p_event_type: 'cancelled',
        p_event_payload: { reason: 'Cancelacion concurrente C-2R' },
      }),
    ]);
    const raceResults = [concurrentResolve, concurrentCancel];
    check('concurrent resolve versus cancel has exactly one winner',
      raceResults.filter(({ error }) => !error).length === 1);
    check('losing concurrent transition is a controlled conflict',
      raceResults.filter(({ error }) => Boolean(error)).length === 1);
    const [{ data: stateAfterRace }, { count: eventsAfterRace }, { count: auditsAfterRace }] = await Promise.all([
      admin.from('commitments').select('status').eq('id', commitmentId).single(),
      admin.from('commitment_events').select('*', { count: 'exact', head: true }).eq('commitment_id', commitmentId),
      admin.from('commitment_audit_records').select('*', { count: 'exact', head: true }).eq('commitment_id', commitmentId),
    ]);
    check('concurrent transition leaves one coherent state and evidence pair',
      ['resolved', 'cancelled'].includes(stateAfterRace?.status)
        && eventsAfterRace === eventsBeforeRace + 1
        && auditsAfterRace === auditsBeforeRace + 1);
  }

  const directUpdate = await owner.client.from('commitments').update({ title: 'BYPASS' }).eq('id', commitmentId);
  check('RLS/grants block direct owner update', Boolean(directUpdate.error));
  const directRpc = await unrelated.client.rpc('edit_commitment_with_evidence', {
    p_commitment_id: commitmentId,
    p_actor_user_id: unrelated.id,
    p_patch: { title: 'BYPASS' },
  });
  check('authenticated client cannot invoke write RPC directly', Boolean(directRpc.error));
  const directLifecycleRpc = await unrelated.client.rpc('apply_commitment_transition_with_evidence', {
    p_commitment_id: commitmentId,
    p_actor_user_id: unrelated.id,
    p_expected_status: 'accepted',
    p_patch: { status: 'resolved', resolution_result: 'BYPASS' },
    p_event_type: 'resolved',
    p_event_payload: {},
  });
  check('authenticated client cannot invoke lifecycle RPC directly', Boolean(directLifecycleRpc.error));

  const unrelatedArchive = await request(`/commitments/${commitmentId}`, {
    token: unrelated.token,
    method: 'DELETE',
  });
  check('backend rejects unrelated archive', [403, 404].includes(unrelatedArchive.response.status));
  const archived = await request(`/commitments/${commitmentId}`, {
    token: owner.token,
    method: 'DELETE',
  });
  check('DELETE archives without physical removal', archived.response.status === 200 && archived.payload.archived?.archived_at);

  const [{ data: persisted }, { data: events }, { data: audits }] = await Promise.all([
    admin.from('commitments').select('id, archived_at, proposal_id, message_id').eq('id', commitmentId).single(),
    admin.from('commitment_events').select('event_type').eq('commitment_id', commitmentId),
    admin.from('commitment_audit_records').select('action').eq('commitment_id', commitmentId),
  ]);
  check('archived row and traceability remain',
    persisted?.archived_at
      && persisted.proposal_id === proposalId
      && persisted.message_id === messageId
      && events?.some((event) => event.event_type === 'archived')
      && audits?.some((audit) => audit.action === 'commitment_archived')
      && events.length === audits.length);

  console.log(JSON.stringify({
    projectRef: certificationTarget === 'staging' ? EXPECTED_STAGING_REF : undefined,
    target: `${certificationTarget}-supabase`,
    status: 'passed',
    checks: checks.length,
    cleanup: 'verified',
  }));
} catch (error) {
  runError = error;
} finally {
  if (server) await new Promise((resolve) => server.close(resolve));
  try { await cleanup(); } catch (cleanupError) {
    if (runError) throw new AggregateError([runError, cleanupError], 'C-2 local E2E and cleanup failed');
    throw cleanupError;
  }
}

if (runError) throw runError;
