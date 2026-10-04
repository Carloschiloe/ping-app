import path from 'node:path';
import { mkdir, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import { selectReusableIdentity } from './e2e-m7-staging-identity.mjs';
import { assertStrongM7Sequence } from './e2e-m7-agent-assertions.mjs';

dotenv.config({ path: path.resolve(process.cwd(), '.env'), quiet: true });

const BASE_URL = process.env.PING_STAGING_BASE_URL || 'https://ping-backend-staging.onrender.com/api';
const PROJECT_REF = 'oonijgmddgyymhrlnvuu';
const E2E_EMAIL_PATTERN = 'ping-beta-e2e-%@example.invalid';
const EXPECTED_SHA = process.env.PING_EXPECTED_SHA || null;
const runId = randomUUID();
const artifactDir = path.resolve(process.cwd(), '.m7-smoke-artifacts', 'staging-agent');
const artifactPath = path.join(artifactDir, `${runId}.json`);

for (const name of ['SUPABASE_URL', 'SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_ROLE_KEY']) {
  if (!process.env[name]) throw new Error(`Missing required staging E2E variable: ${name}`);
}
const stagingUrl = new URL(process.env.SUPABASE_URL);
if (stagingUrl.hostname !== `${PROJECT_REF}.supabase.co`) {
  throw new Error('Staging E2E project reference mismatch');
}

const admin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});
const publicClient = () => createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const report = {
  runId,
  baseUrl: BASE_URL,
  expectedSha: EXPECTED_SHA ? EXPECTED_SHA.slice(0, 7) : null,
  strategy: 'authenticated_staging_e2e_identity_magic_link_group_tombstone',
  identityMode: null,
  identityCreated: 0,
  identityDeleted: 0,
  userGrowth: 0,
  turns: [],
  sideEffects: { agentWriters: 0, commitmentMutations: 0, messagesCreated: 0 },
  cleanup: null,
};

async function http(pathname, { token, method = 'GET', body, idempotencyKey } = {}) {
  const response = await fetch(`${BASE_URL}${pathname}`, {
    method,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
    signal: AbortSignal.timeout(90_000),
  });
  const text = await response.text();
  let payload = null;
  try { payload = text ? JSON.parse(text) : null; } catch { payload = { raw: text }; }
  return { status: response.status, payload };
}

function summarizePayload(payload) {
  if (!payload || typeof payload !== 'object') return null;
  const plan = payload.plan && typeof payload.plan === 'object' ? payload.plan : null;
  return {
    kind: payload.kind ?? null,
    status: payload.status ?? null,
    responseKind: payload.responseKind ?? null,
    objectiveType: payload.objectiveType ?? plan?.objectiveType ?? null,
    toolIds: Array.isArray(payload.toolCalls)
      ? payload.toolCalls.map((item) => item?.toolId ?? item?.name ?? null).filter(Boolean)
      : [],
    hasPlan: Boolean(plan || payload.planForConfirmation),
    confirmationRequired: Boolean(payload.requiresConfirmation || payload.planForConfirmation),
    responseStatus: payload.response?.status ?? null,
    answer: typeof payload.response?.answer === 'string' ? payload.response.answer : null,
  };
}

async function executionEvidence(actorUserId, turn) {
  const { data: authorizations, error: authorizationError } = await admin
    .from('agent_authorizations')
    .select('id,status,authorized_step_ids')
    .eq('actor_user_id', actorUserId)
    .order('created_at', { ascending: false })
    .limit(1);
  if (authorizationError) throw authorizationError;
  const authorization = authorizations?.[0];
  if (!authorization) return { status: null, verified: false, authorizationId: null };
  const { data: executions, error: executionError } = await admin
    .from('agent_executions')
    .select('authorization_id,status,result_ref')
    .eq('actor_user_id', actorUserId)
    .eq('authorization_id', authorization.id)
    .order('created_at', { ascending: false });
  if (executionError) throw executionError;
  const verified = Array.isArray(executions) && executions.length > 0
    && executions.every((row) => row.status === 'succeeded' && row.result_ref?.verified === true);
  const evidence = {
    status: verified ? 'done' : (executions?.[0]?.status ?? null),
    verified,
    authorizationId: authorization.id,
    executionCount: executions?.length ?? 0,
    createdCommitmentIds: executions?.flatMap((row) => {
      const id = row.result_ref?.commitmentId;
      return typeof id === 'string' ? [id] : [];
    }) ?? [],
  };
  return turn === 6 ? evidence : { status: null, verified: false, authorizationId: null };
}

