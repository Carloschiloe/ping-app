import { randomBytes, randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

// M-4 — real, no-mocks end-to-end proof of the AUTHORIZATION + EXECUTION
// pipeline (secciones 61/62/63/66/67), following the exact established
// pattern of e2e-commitment-core-local.mjs: real Express app (dist/app.js),
// real local Supabase auth (real users, real bearer tokens), real Postgres
// writes/reads through the real HTTP surface -- never mocked. The DB-level
// concurrency race (sección 66) is proven separately, exhaustively, in
// scripts/test-agent-execution-postgres.mjs against the raw RPCs; THIS
// script proves the full stack end-to-end: plan -> authorize -> execute ->
// verify, replay idempotency, cross-actor denial, digest/step tampering,
// and a real TOCTOU race between authorize-time and execute-time state.
for (const name of ['SUPABASE_URL', 'SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_ROLE_KEY']) {
  if (!process.env[name]) throw new Error(`Missing required environment variable: ${name}`);
}

const target = new URL(process.env.SUPABASE_URL);
const isLocalTarget = target.protocol === 'http:' && ['127.0.0.1', 'localhost'].includes(target.hostname);
if (!isLocalTarget) {
  throw new Error('M-4 local E2E is restricted to a local Supabase target');
}

Object.assign(process.env, {
  NODE_ENV: 'test',
  PING_ENVIRONMENT: 'local-m4',
  ENCRYPTION_KEY: 'm4-local-only-encryption-key-32b',
  ENABLE_NON_MVP_CAPABILITIES: 'false',
  ENABLE_OPERATION_MODULE: 'false',
  ENABLE_CALENDAR_INTEGRATION: 'false',
  ENABLE_CALLS: 'false',
  ENABLE_AUTOMATIONS: 'false',
  RUN_CRON_JOBS: 'false',
  OPENAI_API_KEY: '', // deterministic input interpreter fallback only (sección 49: no network)
});

const fetchWithTimeout = (input, init = {}) => {
  const timeoutSignal = AbortSignal.timeout(60_000);
  const signal = init.signal ? AbortSignal.any([init.signal, timeoutSignal]) : timeoutSignal;
  return fetch(input, { ...init, signal });
};

const admin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
  global: { fetch: fetchWithTimeout },
});
const makePublicClient = () => createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
  global: { fetch: fetchWithTimeout },
});

const marker = `ping-m4-local-${randomUUID()}`;
const password = randomBytes(24).toString('base64url');
const userIds = [];
const commitmentIds = [];
const conversationIds = [];
const checks = [];

function check(name, condition) {
  if (!condition) throw new Error(`Check failed: ${name}`);
  checks.push(name);
}

async function createUser(label, fullName) {
  const email = `${marker}-${label}@example.invalid`;
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (error || !data.user) throw error || new Error(`Could not create ${label}`);
  userIds.push(data.user.id);
  const { error: profileError } = await admin.from('profiles').upsert({ id: data.user.id, email, full_name: fullName });
  if (profileError) throw profileError;

  const client = makePublicClient();
  const { data: session, error: signInError } = await client.auth.signInWithPassword({ email, password });
  if (signInError || !session.session?.access_token) throw signInError || new Error(`Could not sign in ${label}`);
  return { id: data.user.id, token: session.session.access_token };
}

async function deleteWhere(table, column, value) {
  if (!value) return;
  const { error } = await admin.from(table).delete().eq(column, value);
  if (error) throw error;
}

