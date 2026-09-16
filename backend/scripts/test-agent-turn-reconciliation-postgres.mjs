import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const exec = promisify(execFile);
const databaseUrl = process.env.PING_M7_RECONCILIATION_DATABASE_URL;
if (!databaseUrl) throw new Error('PING_M7_RECONCILIATION_DATABASE_URL is required');
const url = new URL(databaseUrl);
if (!['127.0.0.1', 'localhost'].includes(url.hostname)) throw new Error('Reconciliation validation is restricted to localhost');
const psql = process.env.PING_M7_PSQL_BIN || 'psql';
const baseArgs = ['-d', databaseUrl, '-X', '-v', 'ON_ERROR_STOP=1', '-q', '-A', '-t', '-F', '|'];
const actor = '11111111-1111-4111-8111-111111111111';
const actor2 = '22222222-2222-4222-8222-222222222222';
const fp = 'a'.repeat(64);

async function sql(statement) {
  const { stdout } = await exec(psql, [...baseArgs, '-c', statement], { windowsHide: true });
  return stdout.trim();
}
async function concurrent(firstStatement, secondStatement) {
  const first = exec(psql, [...baseArgs, '-c', firstStatement], { windowsHide: true });
  await new Promise(resolve => setTimeout(resolve, 100));
  const second = exec(psql, [...baseArgs, '-c', secondStatement], { windowsHide: true });
  return Promise.all([first, second]);
}
function assert(condition, message) { if (!condition) throw new Error(message); }

await sql(`insert into auth.users(id,email) values ('${actor}','a@invalid'),('${actor2}','b@invalid') on conflict do nothing`);
await sql(`delete from public.agent_dialogue_checkpoints where actor_user_id in ('${actor}','${actor2}'); delete from public.agent_turn_admissions where actor_user_id in ('${actor}','${actor2}'); delete from public.agent_turn_sequence_allocators where actor_user_id in ('${actor}','${actor2}');`);

const admit = async (scope, key, fingerprint = fp, who = actor) => (await sql(`select turn_id,turn_sequence from public.admit_agent_turn('${who}','${scope}','${key}','${fingerprint}')`)).split('|');
const claim = async (turn, scope, who = actor) => sql(`select status from public.claim_agent_turn_admission('${turn}','${who}','${scope}')`);
const apply = async (turn, scope, sequence, who = actor, expected = 0) => sql(`select replayed from public.apply_agent_turn_atomically('${turn}'::uuid,'${who}'::uuid,'${scope}'::text,${sequence}::bigint,${expected}::bigint,'active'::text,'{"objective":"x"}'::jsonb,null::jsonb,now()+interval '1 hour',1::smallint,'{"kind":"response","response":{"status":"ok","answer":"x","citations":[]}}'::jsonb)`);
const reconcile = async (turn, scope, sequence, who = actor) => (await sql(`select reconciliation_status,admission_status,failure_class,last_applied_turn_sequence from public.reconcile_agent_turn_application('${turn}','${who}','${scope}',${sequence})`)).split('|');

let row = await admit('reconcile-committed', 'k1');
assert(await claim(row[0], 'reconcile-committed') === 'processing', 'claim committed scenario failed');
assert(await apply(row[0], 'reconcile-committed', Number(row[1])) === 'f', 'apply committed scenario failed');
assert((await reconcile(row[0], 'reconcile-committed', Number(row[1])))[0] === 'committed', 'committed replay was not reconciled');

row = await admit('reconcile-accepted', 'k2');
assert((await reconcile(row[0], 'reconcile-accepted', Number(row[1])))[0] === 'not_applied', 'accepted turn was not identified');

row = await admit('reconcile-retryable', 'k3');
assert(await claim(row[0], 'reconcile-retryable') === 'processing', 'claim retryable scenario failed');
const recovery = await reconcile(row[0], 'reconcile-retryable', Number(row[1]));
assert(recovery[0] === 'retryable_recovery' && recovery[1] === 'failed' && recovery[2] === 'retryable', 'processing recovery was not durable retryable');
assert(await claim(row[0], 'reconcile-retryable') === 'processing', 'retryable recovery was not reclaimable through claim');

