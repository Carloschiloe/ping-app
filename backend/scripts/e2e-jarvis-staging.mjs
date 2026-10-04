import path from 'node:path';
import { mkdir, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

dotenv.config({ path: path.resolve(process.cwd(), '.env'), quiet: true });

const BASE_URL = process.env.PING_STAGING_BASE_URL || 'https://ping-backend-staging.onrender.com/api';
const PROJECT_REF = 'oonijgmddgyymhrlnvuu';
const EXPECTED_SHA = process.env.PING_EXPECTED_SHA || null;
const runId = randomUUID();
const artifactDir = path.resolve(process.cwd(), '.m8-smoke-artifacts', 'jarvis');
const artifactPath = path.join(artifactDir, `${runId}.json`);
for (const name of ['SUPABASE_URL', 'SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_ROLE_KEY']) {
  if (!process.env[name]) throw new Error(`Missing staging certification variable: ${name}`);
}
if (new URL(process.env.SUPABASE_URL).hostname !== `${PROJECT_REF}.supabase.co`) throw new Error('Staging project reference mismatch');

const admin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });
const publicClient = () => createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY, { auth: { autoRefreshToken: false, persistSession: false } });
const report = { runId, expectedSha: EXPECTED_SHA, cases: [], calls: 0, sideEffects: { writers: 0, persistenceMutations: 0, tools: 0 }, cleanup: null, success: false };

async function http(pathname, { token, method = 'GET', body, idempotencyKey } = {}) {
  report.calls += 1;
  const response = await fetch(`${BASE_URL}${pathname}`, {
    method,
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}), ...(idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
    signal: AbortSignal.timeout(90_000),
  });
  const text = await response.text();
  let payload = null; try { payload = text ? JSON.parse(text) : null; } catch { payload = { raw: text.slice(0, 200) }; }
  return { status: response.status, payload };
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
  };
}

async function identity() {
  const listed = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (listed.error) throw listed.error;
  const email = `ping-jarvis-${runId}@example.invalid`;
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

async function deleteFixtureData(actorId, commitmentIds) {
  const tables = ['agent_executions', 'agent_authorizations', 'agent_turn_semantic_checkpoints', 'agent_turn_admissions', 'agent_turn_sequence_allocators', 'agent_dialogue_checkpoints'];
  for (const table of tables) { const { error } = await admin.from(table).delete().eq('actor_user_id', actorId); if (error) throw error; }
  if (commitmentIds.length) {
    for (const table of ['commitment_audit_records', 'commitments']) { const { error } = await admin.from(table).delete().in('commitment_id', commitmentIds); if (error) throw error; }
  }
  const deleted = await admin.auth.admin.deleteUser(actorId); if (deleted.error) throw deleted.error;
}

async function run() {
  const who = await identity();
  let token = await login(who.email);
  const commitmentIds = new Set();
  try {
    for (const testCase of cases()) {
      const group = await http('/groups', { token, method: 'POST', body: { name: `Jarvis ${testCase.id}`, participantIds: [] } });
      if (group.status !== 201 || !group.payload?.conversationId) throw new Error(`fixture group failed ${testCase.id}`);
      const conversationId = group.payload.conversationId;
      const turns = [];
      for (let index = 0; index < testCase.turns.length; index += 1) {
        if (testCase.reconnectBefore === index) token = await login(who.email);
        const body = { input: testCase.turns[index], conversationId, channel: 'mobile', locale: 'es-CL', timezone: 'America/Santiago' };
        const result = await http('/agent/turn', { token, method: 'POST', body, idempotencyKey: `${runId}:${testCase.id}:${index + 1}` });
        turns.push({ index: index + 1, status: result.status, response: summary(result.payload) });
        if (result.status !== 200) throw new Error(`${testCase.id} turn ${index + 1} returned ${result.status}`);
      }
      if (testCase.replayFinal) {
        const replay = await http('/agent/turn', { token, method: 'POST', body: { input: testCase.turns.at(-1), conversationId, channel: 'mobile', locale: 'es-CL', timezone: 'America/Santiago' }, idempotencyKey: `${runId}:${testCase.id}:${testCase.turns.length}` });
        turns.push({ index: testCase.turns.length, replay: true, status: replay.status, response: summary(replay.payload) });
        if (replay.status !== 200) throw new Error(`${testCase.id} replay returned ${replay.status}`);
      }
      const { data: created } = await admin.from('commitments').select('id').eq('owner_user_id', who.id);
      for (const row of created || []) commitmentIds.add(row.id);
      const expectedWrite = testCase.write;
      const hasPlan = turns.some(turn => turn.response?.hasPlan);
      const final = turns.at(-1)?.response;
      const passed = hasPlan && final?.answerPresent === true && (!expectedWrite || final?.kind === 'response' || final?.responseStatus === 'success');
      report.cases.push({ id: testCase.id, family: testCase.family, turns, passed, expectedWrite, observedCommitments: created?.length ?? 0 });
      const deleted = await http(`/groups/${conversationId}`, { token, method: 'DELETE' });
      if (deleted.status !== 200) throw new Error(`${testCase.id} fixture cleanup returned ${deleted.status}`);
    }
    report.success = report.cases.length === 100 && report.cases.every(item => item.passed);
    report.sideEffects.persistenceMutations = commitmentIds.size;
    report.sideEffects.writers = commitmentIds.size;
  } finally {
    try { await deleteFixtureData(who.id, [...commitmentIds]); report.cleanup = { identityDeleted: 1, commitmentCount: commitmentIds.size }; }
    catch (error) { report.cleanup = { identityDeleted: 0, error: error?.message || String(error) }; report.success = false; }
  }
}

try { await run(); } catch (error) { report.success = false; report.error = { name: error?.name || 'Error', message: error?.message || String(error) }; }
await mkdir(artifactDir, { recursive: true });
await writeFile(artifactPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({ ...report, artifactPath }, null, 2));
if (!report.success) process.exitCode = 1;