function summarizeObjective(state) {
  const objective = state?.openObjective;
  if (!objective || typeof objective !== 'object') return null;
  return {
    objectiveType: objective.objectiveType ?? null,
    entityHints: Array.isArray(objective.targetEntities?.entityHints)
      ? objective.targetEntities.entityHints : [],
    personHints: Array.isArray(objective.targetEntities?.personHints)
      ? objective.targetEntities.personHints : [],
    timeHint: objective.timeConstraints?.rawHint ?? null,
    desiredOutcome: objective.desiredOutcome ?? null,
    decisionHint: objective.constraints?.decisionHint ?? null,
    source: objective.source ?? null,
  };
}

async function findIdentity() {
  const { data, error } = await admin.from('profiles').select('id,email')
    .like('email', E2E_EMAIL_PATTERN).order('created_at', { ascending: true }).limit(100);
  if (error) throw error;
  const listed = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (listed.error) throw listed.error;
  const identity = selectReusableIdentity(data, listed.data?.users);
  if (identity) {
    const authUser = listed.data?.users?.find((user) => user.id === identity.id);
    return {
      ...identity,
      temporary: Boolean(authUser?.user_metadata?.e2e_run),
    };
  }

  const email = `ping-beta-e2e-${runId}@example.invalid`;
  const created = await admin.auth.admin.createUser({
    email,
    email_confirm: true,
    user_metadata: { e2e_run: runId },
  });
  if (created.error || !created.data?.user?.id) {
    throw created.error || new Error('Temporary staging E2E identity was not created');
  }
  const { error: profileError } = await admin.from('profiles').upsert({
    id: created.data.user.id,
    email,
    full_name: 'Ping staging E2E',
  });
  if (profileError) {
    await admin.auth.admin.deleteUser(created.data.user.id);
    throw profileError;
  }
  return { id: created.data.user.id, email, temporary: true };
}

async function loginWithMagicLink(email) {
  const generated = await admin.auth.admin.generateLink({ type: 'magiclink', email });
  if (generated.error || !generated.data?.properties?.hashed_token) {
    throw generated.error || new Error('Staging magic-link token was not generated');
  }
  const verified = await publicClient().auth.verifyOtp({
    type: 'magiclink', token_hash: generated.data.properties.hashed_token,
  });
  if (verified.error || !verified.data.session?.access_token) {
    throw verified.error || new Error('Staging magic-link session was not established');
  }
  return verified.data.session.access_token;
}

async function deleteTemporaryIdentity(identityId) {
  // Auth deletion is intentionally last. Agent admission/checkpoint tables
  // reference auth.users without cascade because they are durable audit data;
  // this cleanup removes only rows created by this temporary E2E identity.
  const scopedTables = [
    'agent_executions',
    'agent_authorizations',
    'agent_turn_semantic_checkpoints',
    'agent_turn_admissions',
    'agent_turn_sequence_allocators',
    'agent_dialogue_checkpoints',
  ];
  for (const table of scopedTables) {
    const { error } = await admin.from(table).delete().eq('actor_user_id', identityId);
    if (error) throw error;
  }
  const deleted = await admin.auth.admin.deleteUser(identityId);
  if (deleted.error) throw deleted.error;
}

async function checkpoint(actorUserId, conversationId) {
  const { data, error } = await admin.from('agent_dialogue_checkpoints')
    .select('lifecycle,version,last_applied_turn_sequence,expires_at,active_dialogue')
    .eq('actor_user_id', actorUserId).eq('dialogue_scope_key', conversationId).maybeSingle();
  if (error) throw error;
  return data ? {
    lifecycle: data.lifecycle,
    version: data.version,
    turnSequence: Number(data.last_applied_turn_sequence),
    expiresAt: data.expires_at,
    activeLifecycle: data.active_dialogue?.state?.lifecycle ?? null,
    activeObjective: summarizeObjective(data.active_dialogue?.state),
    hasObjective: Boolean(data.active_dialogue?.state?.openObjective),
    hasPendingPlan: Boolean(data.active_dialogue?.state?.currentPlanDigestRef),
    referentCount: Array.isArray(data.active_dialogue?.state?.referents)
      ? data.active_dialogue.state.referents.length : null,
  } : null;
}