row = await admit('reconcile-terminal', 'k4');
assert(await claim(row[0], 'reconcile-terminal') === 'processing', 'claim terminal scenario failed');
await sql(`select * from public.fail_agent_turn_admission('${row[0]}','${actor}','reconcile-terminal','terminal')`);
assert((await reconcile(row[0], 'reconcile-terminal', Number(row[1])))[0] === 'terminal_failure', 'terminal failure was not preserved');
assert(await claim(row[0], 'reconcile-terminal') === 'failed', 'terminal failure was reclaimed');

row = await admit('reconcile-superseded', 'k5');
const later = await admit('reconcile-superseded', 'k6', 'b'.repeat(64));
assert(await claim(later[0], 'reconcile-superseded') === 'processing', 'later turn claim failed');
await apply(later[0], 'reconcile-superseded', Number(later[1]), actor, 0);
const superseded = await reconcile(row[0], 'reconcile-superseded', Number(row[1]));
assert(superseded[0] === 'superseded' && superseded[2] === 'terminal' && superseded[3] === later[1], 'later turn did not prevent old reapplication');
assert(await claim(row[0], 'reconcile-superseded') === 'failed', 'superseded turn was reclaimed');

row = await admit('reconcile-apply-race', 'k8');
assert(await claim(row[0], 'reconcile-apply-race') === 'processing', 'claim apply race failed');
const applyStatement = `begin; select turn_id from public.agent_turn_admissions where turn_id='${row[0]}'::uuid for update; select pg_sleep(1); select * from public.apply_agent_turn_atomically('${row[0]}'::uuid,'${actor}'::uuid,'reconcile-apply-race'::text,${row[1]}::bigint,0::bigint,'active'::text,'{"objective":"x"}'::jsonb,null::jsonb,now()+interval '1 hour',1::smallint,'{"kind":"response","response":{"status":"ok","answer":"x","citations":[]}}'::jsonb); commit;`;
const reconcileStatement = `select reconciliation_status from public.reconcile_agent_turn_application('${row[0]}'::uuid,'${actor}'::uuid,'reconcile-apply-race'::text,${row[1]}::bigint)`;
const [, reconcileRace] = await concurrent(applyStatement, reconcileStatement);
assert(reconcileRace.stdout.trim() === 'committed', 'reconciliation/apply race did not resolve to committed');

row = await admit('reconcile-rollback', 'k10');
assert(await claim(row[0], 'reconcile-rollback') === 'processing', 'claim rollback scenario failed');
await sql(`do $$ begin begin perform * from public.apply_agent_turn_atomically('${row[0]}'::uuid,'${actor}'::uuid,'reconcile-rollback'::text,${row[1]}::bigint,0::bigint,'active'::text,'{}'::jsonb,null::jsonb,now()+interval '1 hour',9::smallint,'{}'::jsonb); exception when others then null; end; end $$;`);
assert((await reconcile(row[0], 'reconcile-rollback', Number(row[1])))[0] === 'retryable_recovery', 'rolled-back apply was not recoverable');

row = await admit('reconcile-reconcile-race', 'k9');
assert(await claim(row[0], 'reconcile-reconcile-race') === 'processing', 'claim reconciliation race failed');
const reconcileRaceStatement = `select reconciliation_status from public.reconcile_agent_turn_application('${row[0]}'::uuid,'${actor}'::uuid,'reconcile-reconcile-race'::text,${row[1]}::bigint)`;
const [reconcileA, reconcileB] = await concurrent(reconcileRaceStatement, reconcileRaceStatement);
const reconciliationStatuses = [reconcileA.stdout.trim(), reconcileB.stdout.trim()];
assert(reconciliationStatuses.includes('retryable_recovery') && reconciliationStatuses.includes('retryable_failure'), `concurrent reconciliation produced unsafe outcomes: ${reconciliationStatuses}`);

row = await admit('reconcile-isolation', 'k7');
const mismatch = await sql(`do $$ begin begin perform * from public.reconcile_agent_turn_application('${row[0]}','${actor2}','reconcile-isolation',${row[1]}); raise exception 'missing identity conflict'; exception when sqlstate '42501' then null; end; end $$;`);
assert(mismatch === '', 'identity mismatch did not fail safely');

console.log('M-7 post-apply reconciliation PostgreSQL validation: PASSED');
console.log('committed/not-applied/retryable/terminal/superseded/isolation: passed');
