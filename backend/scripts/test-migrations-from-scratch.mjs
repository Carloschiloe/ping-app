import { spawnSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(scriptDir, '..', '..');
const migrationsDir = join(repositoryRoot, 'supabase', 'migrations');
const integrationTests = [
  join(repositoryRoot, 'backend', 'tests', 'postgres', 'attachmentCore.integration.sql'),
  join(repositoryRoot, 'backend', 'tests', 'postgres', 'audioTranscription.integration.sql'),
];
const postgresBin = process.env.POSTGRES_BIN ?? 'C:\\Program Files\\PostgreSQL\\16\\bin';
const psql = join(postgresBin, 'psql.exe');
const createdb = join(postgresBin, 'createdb.exe');
const dropdb = join(postgresBin, 'dropdb.exe');
const host = process.env.PGHOST ?? '127.0.0.1';
const port = process.env.PGPORT ?? '54322';
const user = process.env.PGUSER ?? 'postgres';
const database = `ping_c4b_fresh_${process.pid}`;
const environment = {
  ...process.env,
  PGPASSWORD: process.env.PGPASSWORD ?? 'postgres',
};

if (!/^ping_c4b_fresh_\d+$/.test(database)) {
  throw new Error('Refusing to operate on an unexpected database name');
}

function run(executable, args, options = {}) {
  const result = spawnSync(executable, args, {
    cwd: repositoryRoot,
    env: environment,
    encoding: 'utf8',
    stdio: options.capture ? 'pipe' : 'inherit',
  });

  if (result.status !== 0) {
    const details = options.capture ? `${result.stdout ?? ''}${result.stderr ?? ''}`.trim() : '';
    throw new Error(`${executable} failed with exit code ${result.status}${details ? `: ${details}` : ''}`);
  }

  return result;
}

const connectionArgs = ['--host', host, '--port', port, '--username', user];
const bootstrap = String.raw`
create schema auth;
create table auth.users (
  id uuid primary key,
  email text
);
create or replace function auth.uid()
returns uuid
language sql
stable
as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;
create publication supabase_realtime;
grant usage on schema public to anon, authenticated, service_role;
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
`;

let created = false;
try {
  run(createdb, [...connectionArgs, database]);
  created = true;
  run(psql, [...connectionArgs, '--dbname', database, '--set', 'ON_ERROR_STOP=1', '--command', bootstrap]);

  const migrations = readdirSync(migrationsDir)
    .filter((name) => /^\d+.*\.sql$/.test(name))
    .sort((left, right) => left.localeCompare(right));

  for (const migration of migrations) {
    process.stdout.write(`Applying ${migration}\n`);
    run(psql, [
      ...connectionArgs,
      '--dbname', database,
      '--set', 'ON_ERROR_STOP=1',
      '--single-transaction',
      '--file', join(migrationsDir, migration),
    ]);
  }

  for (const integrationTest of integrationTests) {
    run(psql, [
      ...connectionArgs,
      '--dbname', database,
      '--set', 'ON_ERROR_STOP=1',
      '--file', integrationTest,
    ]);
  }
  process.stdout.write(`Fresh migration certification passed (${migrations.length} migrations).\n`);
} finally {
  if (created) {
    run(dropdb, [...connectionArgs, '--if-exists', database]);
    process.stdout.write(`Temporary database ${database} removed.\n`);
  }
}