async function run() {
  const identity = await findIdentity();
  report.identityMode = identity.temporary ? 'temporary_cleanup' : 'reusable';
  report.identityCreated = identity.temporary ? 1 : 0;
  let token;
  let conversationId = null;
  const createdCommitmentIds = new Set();
  let cleanupDone = false;
  const inputs = [
    '\u004eecesito coordinar la revisi\u00f3n del inventario para el jueves.',
    'En realidad, cambiemos de objetivo: prepara la llamada al proveedor para el viernes.',
    '\u00bfQu\u00e9 queda pendiente de eso?',
    'Volvamos a la revisi\u00f3n del inventario; \u00bfqu\u00e9 fecha tiene?',
    'Corrige esa fecha al lunes siguiente.',
    'No lo hagas todav\u00eda; prefiero dejarlo pendiente.',
    'Confirma el plan vigente.',
    '\u00bfQu\u00e9 qued\u00f3 registrado?',
  ];
  try {
    token = await loginWithMagicLink(identity.email);
    const group = await http('/groups', {
      token, method: 'POST',
      body: { name: `M7 staging ${runId.slice(0, 8)}`, participantIds: [] },
    });
    if (group.status !== 201 || !group.payload?.conversationId) {
      throw new Error(`Staging fixture group creation failed (${group.status})`);
    }
    conversationId = group.payload.conversationId;
    for (let index = 0; index < inputs.length; index += 1) {
      if (index === 3) token = await loginWithMagicLink(identity.email);
      const response = await http('/agent/turn', {
        token, method: 'POST', idempotencyKey: `${runId}:turn:${index + 1}`,
        body: { input: inputs[index], conversationId, channel: 'mobile', locale: 'es-CL', timezone: 'America/Santiago' },
      });
      report.turns.push({
        turn: index + 1,
        input: inputs[index],
        status: response.status,
        response: summarizePayload(response.payload),
        execution: index === 6 ? await executionEvidence(identity.id, index + 1) : null,
        checkpoint: await checkpoint(identity.id, conversationId),
      });
      for (const commitmentId of report.turns.at(-1).execution?.createdCommitmentIds ?? []) {
        createdCommitmentIds.add(commitmentId);
      }
      if (index === 6 && report.turns.at(-1).execution?.executionCount) {
        report.sideEffects.agentWriters = report.turns.at(-1).execution.executionCount;
        report.sideEffects.commitmentMutations = report.turns.at(-1).execution.createdCommitmentIds.length;
      }
      if (response.status !== 200) throw new Error(`Agent turn ${index + 1} failed (${response.status})`);
    }
    assertStrongM7Sequence(report.turns);
    const deleted = await http(`/groups/${conversationId}`, { token, method: 'DELETE' });
    if (deleted.status !== 200) throw new Error(`Fixture conversation tombstone failed (${deleted.status})`);
    for (const commitmentId of createdCommitmentIds) {
      const archived = await http(`/commitments/${commitmentId}`, { token, method: 'DELETE' });
      if (archived.status !== 200) throw new Error(`Temporary commitment cleanup failed (${archived.status})`);
    }
    cleanupDone = true;
    const { data: conversation, error: conversationError } = await admin.from('conversations')
      .select('deleted_at').eq('id', conversationId).single();
    if (conversationError) throw conversationError;
    const { count: activeMessages, error: messageError } = await admin.from('messages')
      .select('*', { count: 'exact', head: true }).eq('conversation_id', conversationId).is('deleted_at', null);
    if (messageError) throw messageError;
    if (!conversation?.deleted_at || (activeMessages ?? 0) !== 0) {
      throw new Error('Staging fixture cleanup verification failed');
    }
    report.cleanup = {
      conversationTombstoned: Boolean(conversation?.deleted_at),
      activeMessages: activeMessages ?? 0,
      identitiesRetained: identity.temporary ? 0 : 1,
      identitiesModified: 0,
    };
    report.success = true;
  } finally {
    if (!cleanupDone && conversationId) {
      try {
        const deleted = await http(`/groups/${conversationId}`, { token, method: 'DELETE' });
        report.cleanup = { conversationTombstoned: deleted.status === 200, cleanupAfterFailure: true };
      } catch (error) {
        report.cleanup = { conversationTombstoned: false, cleanupError: error?.message ?? String(error) };
      }
    }
    if (!cleanupDone && token) {
      for (const commitmentId of createdCommitmentIds) {
        try { await http(`/commitments/${commitmentId}`, { token, method: 'DELETE' }); } catch { /* best-effort cleanup */ }
      }
    }
    if (identity.temporary) {
      try {
        await deleteTemporaryIdentity(identity.id);
        report.identityDeleted = 1;
      } catch (error) {
        report.success = false;
        report.cleanup = {
          ...(report.cleanup ?? {}),
          identityDeleted: false,
          identityCleanupError: error?.message ?? String(error),
        };
      }
    }
  }
}

try {
  await run();
} catch (error) {
  report.success = false;
  report.error = { name: error?.name ?? 'Error', message: error?.message ?? String(error) };
}

await mkdir(artifactDir, { recursive: true });
await writeFile(artifactPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({ ...report, artifactPath }, null, 2));
if (!report.success) process.exitCode = 1;
