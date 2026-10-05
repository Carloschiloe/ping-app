import path from 'node:path';
import { mkdir, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import {
  classifyTransportError,
  incrementCounter,
  sanitizeDiagnosticText,
  summarizeExposedDiagnostics,
  summarizeAgentDeviceTraces,
  summarizeSafeResponseHeaders,
} from './jarvis-harness-observability.mjs';

dotenv.config({ path: path.resolve(process.cwd(), '.env'), quiet: true });

const BASE_URL = process.env.PING_STAGING_BASE_URL || 'https://ping-backend-staging.onrender.com/api';
const PROJECT_REF = 'oonijgmddgyymhrlnvuu';
const EXPECTED_SHA = process.env.PING_EXPECTED_SHA || null;
const CASE_START = Number.parseInt(process.env.JARVIS_CASE_START || '1', 10);
const CASE_END = Number.parseInt(process.env.JARVIS_CASE_END || '100', 10);
const runId = randomUUID();
const artifactDir = path.resolve(process.cwd(), '.m8-smoke-artifacts', 'jarvis');
const artifactPath = path.join(artifactDir, `${runId}.json`);
for (const name of ['SUPABASE_URL', 'SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_ROLE_KEY']) {
  if (!process.env[name]) throw new Error(`Missing staging certification variable: ${name}`);
}
if (new URL(process.env.SUPABASE_URL).hostname !== `${PROJECT_REF}.supabase.co`) throw new Error('Staging project reference mismatch');

const admin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });
const publicClient = () => createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY, { auth: { autoRefreshToken: false, persistSession: false } });
const report = {
  artifactSchemaVersion: 2,
  runId,
  expectedSha: EXPECTED_SHA,
  selection: { caseStart: CASE_START, caseEnd: CASE_END },
  cases: [],
  calls: 0,
  diagnostics: {
    casesStarted: 0,
    casesCompleted: 0,
    statusCounts: {},
    timeoutCount: 0,
    networkErrorCount: 0,
    httpErrorCount: 0,
    rateLimitedCount: 0,
    providerDiagnostics: { available: false, reason: 'public_response_omits_internal_diagnostics' },
    requests: [],
  },
  sideEffects: { writers: 0, persistenceMutations: 0, tools: 0 },
  cleanup: null,
  success: false,
};

async function http(pathname, { token, method = 'GET', body, idempotencyKey, caseId = null, turnIndex = null, phase = 'unknown' } = {}) {
  const startedAt = Date.now();
  const requestLabel = `${method} ${pathname}`;
  report.calls += 1;
  const trace = { request: report.calls, caseId, turnIndex, phase, label: requestLabel, startedAt };
  try {
    const response = await fetch(`${BASE_URL}${pathname}`, {
      method,
      headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}), ...(idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}),
      signal: AbortSignal.timeout(90_000),
    });
    const text = await response.text();
    let payload = null; try { payload = text ? JSON.parse(text) : null; } catch { payload = { raw: '[non-json response]' }; }
    const headers = summarizeSafeResponseHeaders(response.headers);
    trace.elapsedMs = Date.now() - startedAt;
    trace.status = response.status;
    trace.statusText = sanitizeDiagnosticText(response.statusText);
    trace.headers = headers;
    trace.exposedDiagnostics = summarizeExposedDiagnostics(payload);
    incrementCounter(report.diagnostics.statusCounts, String(response.status));
    if (response.status >= 400) report.diagnostics.httpErrorCount += 1;
    if (response.status === 429) report.diagnostics.rateLimitedCount += 1;
    if (!report.diagnostics.providerDiagnostics.available && trace.exposedDiagnostics.available) {
      report.diagnostics.providerDiagnostics = trace.exposedDiagnostics;
    }
    report.diagnostics.requests.push(trace);
    return { status: response.status, payload, diagnostics: trace };
  } catch (error) {
    const transportError = classifyTransportError(error);
    trace.elapsedMs = Date.now() - startedAt;
    trace.status = 0;
    trace.transportError = transportError;
    report.diagnostics[transportError.class === 'timeout' ? 'timeoutCount' : 'networkErrorCount'] += 1;
    report.diagnostics.requests.push(trace);
    return { status: 0, payload: null, diagnostics: trace };
  }
}

