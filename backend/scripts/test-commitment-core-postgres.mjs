import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const databaseUrl = process.env.PING_C2_DATABASE_URL;
if (!databaseUrl) {
  throw new Error('PING_C2_DATABASE_URL is required and must target a local disposable database');
}

const parsedUrl = new URL(databaseUrl);
if (
  !['postgres:', 'postgresql:'].includes(parsedUrl.protocol)
  || !['127.0.0.1', 'localhost', '[::1]'].includes(parsedUrl.hostname)
) {
  throw new Error('C-2 PostgreSQL tests are restricted to a loopback database');
}

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const backendRoot = path.resolve(scriptDirectory, '..');
const integrationSql = path.join(
  backendRoot,
  'tests',
  'postgres',
  'commitmentCore.integration.sql',
);
const psql = process.env.PING_C2_PSQL_BIN || 'psql';

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

const OWNER = '91919191-9191-4191-8191-919191919191';
const COMMITMENT = '92929292-9292-4292-8292-929292929292';

const cleanupSql = `
delete from public.commitment_audit_records where commitment_id = '${COMMITMENT}';
delete from public.commitment_events where commitment_id = '${COMMITMENT}';
delete from public.commitments where id = '${COMMITMENT}';
delete from auth.users where id = '${OWNER}';
`;

const setupSql = `
${cleanupSql}
insert into auth.users (id, email)
values ('${OWNER}', 'c2-concurrency@example.invalid');
insert into public.commitments (
  id, owner_user_id, assigned_to_user_id, title, status, due_at
) values (
  '${COMMITMENT}', '${OWNER}', '${OWNER}',
  'C-2 concurrency fixture', 'accepted', now() + interval '1 day'
);
`;

const winnerSql = `
begin;
select (public.apply_commitment_transition_with_evidence(
  '${COMMITMENT}', '${OWNER}', 'accepted',
  jsonb_build_object(
    'status', 'resolved',
    'resolved_at', now(),
    'resolution_result', 'Winner completed atomically'
  ),
  'resolved', '{}'::jsonb
)).id;
select pg_sleep(2) /* ping-c2-winner */;
commit;
`;

const loserSql = `
select (public.apply_commitment_transition_with_evidence(
  '${COMMITMENT}', '${OWNER}', 'accepted',
  jsonb_build_object('status', 'cancelled'),
  'cancelled', '{}'::jsonb
)).id;
`;

async function waitUntilWinnerHoldsLock() {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const probe = await runPsql([
      '-q', '-A', '-t', '-c',
      "select count(*) from pg_stat_activity where query like '%ping-c2-winner%' and wait_event = 'PgSleep';",
    ], { capture: true });
    await requireSuccess(probe, 'concurrency readiness probe');
    if (probe.stdout.trim() === '1') return;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error('winner transition did not reach the lock-holding phase');
}

let primaryError;
try {
  await requireSuccess(
    await runPsql(['-q', '-f', integrationSql]),
    'Commitment Core PostgreSQL integration',
  );
  await requireSuccess(await runPsql(['-q', '-c', setupSql]), 'concurrency setup');

  const winner = runPsql(['-q', '-c', winnerSql], { capture: true });
  await waitUntilWinnerHoldsLock();
  const loser = runPsql(['-q', '-c', loserSql], { capture: true });
  const [winnerResult, loserResult] = await Promise.all([winner, loser]);

  await requireSuccess(winnerResult, 'winning concurrent transition');
  if (loserResult.code === 0 || !/Commitment changed (?:concurrently|before)/.test(loserResult.stderr)) {
    throw new Error(
      `losing concurrent transition did not fail with the expected conflict `
      + `(code=${loserResult.code}, stderr=${loserResult.stderr.trim()})`
    );
  }

  const verification = await runPsql([
    '-q', '-A', '-t', '-F', '|', '-c',
    `select c.status, c.resolution_result,
       (select count(*) from public.commitment_events e where e.commitment_id = c.id),
       (select count(*) from public.commitment_audit_records a where a.commitment_id = c.id)
     from public.commitments c where c.id = '${COMMITMENT}';`,
  ], { capture: true });
  await requireSuccess(verification, 'concurrency verification');
  if (verification.stdout.trim() !== 'resolved|Winner completed atomically|1|1') {
    throw new Error(`unexpected concurrent result: ${verification.stdout.trim()}`);
  }

  console.log(JSON.stringify({
    target: 'local-postgresql',
    integration: 'passed',
    concurrency: 'passed',
    winner: 'resolved',
    loser: 'controlled conflict',
  }));
} catch (error) {
  primaryError = error;
} finally {
  const cleanup = await runPsql(['-q', '-c', cleanupSql], { capture: true });
  if (cleanup.code !== 0 && !primaryError) {
    primaryError = new Error(`concurrency cleanup failed: ${cleanup.stderr.trim()}`);
  }
}

if (primaryError) throw primaryError;
