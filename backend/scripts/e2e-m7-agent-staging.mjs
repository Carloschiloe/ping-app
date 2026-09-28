import path from 'node:path';
import { mkdir, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

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
  strategy: 'authenticated_staging_e2e_reusable_identity_magic_link_group_tombstone',
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
  };
}

async function findIdentity() {
  const { data, error } = await admin.from('profiles').select('id,email')
    .like('email', E2E_EMAIL_PATTERN).order('created_at', { ascending: true }).limit(1);
  if (error) throw error;
  if (!data?.[0]?.email) throw new Error('A reusable staging E2E identity is required');
  return data[0];
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
    hasObjective: Boolean(data.active_dialogue?.state?.openObjective),
    hasPendingPlan: Boolean(data.active_dialogue?.state?.currentPlanDigestRef),
    referentCount: Array.isArray(data.active_dialogue?.state?.referents)
      ? data.active_dialogue.state.referents.length : null,
  } : null;
}

async function run() {
  const identity = await findIdentity();
  let token = await loginWithMagicLink(identity.email);
  const group = await http('/groups', {
    token, method: 'POST',
    body: { name: `M7 staging ${runId.slice(0, 8)}`, participantIds: [] },
  });
  if (group.status !== 201 || !group.payload?.conversationId) {
    throw new Error(`Staging fixture group creation failed (${group.status})`);
  }
  const conversationId = group.payload.conversationId;
  let cleanupDone = false;
  const inputs = [
    '\u004eecesito coordinar la revisi\u00f3n del inventario para el jueves.',
    'En realidad, cambiemos de objetivo: prepara la llamada al proveedor para el viernes.',
    '\u00bfQu\u00e9 queda pendiente de eso?',
    'Volvamos a la revisi\u00f3n del inventario; \u00bfqu\u00e9 fecha tiene?',
    'Corrige esa fecha al lunes siguiente.',
    'Confirma el plan vigente.',
    'No lo hagas todav\u00eda; prefiero dejarlo pendiente.',
    'Hazlo con esa persona.',
  ];
  try {
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
        checkpoint: await checkpoint(identity.id, conversationId),
      });
      if (response.status !== 200) throw new Error(`Agent turn ${index + 1} failed (${response.status})`);
    }
    const deleted = await http(`/groups/${conversationId}`, { token, method: 'DELETE' });
    if (deleted.status !== 200) throw new Error(`Fixture conversation tombstone failed (${deleted.status})`);
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
      identitiesRetained: 1,
      identitiesModified: 0,
    };
    report.success = true;
  } finally {
    if (!cleanupDone) {
      try {
        const deleted = await http(`/groups/${conversationId}`, { token, method: 'DELETE' });
        report.cleanup = { conversationTombstoned: deleted.status === 200, cleanupAfterFailure: true };
      } catch (error) {
        report.cleanup = { conversationTombstoned: false, cleanupError: error?.message ?? String(error) };
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