function summary(payload) {
  const plan = payload?.plan && typeof payload.plan === 'object' ? payload.plan : payload?.planForConfirmation;
  return {
    kind: payload?.kind ?? null,
    status: payload?.status ?? null,
    responseStatus: payload?.response?.status ?? null,
    hasPlan: Boolean(plan),
    objectiveType: payload?.objectiveType ?? plan?.objectiveType ?? null,
    confirmationRequired: Boolean(payload?.requiresConfirmation || payload?.planForConfirmation),
    answerPresent: typeof payload?.response?.answer === 'string' || typeof payload?.answer === 'string',
    errorCode: typeof payload?.error === 'string' ? sanitizeDiagnosticText(payload.error.slice(0, 120)) : null,
    exposedDiagnostics: summarizeExposedDiagnostics(payload),
  };
}

function summarizeCheckpoint(data) {
  if (!data) return null;
  const active = data.active_dialogue?.state;
  return {
    lifecycle: data.lifecycle ?? null,
    version: typeof data.version === 'number' ? data.version : null,
    turnSequence: data.last_applied_turn_sequence == null ? null : Number(data.last_applied_turn_sequence),
    expiresAt: data.expires_at ?? null,
    activeLifecycle: active?.lifecycle ?? null,
    hasObjective: Boolean(active?.openObjective),
    hasPendingPlan: Boolean(active?.currentPlanDigestRef),
    suspendedObjectiveCount: Array.isArray(active?.suspendedObjectives) ? active.suspendedObjectives.length : null,
    referentCount: Array.isArray(active?.referents) ? active.referents.length : null,
  };
}

async function checkpointSnapshot(actorId, conversationId) {
  const { data, error } = await admin.from('agent_dialogue_checkpoints')
    .select('lifecycle,version,last_applied_turn_sequence,expires_at,active_dialogue')
    .eq('actor_user_id', actorId).eq('dialogue_scope_key', conversationId).maybeSingle();
  if (error) return { available: false, error: sanitizeDiagnosticText(error.message || error.code || 'checkpoint_read_error') };
  return { available: true, state: summarizeCheckpoint(data) };
}

async function identity(caseId) {
  const suffix = caseId ? `-${caseId}` : '';
  const email = `ping-jarvis-${runId}${suffix}@example.invalid`;
  const created = await admin.auth.admin.createUser({ email, email_confirm: true, user_metadata: { e2e_run: runId, e2e_suite: 'jarvis_100' } });
  if (created.error || !created.data?.user?.id) throw created.error || new Error('Could not create temporary identity');
  const profile = await admin.from('profiles').upsert({ id: created.data.user.id, email, full_name: 'Ping Jarvis certification' });
  if (profile.error) throw profile.error;
  return { id: created.data.user.id, email };
}

async function login(email) {
  const link = await admin.auth.admin.generateLink({ type: 'magiclink', email });
  if (link.error || !link.data?.properties?.hashed_token) throw link.error || new Error('Could not generate test session');
  const verified = await publicClient().auth.verifyOtp({ type: 'magiclink', token_hash: link.data.properties.hashed_token });
  if (verified.error || !verified.data.session?.access_token) throw verified.error || new Error('Could not authenticate test identity');
  return verified.data.session.access_token;
}

