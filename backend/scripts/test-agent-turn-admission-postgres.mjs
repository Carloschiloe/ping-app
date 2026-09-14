import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const exec = promisify(execFile);
const databaseUrl = process.env.PING_M7_DATABASE_URL;
if (!databaseUrl) throw new Error('PING_M7_DATABASE_URL must target the disposable local database');
const url = new URL(databaseUrl);
if (!['127.0.0.1', 'localhost'].includes(url.hostname)) throw new Error('M-7 PostgreSQL validation is restricted to localhost');
const psql = process.env.PING_M7_PSQL_BIN || 'psql';
const baseArgs = ['-d', databaseUrl, '-X', '-v', 'ON_ERROR_STOP=1', '-q', '-A', '-t', '-F', '|'];
const actor = '11111111-1111-4111-8111-111111111111';
const actor2 = '22222222-2222-4222-8222-222222222222';
const fp = 'a'.repeat(64);
const fp2 = 'b'.repeat(64);

async function sql(statement) {
  const { stdout } = await exec(psql, [...baseArgs, '-c', statement], { windowsHide: true });
  return stdout.trim();
}

async function concurrent(firstSql, secondSql) {
  const first = exec(psql, [...baseArgs, '-c', firstSql], { windowsHide: true });
  await new Promise((resolve) => setTimeout(resolve, 250));
  const second = exec(psql, [...baseArgs, '-c', secondSql], { windowsHide: true });
  const [a, b] = await Promise.all([first, second]);
  return [a.stdout.trim(), b.stdout.trim()];
}

function assert(condition, message) { if (!condition) throw new Error(message); }

await sql(`insert into auth.users(id,email) values ('${actor}','a@invalid'),('${actor2}','b@invalid') on conflict do nothing`);
await sql(`delete from public.agent_turn_admissions where actor_user_id in ('${actor}','${actor2}'); delete from public.agent_turn_sequence_allocators where actor_user_id in ('${actor}','${actor2}');`);
const first = (await sql(`select turn_id,turn_sequence,idempotent_replay from public.admit_agent_turn('${actor}','scope-basic','key-basic','${fp}')`)).split('|');
assert(first[2] === 'f' && first[1] === '1', `first admission failed: ${first}`);
const retry = (await sql(`select turn_id,turn_sequence,idempotent_replay from public.admit_agent_turn('${actor}','scope-basic','key-basic','${fp}')`)).split('|');
assert(retry[0] === first[0] && retry[1] === first[1] && retry[2] === 't', 'same-key retry did not replay');
const conflict = await sql(`do $$ begin begin perform * from public.admit_agent_turn('${actor}','scope-basic','key-basic','${fp2}'); raise exception 'missing conflict'; exception when sqlstate 'P0003' then null; end; end $$;`);
assert(conflict === '', 'fingerprint conflict assertion produced output');
assert(await sql(`select count(*) from public.agent_turn_admissions where actor_user_id='${actor}' and dialogue_scope_key='scope-basic'`) === '1', 'retry allocated a second row');

const [newWinner, newLoser] = await concurrent(
  `begin; select turn_id,turn_sequence from public.admit_agent_turn('${actor}','scope-race','new-1','${fp}'); select pg_sleep(1.5); commit;`,
  `select turn_id,turn_sequence from public.admit_agent_turn('${actor}','scope-race','new-2','${fp2}');`,
);
const newA = newWinner.split('\n').filter(Boolean).at(0).split('|');
const newB = newLoser.split('\n').filter(Boolean).at(0).split('|');
assert(newA[0] !== newB[0] && newA[1] !== newB[1], `concurrent new turns collided: ${newWinner} / ${newLoser}`);
assert(new Set([newA[1], newB[1]]).size === 2 && new Set([newA[1], newB[1]]).has('1') && new Set([newA[1], newB[1]]).has('2'), 'concurrent sequences were not 1 and 2');