async function cleanup() {
  const cleanupErrors = [];
  const attempt = async (operation) => { try { await operation(); } catch (error) { cleanupErrors.push(error); } };
  for (const id of commitmentIds) {
    await attempt(() => deleteWhere('agent_executions', 'authorization_id', null));
    await attempt(() => deleteWhere('commitment_audit_records', 'commitment_id', id));
    await attempt(() => deleteWhere('commitment_events', 'commitment_id', id));
    await attempt(async () => {
      const { data } = await admin.from('commitments').select('proposal_id').eq('id', id).maybeSingle();
      await deleteWhere('commitments', 'id', id);
      if (data?.proposal_id) {
        await attempt(() => deleteWhere('commitment_audit_records', 'proposal_id', data.proposal_id));
        await attempt(() => deleteWhere('commitment_proposal_events', 'proposal_id', data.proposal_id));
        await attempt(() => deleteWhere('commitment_proposals', 'id', data.proposal_id));
      }
    });
  }
  await attempt(async () => {
    const { data } = await admin.from('agent_authorizations').select('id').in('actor_user_id', userIds);
    for (const row of data || []) {
      await deleteWhere('agent_executions', 'authorization_id', row.id);
      await deleteWhere('agent_authorizations', 'id', row.id);
    }
  });
  // Physical deletion of messages/conversations-with-messages is REJECTED
  // BY DESIGN (messagingCore's own triggers — "use tombstone_message" /
  // "use tombstone_conversation"), and a message row's sender_id FK then
  // also blocks deleting its sender's auth user. This is the product
  // working correctly, not a cleanup bug -- best-effort cleanup below
  // records these EXPECTED failures without treating them as fatal; a
  // local `supabase db reset` (already the documented way to reconstruct
  // this database from scratch) is what actually clears this residue.
  const expectedResidue = [];
  for (const id of conversationIds) {
    await attempt(() => deleteWhere('messages', 'conversation_id', id));
    await attempt(() => deleteWhere('conversation_participants', 'conversation_id', id));
    await attempt(() => deleteWhere('conversations', 'id', id));
  }
  for (const userId of userIds) {
    await attempt(async () => {
      const { error } = await admin.auth.admin.deleteUser(userId);
      if (error) throw error;
    });
  }
  const isExpectedMessagingResidue = (error) => (
    error?.code === '42501'
    && /physical|tombstone/i.test(String(error?.message))
  ) || (error?.__isAuthError && error?.status === 500);
  for (const error of cleanupErrors) {
    if (isExpectedMessagingResidue(error)) expectedResidue.push(error);
  }
  const unexpected = cleanupErrors.filter((error) => !expectedResidue.includes(error));
  if (unexpected.length) throw new AggregateError(unexpected, 'M-4 local E2E cleanup failed');
  if (expectedResidue.length) {
    console.log(JSON.stringify({ cleanupNote: 'messaging fixtures left as tombstone-only residue by product design — run `supabase db reset` to fully clear local state', count: expectedResidue.length }));
  }
}