function cases() {
  const out = [];
  for (let i = 1; i <= 100; i += 1) {
    const label = `prueba jarvis ${i}`;
    const mod = i % 10;
    if (mod === 1) out.push({ id: `create-confirm-${i}`, family: 'create_confirm', turns: [`Agéndame una tarea personal ${label} para mañana a las 10.`, 'Sí, créalo.'], write: true });
    else if (mod === 2) out.push({ id: `create-reject-${i}`, family: 'create_reject', turns: [`Anota una tarea personal ${label} para el jueves.`, 'No, cancélalo.'], write: false });
    else if (mod === 3) out.push({ id: `correct-confirm-${i}`, family: 'create_correct_confirm', turns: [`Recuérdame ${label} mañana a las 9.`, 'Corrige la hora a las 11.', 'Confirmo.'], write: true });
    else if (mod === 4) out.push({ id: `correct-twice-${i}`, family: 'create_correct_correct_confirm', turns: [`Pon ${label} para el viernes a las 8.`, 'Mejor el sábado.', 'Y cambia la hora a las 12.', 'Dale.'], write: true });
    else if (mod === 5) out.push({ id: `correct-reject-${i}`, family: 'create_correct_reject', turns: [`Programa ${label} para mañana.`, 'Cambia el título a revisión.', 'No lo hagas.'], write: false });
    else if (mod === 6) out.push({ id: `clarify-confirm-${i}`, family: 'clarify_answer_confirm', turns: [`Recuérdame ${label}.`, 'Mañana a las 14.', 'Hazlo.'], write: true });
    else if (mod === 7) out.push({ id: `switch-${i}`, family: 'objective_switch', turns: [`Trabaja en ${label} para mañana.`, 'Cambiemos: ahora quiero revisar otro asunto.', 'Volvamos a lo anterior.'], write: false });
    else if (mod === 8) out.push({ id: `context-${i}`, family: 'contextual_followup', turns: [`Tengo pendiente ${label} el lunes.`, '¿Qué fecha tiene?', 'Déjalo pendiente.'], write: false });
    else if (mod === 9) out.push({ id: `reconnect-${i}`, family: 'reconnect_cancel', turns: [`Prepara ${label} para el martes.`, 'No, cancela esa propuesta.'], write: false, reconnectBefore: 2 });
    else out.push({ id: `duplicate-stale-${i}`, family: 'duplicate_replay', turns: [`Crea ${label} para el miércoles.`, 'Sí, hazlo.'], write: true, replayFinal: true });
  }
  return out;
}

async function deleteFixtureData(actorId) {
  const { data: commitments, error: commitmentError } = await admin.from('commitments').select('id,proposal_id').eq('owner_user_id', actorId);
  if (commitmentError) throw commitmentError;
  const commitmentIds = (commitments || []).map(row => row.id).filter(Boolean);
  const proposalIds = (commitments || []).map(row => row.proposal_id).filter(Boolean);
  const { data: proposals, error: proposalError } = await admin.from('commitment_proposals').select('id').eq('proposed_by_user_id', actorId);
  if (proposalError) throw proposalError;
  const allProposalIds = [...new Set([...proposalIds, ...(proposals || []).map(row => row.id).filter(Boolean)])];
  if (commitmentIds.length) {
    const { error } = await admin.from('commitment_audit_records').delete().in('commitment_id', commitmentIds); if (error) throw error;
    const { error: commitmentDeleteError } = await admin.from('commitments').delete().in('id', commitmentIds); if (commitmentDeleteError) throw commitmentDeleteError;
  }
  if (allProposalIds.length) {
    for (const table of ['commitment_audit_records', 'commitment_proposal_events', 'commitment_proposal_responses']) {
      const { error } = await admin.from(table).delete().in('proposal_id', allProposalIds); if (error) throw error;
    }
    const { error } = await admin.from('commitment_proposals').delete().in('id', allProposalIds); if (error) throw error;
  }
  const tables = ['agent_executions', 'agent_authorizations', 'agent_turn_semantic_checkpoints', 'agent_turn_admissions', 'agent_turn_sequence_allocators', 'agent_dialogue_checkpoints'];
  for (const table of tables) { const { error } = await admin.from(table).delete().eq('actor_user_id', actorId); if (error) throw error; }
  const deleted = await admin.auth.admin.deleteUser(actorId); if (deleted.error) throw deleted.error;
}

async function cleanupOrphanedJarvisIdentities() {
  const listed = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (listed.error) throw listed.error;
  let deleted = 0;
  for (const user of listed.data?.users || []) {
    if (user.user_metadata?.e2e_suite !== 'jarvis_100') continue;
    await deleteFixtureData(user.id);
    deleted += 1;
  }
  return deleted;
}