const [retryWinner, retryLoser] = await concurrent(
  `begin; select turn_id,turn_sequence from public.admit_agent_turn('${actor}','scope-retry-race','same-key','${fp}'); select pg_sleep(1.5); commit;`,
  `select turn_id,turn_sequence from public.admit_agent_turn('${actor}','scope-retry-race','same-key','${fp}');`,
);
const retryA = retryWinner.split('\n').filter(Boolean).at(0).split('|');
const retryB = retryLoser.split('\n').filter(Boolean).at(0).split('|');
assert(retryA[0] === retryB[0] && retryA[1] === retryB[1], 'concurrent same-key retries diverged');
assert(await sql(`select count(*) from public.agent_turn_admissions where actor_user_id='${actor}' and dialogue_scope_key='scope-retry-race'`) === '1', 'concurrent retry allocated twice');

const actorIsolation = (await sql(`select turn_id,turn_sequence from public.admit_agent_turn('${actor2}','scope-basic','key-basic','${fp}')`)).split('|');
const scopeIsolation = (await sql(`select turn_id,turn_sequence from public.admit_agent_turn('${actor}','scope-other','key-basic','${fp}')`)).split('|');
assert(actorIsolation[0] !== first[0] && scopeIsolation[0] !== first[0], 'actor/scope isolation failed');

const transition = (await sql(`select turn_id from public.admit_agent_turn('${actor}','scope-lifecycle','key-life','${fp}')`));
const claim = await sql(`select status from public.claim_agent_turn_admission('${transition}','${actor}','scope-lifecycle')`);
assert(claim === 'processing', `claim failed: ${claim}`);
const duplicateClaim = await sql(`select status from public.claim_agent_turn_admission('${transition}','${actor}','scope-lifecycle')`);
assert(duplicateClaim === 'processing', 'processing duplicate reclaimed incorrectly');
const completed = await sql(`select status from public.complete_agent_turn_admission('${transition}','${actor}','scope-lifecycle','{"responseKind":"response"}'::jsonb)`);
assert(completed === 'completed', `complete failed: ${completed}`);
const replayCompleted = (await sql(`select status,result_ref->>'responseKind',idempotent_replay from public.admit_agent_turn('${actor}','scope-lifecycle','key-life','${fp}')`)).split('|');
assert(replayCompleted[0] === 'completed' && replayCompleted[1] === 'response' && replayCompleted[2] === 't', 'completed replay metadata failed');

const retryable = (await sql(`select turn_id from public.admit_agent_turn('${actor}','scope-failure','key-retryable','${fp}')`));
const retryableFailed = await sql(`select status,failure_class from public.fail_agent_turn_admission('${retryable}','${actor}','scope-failure','retryable')`);
assert(retryableFailed === 'failed|retryable', 'retryable failure classification failed');
const retryableClaim = await sql(`select status from public.claim_agent_turn_admission('${retryable}','${actor}','scope-failure')`);
assert(retryableClaim === 'processing', 'retryable failure was not reclaimable');
const terminal = (await sql(`select turn_id from public.admit_agent_turn('${actor}','scope-failure','key-terminal','${fp2}')`));
assert(await sql(`select status,failure_class from public.fail_agent_turn_admission('${terminal}','${actor}','scope-failure','terminal')`) === 'failed|terminal', 'terminal failure failed');
assert(await sql(`select status from public.claim_agent_turn_admission('${terminal}','${actor}','scope-failure')`) === 'failed', 'terminal failure was reclaimed');

const objects = await sql("select count(*) from pg_class where relname in ('agent_turn_admissions','agent_turn_sequence_allocators')");
assert(objects === '2', 'admission tables missing');
assert(await sql("select count(*) from pg_indexes where tablename='agent_turn_admissions' and indexname in ('agent_turn_admissions_client_key_unique_idx','agent_turn_admissions_scope_sequence_idx','agent_turn_admissions_retention_idx')") === '3', 'admission indexes missing');
assert(await sql("select count(*) from pg_proc where proname in ('admit_agent_turn','claim_agent_turn_admission','complete_agent_turn_admission','fail_agent_turn_admission')") === '4', 'admission RPCs missing');
assert(await sql("select count(*) from pg_class where relname in ('agent_authorizations','agent_executions')") === '0', 'admission touched auth/execution schema');
console.log('M-7 durable turn admission PostgreSQL validation: PASSED');
console.log('first/retry/conflict/concurrent-new/concurrent-retry/isolation/lifecycle/failure/no-side-effects: passed');
