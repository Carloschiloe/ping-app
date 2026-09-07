import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// M-4 — sección 66: "authorization race test (two concurrent consume/
// execute calls). If architecture cannot guarantee DB-backed atomic
// protection: BLOCKED." Mismo patrón que
// scripts/test-commitment-core-postgres.mjs (C-2): un "winner" mantiene un
// lock real vivo con pg_sleep dentro de una transacción explícita mientras
// un "loser" concurrente corre contra la MISMA fila -- se prueba con
// PostgreSQL real, nunca simulado en memoria.
const databaseUrl = process.env.PING_M4_DATABASE_URL;
if (!databaseUrl) {
  throw new Error('PING_M4_DATABASE_URL is required and must target a local disposable database');
}

const parsedUrl = new URL(databaseUrl);
if (
  !['postgres:', 'postgresql:'].includes(parsedUrl.protocol)
  || !['127.0.0.1', 'localhost', '[::1]'].includes(parsedUrl.hostname)
) {
  throw new Error('M-4 PostgreSQL tests are restricted to a loopback database');
}

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const backendRoot = path.resolve(scriptDirectory, '..');
const integrationSql = path.join(
  backendRoot,
  'tests',
  'postgres',
  'agentAuthorizationExecution.integration.sql',
);
const psql = process.env.PING_M4_PSQL_BIN || 'psql';

function runPsql(args, { capture = false } = {}) {
  return new Promise((resolve) => {
    const child = spawn(psql, ['-d', databaseUrl, '-X', '-v', 'ON_ERROR_STOP=1', ...args], {
      cwd: backendRoot,
      stdio: capture ? ['ignore', 'pipe', 'pipe'] : 'inherit',
      windowsHide: true,
    });
    let stdout = '';
    let stderr = '';
    if (capture) {
      child.stdout.on('data', (chunk) => { stdout += chunk; });
      child.stderr.on('data', (chunk) => { stderr += chunk; });
    }
    child.on('error', (error) => resolve({ code: -1, stdout, stderr, error }));
    child.on('close', (code) => resolve({ code: code ?? -1, stdout, stderr }));
  });
}

async function requireSuccess(result, label) {
  if (result.code !== 0) {
    throw new Error(`${label} failed${result.stderr ? `: ${result.stderr.trim()}` : ''}`);
  }
}

const OWNER = '93939393-9393-4393-8393-939393939393';
const AUTH_ID = '94949494-9494-4494-8494-949494949494';
const STEP_ID = 'race-step-1';

const cleanupSql = `
delete from public.agent_executions where authorization_id = '${AUTH_ID}';
delete from public.agent_authorizations where id = '${AUTH_ID}';
delete from auth.users where id = '${OWNER}';
`;

const setupAuthSql = `
${cleanupSql}
insert into auth.users (id, email) values ('${OWNER}', 'm4-race@example.invalid');
insert into public.agent_authorizations (
  id, actor_user_id, plan_digest, objective_type, frozen_steps, authorized_step_ids,
  confirmation_level, status, expires_at
) values (
  '${AUTH_ID}', '${OWNER}', repeat('9', 64), 'communicate_message', '[]'::jsonb,
  array['${STEP_ID}'], 'explicit', 'authorized', now() + interval '5 minutes'
);
`;

async function waitUntilWinnerHoldsLock(marker) {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const probe = await runPsql([
      '-q', '-A', '-t', '-c',
      `select count(*) from pg_stat_activity where query like '%${marker}%' and wait_event = 'PgSleep';`,
    ], { capture: true });
    await requireSuccess(probe, `${marker} readiness probe`);
    if (probe.stdout.trim() === '1') return;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(`${marker} did not reach the lock-holding phase`);
}