async function run() {
  const orphanedIdentities = await cleanupOrphanedJarvisIdentities();
  const commitmentIds = new Set();
  let identitiesDeleted = 0;
  try {
    for (const testCase of cases().filter((_, index) => index + 1 >= CASE_START && index + 1 <= CASE_END)) {
      const caseStartedAt = Date.now();
      const caseCallStart = report.calls + 1;
      report.diagnostics.casesStarted += 1;
      // /agent/turn intentionally has a per-user abuse limit. Each fixture
      // keeps one identity for its complete conversation, but cases use
      // isolated identities so certification cannot consume the product's
      // protection and turn later cases into false 429 failures.
      const who = await identity(testCase.id);
      let token = await login(who.email);
      const group = await http('/groups', { token, method: 'POST', caseId: testCase.id, phase: 'fixture_create', body: { name: `Jarvis ${testCase.id}`, participantIds: [] } });
      try {
        if (group.status !== 201 || !group.payload?.conversationId) throw new Error(`fixture group failed ${testCase.id}`);
        const conversationId = group.payload.conversationId;
        const turns = [];
        for (let index = 0; index < testCase.turns.length; index += 1) {
          if (testCase.reconnectBefore === index) token = await login(who.email);
          const body = { input: testCase.turns[index], conversationId, channel: 'mobile', locale: 'es-CL', timezone: 'America/Santiago' };
          const result = await http('/agent/turn', { token, method: 'POST', caseId: testCase.id, turnIndex: index + 1, phase: 'agent_turn', body, idempotencyKey: `${runId}:${testCase.id}:${index + 1}` });
          const traceSnapshot = await http('/agent/debug/traces', { token, caseId: testCase.id, turnIndex: index + 1, phase: 'agent_trace_debug' });
          turns.push({ index: index + 1, status: result.status, response: summary(result.payload), request: result.diagnostics.request, elapsedMs: result.diagnostics.elapsedMs, trace: summarizeAgentDeviceTraces(traceSnapshot.payload, conversationId), checkpoint: await checkpointSnapshot(who.id, conversationId) });
        }
        if (testCase.replayFinal) {
          const replay = await http('/agent/turn', { token, method: 'POST', caseId: testCase.id, turnIndex: testCase.turns.length, phase: 'agent_turn_replay', body: { input: testCase.turns.at(-1), conversationId, channel: 'mobile', locale: 'es-CL', timezone: 'America/Santiago' }, idempotencyKey: `${runId}:${testCase.id}:${testCase.turns.length}` });
          const traceSnapshot = await http('/agent/debug/traces', { token, caseId: testCase.id, turnIndex: testCase.turns.length, phase: 'agent_trace_debug' });
          turns.push({ index: testCase.turns.length, replay: true, status: replay.status, response: summary(replay.payload), request: replay.diagnostics.request, elapsedMs: replay.diagnostics.elapsedMs, trace: summarizeAgentDeviceTraces(traceSnapshot.payload, conversationId), checkpoint: await checkpointSnapshot(who.id, conversationId) });
        }
        const { data: created } = await admin.from('commitments').select('id').eq('owner_user_id', who.id);
        for (const row of created || []) commitmentIds.add(row.id);
        const expectedWrite = testCase.write;
        const hasPlan = turns.some(turn => turn.response?.hasPlan);
        const final = turns.at(-1)?.response;
        const allHttpOk = turns.every(turn => turn.status === 200);
        const passed = allHttpOk && hasPlan && final?.answerPresent === true
          && (expectedWrite ? (created?.length ?? 0) > 0 : (created?.length ?? 0) === 0);
        const caseFinishedAt = Date.now();
        report.cases.push({ id: testCase.id, family: testCase.family, turns, passed, expectedWrite, observedCommitments: created?.length ?? 0, startedAt: caseStartedAt, finishedAt: caseFinishedAt, elapsedMs: caseFinishedAt - caseStartedAt, calls: { first: caseCallStart, last: report.calls, count: report.calls - caseCallStart + 1 } });
        report.diagnostics.casesCompleted += 1;
        const deleted = await http(`/groups/${conversationId}`, { token, method: 'DELETE', caseId: testCase.id, phase: 'fixture_delete' });
        if (deleted.status !== 200) report.cases.at(-1).cleanupError = `group_${deleted.status}`;
      } finally {
        await deleteFixtureData(who.id);
        identitiesDeleted += 1;
      }
    }
    report.success = report.cases.length === 100 && report.cases.every(item => item.passed);
    report.sideEffects.persistenceMutations = commitmentIds.size;
    report.sideEffects.writers = commitmentIds.size;
    report.cleanupOrphanedIdentities = orphanedIdentities;
    report.identitiesDeleted = identitiesDeleted;
  } finally {
    report.cleanup = { identitiesDeleted, commitmentCount: commitmentIds.size, orphanedIdentities };
  }
}

try {
  await run();
} catch (error) {
  report.success = false;
  report.error = {
    name: sanitizeDiagnosticText(error?.name || 'Error'),
    message: sanitizeDiagnosticText(error?.message || String(error)),
  };
}
await mkdir(artifactDir, { recursive: true });
await writeFile(artifactPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({ ...report, artifactPath }, null, 2));
if (!report.success) process.exitCode = 1;