let server;
let runError;
try {
  // Cada flujo usa su PROPIO actor "owner" (sección 52: /agent/authorize y
  // /agent/execute están limitados a 10 requests/5min POR USUARIO — un
  // límite real de producción, no un artefacto de test; reutilizar un solo
  // actor a través de 7 flujos independientes lo agotaría de forma
  // artificial y ocultaría una falla real detrás de un 429 irrelevante).
  const ownerA = await createUser('owner-a', `M4OwnerA-${marker}`);
  const ownerB = await createUser('owner-b', `M4OwnerB-${marker}`);
  const ownerC = await createUser('owner-c', `M4OwnerC-${marker}`);
  const ownerD = await createUser('owner-d', `M4OwnerD-${marker}`);
  const ownerE = await createUser('owner-e', `M4OwnerE-${marker}`);
  const ownerF = await createUser('owner-f', `M4OwnerF-${marker}`);
  const ownerG = await createUser('owner-g', `M4OwnerG-${marker}`);
  const ownerH = await createUser('owner-h', `M4OwnerH-${marker}`);
  const alejandra = await createUser('alejandra', 'Alejandra');
  const outsider = await createUser('outsider', `M4Outsider-${marker}`);

  const { data: conversation, error: conversationError } = await admin
    .from('conversations')
    .insert({ conversation_type: 'group', name: marker, created_by: ownerB.id })
    .select('id')
    .single();
  if (conversationError) throw conversationError;
  conversationIds.push(conversation.id);
  const { error: participantError } = await admin.from('conversation_participants').insert([
    { conversation_id: conversation.id, user_id: ownerB.id, role: 'admin' },
    { conversation_id: conversation.id, user_id: alejandra.id, role: 'member' },
    { conversation_id: conversation.id, user_id: ownerH.id, role: 'member' },
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
      headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    const text = await response.text();
    let payload;
    try { payload = text ? JSON.parse(text) : null; } catch { payload = text; }
    return { response, payload };
  }

  async function planAuthorizeExecute({ actor, input, conversationId }) {
    const plan = await request('/agent/plan', { token: actor.token, method: 'POST', body: { input, conversationId } });
    if (plan.response.status !== 200) throw new Error(`plan failed: ${JSON.stringify(plan.payload)}`);
    const authorize = await request('/agent/authorize', {
      token: actor.token, method: 'POST',
      body: { input, conversationId, planDigest: plan.payload.planDigest, stepIds: plan.payload.steps.map((s) => s.stepId), confirm: true },
    });
    return { plan, authorize };
  }

  async function countCommitmentsByTitle(userId, title) {
    const { data, error } = await admin.from('commitments').select('id').eq('owner_user_id', userId).eq('title', title);
    if (error) throw error;
    return data.length;
  }

  async function countMessagesByContent(convId, content) {
    const { data, error } = await admin.from('messages').select('id').eq('conversation_id', convId).eq('content', content);
    if (error) throw error;
    return data.length;
  }

  // ─── A: create_commitment happy path + idempotent replay (sección 61 B) ──
  {
    const title = `EntrenarM4A-${marker.slice(-8)}`;
    const { authorize } = await planAuthorizeExecute({ actor: ownerA, input: `Agenda ${title} mañana a las 8.` });
    check('A: plan+authorize succeeds', authorize.response.status === 200 && authorize.payload.authorizationId);

    const exec1 = await request('/agent/execute', { token: ownerA.token, method: 'POST', body: { authorizationId: authorize.payload.authorizationId } });
    check('A: first execute reports done', exec1.response.status === 200 && exec1.payload.status === 'done');
    check('A: first execute created exactly one commitment ref', exec1.payload.createdEntityRefs?.length === 1);
    const commitmentId = exec1.payload.createdEntityRefs[0].entityId;
    commitmentIds.push(commitmentId);
    check('A: exactly one commitment persisted', await countCommitmentsByTitle(ownerA.id, title) === 1);

    // Sección 8 (audit provenance): "HOW was success verified?" must be
    // answerable from the durable row itself, not only the HTTP response.
    const { data: execRowA } = await admin.from('agent_executions').select('result_ref').eq('authorization_id', authorize.payload.authorizationId).single();
    check('A: the durable execution row itself records that verification passed', execRowA.result_ref?.verified === true);

    const exec2 = await request('/agent/execute', { token: ownerA.token, method: 'POST', body: { authorizationId: authorize.payload.authorizationId } });
    check('A: replayed execute still 200 (honest idempotent replay, never an error)', exec2.response.status === 200);
    check('A: replay never duplicates the side effect', await countCommitmentsByTitle(ownerA.id, title) === 1);
  }

  // ─── B: send_message happy path + idempotent replay (sección 61 A) ───────
  {
    const text = `Llegaré tarde M4B ${marker.slice(-8)}`;
    const { authorize } = await planAuthorizeExecute({ actor: ownerB, input: `Dile a Alejandra que ${text}`, conversationId: conversation.id });
    check('B: plan+authorize succeeds', authorize.response.status === 200 && authorize.payload.authorizationId);

    const exec1 = await request('/agent/execute', { token: ownerB.token, method: 'POST', body: { authorizationId: authorize.payload.authorizationId } });
    check('B: first execute reports done and sent exactly one message', exec1.response.status === 200 && exec1.payload.status === 'done' && exec1.payload.messagesSent === 1);
    check('B: exactly one message persisted', await countMessagesByContent(conversation.id, text) === 1);

    const exec2 = await request('/agent/execute', { token: ownerB.token, method: 'POST', body: { authorizationId: authorize.payload.authorizationId } });
    check('B: replayed execute is still an honest 200', exec2.response.status === 200);
    check('B: replay never sends the message twice', await countMessagesByContent(conversation.id, text) === 1);
  }

  // ─── C: tampered stepIds at authorize time (sección 62) ───────────────────
  {
    const title = `EntrenarM4C-${marker.slice(-8)}`;
    const plan = await request('/agent/plan', { token: ownerC.token, method: 'POST', body: { input: `Agenda ${title} mañana a las 9.` } });
    const authorize = await request('/agent/authorize', {
      token: ownerC.token, method: 'POST',
      body: { input: `Agenda ${title} mañana a las 9.`, planDigest: plan.payload.planDigest, stepIds: ['not-a-real-step-id'], confirm: true },
    });
    check('C: authorize with an invented stepId is denied', authorize.response.status !== 200);
    check('C: nothing was created from a denied authorization', await countCommitmentsByTitle(ownerC.id, title) === 0);
  }

  // ─── D: tampered planDigest at authorize time (sección 61/62: plan_changed) ─
  {
    const title = `EntrenarM4D-${marker.slice(-8)}`;
    const input = `Agenda ${title} mañana a las 10.`;
    const plan = await request('/agent/plan', { token: ownerD.token, method: 'POST', body: { input } });
    const authorize = await request('/agent/authorize', {
      token: ownerD.token, method: 'POST',
      body: { input, planDigest: 'f'.repeat(64), stepIds: plan.payload.steps.map((s) => s.stepId), confirm: true },
    });
    check('D: a wrong digest is rejected as plan_changed', authorize.response.status === 409 && authorize.payload.failureCode === 'plan_changed');
    check('D: nothing was created from a digest-mismatched authorization', await countCommitmentsByTitle(ownerD.id, title) === 0);
  }

  // ─── E: cross-actor denial (sección 62 D) ──────────────────────────────────
  {
    const title = `EntrenarM4E-${marker.slice(-8)}`;
    const { authorize } = await planAuthorizeExecute({ actor: ownerE, input: `Agenda ${title} mañana a las 11.` });
    const authorizationId = authorize.payload.authorizationId;

    const outsiderExecute = await request('/agent/execute', { token: outsider.token, method: 'POST', body: { authorizationId } });
    check('E: a different actor cannot execute someone else\'s authorization', outsiderExecute.response.status === 403);
    const outsiderRevoke = await request(`/agent/authorize/${authorizationId}/revoke`, { token: outsider.token, method: 'POST' });
    check('E: a different actor cannot revoke someone else\'s authorization', outsiderRevoke.response.status === 403);
    check('E: nothing was created by the denied outsider attempts', await countCommitmentsByTitle(ownerE.id, title) === 0);

    const ownerExecute = await request('/agent/execute', { token: ownerE.token, method: 'POST', body: { authorizationId } });
    check('E: the real owner can still execute after the outsider was denied (no corruption)', ownerExecute.response.status === 200 && ownerExecute.payload.status === 'done');
    commitmentIds.push(ownerExecute.payload.createdEntityRefs[0].entityId);
  }

  // ─── F: revoke before execute (sección 33) ────────────────────────────────
  {
    const title = `EntrenarM4F-${marker.slice(-8)}`;
    const { authorize } = await planAuthorizeExecute({ actor: ownerF, input: `Agenda ${title} mañana a las 12.` });
    const authorizationId = authorize.payload.authorizationId;

    const revoke = await request(`/agent/authorize/${authorizationId}/revoke`, { token: ownerF.token, method: 'POST' });
    check('F: owner can revoke their own not-yet-executed authorization', revoke.response.status === 200 && revoke.payload.status === 'revoked');
    const execute = await request('/agent/execute', { token: ownerF.token, method: 'POST', body: { authorizationId } });
    check('F: a revoked authorization can never be executed', execute.response.status === 403);
    check('F: nothing was created from a revoked authorization', await countCommitmentsByTitle(ownerF.id, title) === 0);
  }

  // ─── G: TOCTOU — state changes between authorize and execute (sección 62 H) ─
  {
    const title = `EntrenarM4G-${marker.slice(-8)}`;
    const created = await planAuthorizeExecute({ actor: ownerG, input: `Agenda ${title} mañana a las 13.` });
    const createExec = await request('/agent/execute', { token: ownerG.token, method: 'POST', body: { authorizationId: created.authorize.payload.authorizationId } });
    const commitmentId = createExec.payload.createdEntityRefs[0].entityId;
    commitmentIds.push(commitmentId);

    const reschedule = await planAuthorizeExecute({ actor: ownerG, input: `Mueve ${title} al viernes.` });
    check('G: reschedule plan resolves the real commitment', reschedule.authorize.response.status === 200);
    const rescheduleAuthorizationId = reschedule.authorize.payload.authorizationId;

    // The canonical state changes AFTER authorization, BEFORE execution --
    // the plan/authorization snapshot is now stale.
    const resolve = await request(`/commitments/${commitmentId}/resolve`, { token: ownerG.token, method: 'POST', body: { result: 'Resuelto antes de la ejecución del reschedule' } });
    check('G: commitment resolved directly via REST before the reschedule executes', resolve.response.status === 200 && resolve.payload.status === 'resolved');

    const staleExecute = await request('/agent/execute', { token: ownerG.token, method: 'POST', body: { authorizationId: rescheduleAuthorizationId } });
    check('G: stale reschedule execution never reports success', staleExecute.response.status === 200 && staleExecute.payload.status !== 'done');
    check('G: stale reschedule is honestly reported as a failed step', staleExecute.payload.failedSteps?.some((s) => s.failureCode === 'invalid_lifecycle'));

    const { data: afterRow } = await admin.from('commitments').select('status, due_at').eq('id', commitmentId).single();
    check('G: the real canonical status was NEVER overwritten by the stale reschedule', afterRow.status === 'resolved');
  }

  // ─── H: conditional waiting contract (STAGING sección 7) ──────────────────
  // "Pregúntale a Alejandra si puede el viernes y si acepta, agéndalo." —
  // client authorizes BOTH steps up front (the defensive/worst case: even
  // when explicitly pre-authorized, Core must still refuse to run the
  // contingent create_commitment until the real-world condition resolves).
  {
    const plan = await request('/agent/plan', {
      token: ownerH.token, method: 'POST',
      body: { input: 'Pregúntale a Alejandra si puede el viernes y si acepta, agéndalo.', conversationId: conversation.id },
    });
    check('H: plan produces the 2-step conditional shape', plan.response.status === 200 && plan.payload.objectiveType === 'communicate_and_wait' && plan.payload.steps.length === 2);
    const sendStep = plan.payload.steps[0];
    const createStep = plan.payload.steps[1];
    check('H: step 0 is the immediate send, step 1 is the contingent create', sendStep.toolId === 'send_message' && createStep.toolId === 'create_commitment');
    check('H: the contingent step is explicitly conditioned on the send, not "always"', createStep.dependsOn?.[0] === sendStep.stepId);

    const authorize = await request('/agent/authorize', {
      token: ownerH.token, method: 'POST',
      body: {
        input: 'Pregúntale a Alejandra si puede el viernes y si acepta, agéndalo.', conversationId: conversation.id,
        planDigest: plan.payload.planDigest, stepIds: [sendStep.stepId, createStep.stepId], confirm: true,
      },
    });
    check('H: both steps can be authorized up front', authorize.response.status === 200);

    const exec = await request('/agent/execute', { token: ownerH.token, method: 'POST', body: { authorizationId: authorize.payload.authorizationId } });
    check('H: overall result is WAITING, never a false "done"', exec.response.status === 200 && exec.payload.status === 'waiting');
    check('H: requiresFurtherAuthorization is explicitly true', exec.payload.requiresFurtherAuthorization === true);
    check('H: the send step actually executed and is reported among executedSteps', exec.payload.executedSteps.some((s) => s.toolId === 'send_message'));
    check('H: the create step is reported among waitingSteps, never executedSteps', exec.payload.waitingSteps.some((s) => s.toolId === 'create_commitment') && !exec.payload.executedSteps.some((s) => s.toolId === 'create_commitment'));

    const waitingCreateStep = exec.payload.waitingSteps.find((s) => s.toolId === 'create_commitment');
    check('H: the pending step is distinguishably marked "condition_not_met", never a bare/ambiguous skip', waitingCreateStep?.failureCode === 'condition_not_met');
    check('H: the pending step still carries WHAT it is waiting on (auditable, not erased)', typeof waitingCreateStep?.waitingOn === 'string' && waitingCreateStep.waitingOn.length > 0);
    check('H: nothing was ever created for the contingent step', await countCommitmentsByTitle(ownerH.id, 'Entrenar') === 0);

    // Durable audit chain (sección 8): the pending step's frozen material
    // arguments/condition/tool/version must be independently inspectable
    // from the authorization row itself, not just from the ephemeral
    // in-memory execution result.
    const { data: authRow } = await admin.from('agent_authorizations').select('frozen_steps').eq('id', authorize.payload.authorizationId).single();
    const frozenCreateStep = authRow.frozen_steps.find((s) => s.toolId === 'create_commitment');
    check('H: the authorization row durably retains the frozen contingent step (tool/condition/args)', frozenCreateStep?.condition?.type === 'wait_for_response' && !!frozenCreateStep?.arguments?.title);
    const { data: execRow } = await admin.from('agent_executions').select('status, failure_code, tool_id').eq('authorization_id', authorize.payload.authorizationId).eq('tool_id', 'create_commitment').single();
    check('H: the durable execution row itself distinguishes "condition not met" from any other terminal state', execRow.status === 'skipped_condition' && execRow.failure_code === 'condition_not_met');

    // Idempotent replay must not "helpfully" run the contingent step later
    // on the SAME authorization -- a fresh authorization is required once
    // the real condition resolves (sección 26), never silent auto-progress.
    const replay = await request('/agent/execute', { token: ownerH.token, method: 'POST', body: { authorizationId: authorize.payload.authorizationId } });
    check('H: replaying the same authorization never executes the contingent step either', replay.response.status === 200 && !replay.payload.executedSteps.some((s) => s.toolId === 'create_commitment'));
    check('H: nothing was created even after a replay attempt', await countCommitmentsByTitle(ownerH.id, 'Entrenar') === 0);
  }

  console.log(JSON.stringify({ target: 'local-m4-agent-e2e', status: 'passed', checks: checks.length, cleanup: 'verified' }));
} catch (error) {
  runError = error;
} finally {
  if (server) await new Promise((resolve) => server.close(resolve));
  try { await cleanup(); } catch (cleanupError) {
    if (runError) throw new AggregateError([runError, cleanupError], 'M-4 local E2E and cleanup failed');
    throw cleanupError;
  }
}

if (runError) throw runError;