let primaryError;
const results = {};
try {
  await requireSuccess(
    await runPsql(['-q', '-f', integrationSql]),
    'Agent Authorization + Execution PostgreSQL integration',
  );

  // ─── Race 1 (sección 6/33/53/66): two concurrent CONSUME attempts on the
  // SAME authorization. `for update` must serialize them -- the winner
  // flips authorized->consumed; the loser, once unblocked, must observe
  // 'consumed' already and return it as an idempotent replay, NEVER erroring
  // and NEVER re-issuing a second validity window.
  await requireSuccess(await runPsql(['-q', '-c', setupAuthSql]), 'authorization race setup');

  const authWinnerSql = `
begin;
select (public.claim_agent_authorization_for_execution(
  '${AUTH_ID}', '${OWNER}'
)).status /* ping-m4-authz-winner */;
select pg_sleep(2) /* ping-m4-authz-winner */;
commit;
`;
  const authLoserSql = `
select status, consumed_at from public.claim_agent_authorization_for_execution(
  '${AUTH_ID}', '${OWNER}'
);
`;

  const authWinner = runPsql(['-q', '-A', '-t', '-c', authWinnerSql], { capture: true });
  await waitUntilWinnerHoldsLock('ping-m4-authz-winner');
  const authLoser = runPsql(['-q', '-A', '-t', '-F', '|', '-c', authLoserSql], { capture: true });
  const [authWinnerResult, authLoserResult] = await Promise.all([authWinner, authLoser]);

  await requireSuccess(authWinnerResult, 'winning authorization claim');
  await requireSuccess(authLoserResult, 'losing (concurrent) authorization claim');
  const [loserStatus, loserConsumedAt] = authLoserResult.stdout.trim().split('|');
  if (loserStatus !== 'consumed' || !loserConsumedAt) {
    throw new Error(`concurrent authorization claim did not observe a consumed replay: ${authLoserResult.stdout.trim()}`);
  }

  const authCountCheck = await runPsql([
    '-q', '-A', '-t', '-c',
    `select count(*) from public.agent_authorizations where id = '${AUTH_ID}' and status = 'consumed';`,
  ], { capture: true });
  await requireSuccess(authCountCheck, 'post-race authorization state check');
  if (authCountCheck.stdout.trim() !== '1') {
    throw new Error(`expected exactly one consumed authorization row, got: ${authCountCheck.stdout.trim()}`);
  }
  results.authorizationRace = 'passed — exactly one real consumption, concurrent caller got an idempotent replay';

  // ─── Race 2 (sección 20/53/66/67, the one that actually gates duplicate
  // TOOL SIDE EFFECTS): two concurrent claims of the SAME execution STEP.
  // The real unique constraint on (authorization_id, step_id) is the
  // primitive under test -- at most one caller may ever receive
  // is_new_attempt=true and be allowed to invoke a tool executor.
  await requireSuccess(await runPsql(['-q', '-c', setupAuthSql]), 'execution-step race setup');

  const stepWinnerSql = `
begin;
select (r).is_new_attempt from public.claim_agent_execution_step(
  '${AUTH_ID}', '${OWNER}', '${STEP_ID}', 'send_message', 1
) as r /* ping-m4-step-winner */;
select pg_sleep(2) /* ping-m4-step-winner */;
commit;
`;
  const stepLoserSql = `
select (r).is_new_attempt, ((r).execution->>'id') from public.claim_agent_execution_step(
  '${AUTH_ID}', '${OWNER}', '${STEP_ID}', 'send_message', 1
) as r;
`;

  const stepWinner = runPsql(['-q', '-A', '-t', '-c', stepWinnerSql], { capture: true });
  await waitUntilWinnerHoldsLock('ping-m4-step-winner');
  const stepLoser = runPsql(['-q', '-A', '-t', '-F', '|', '-c', stepLoserSql], { capture: true });
  const [stepWinnerResult, stepLoserResult] = await Promise.all([stepWinner, stepLoser]);

  await requireSuccess(stepWinnerResult, 'winning execution-step claim');
  await requireSuccess(stepLoserResult, 'losing (concurrent) execution-step claim');
  if (stepWinnerResult.stdout.trim() !== 't') {
    throw new Error(`winning claim was not a new attempt: ${stepWinnerResult.stdout.trim()}`);
  }
  const [loserIsNew] = stepLoserResult.stdout.trim().split('|');
  if (loserIsNew !== 'f') {
    throw new Error(
      `CRITICAL: concurrent execution-step claim also reported a new attempt `
      + `(would have invoked a real tool executor twice): ${stepLoserResult.stdout.trim()}`
    );
  }

  const stepCountCheck = await runPsql([
    '-q', '-A', '-t', '-c',
    `select count(*) from public.agent_executions where authorization_id = '${AUTH_ID}' and step_id = '${STEP_ID}';`,
  ], { capture: true });
  await requireSuccess(stepCountCheck, 'post-race execution-step row count');
  if (stepCountCheck.stdout.trim() !== '1') {
    throw new Error(`expected exactly one execution row for the raced step, got: ${stepCountCheck.stdout.trim()}`);
  }
  results.executionStepRace = 'passed — exactly one is_new_attempt=true, one real execution row (at most one tool invocation possible)';

  console.log(JSON.stringify({ target: 'local-postgresql', integration: 'passed', ...results }));
} catch (error) {
  primaryError = error;
} finally {
  const cleanup = await runPsql(['-q', '-c', cleanupSql], { capture: true });
  if (cleanup.code !== 0 && !primaryError) {
    primaryError = new Error(`race-test cleanup failed: ${cleanup.stderr.trim()}`);
  }
}

if (primaryError) throw primaryError;
