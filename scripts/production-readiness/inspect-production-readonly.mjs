import { assertProductionTarget, json, redactError, safePresence } from './guards.mjs';
import { pathToFileURL } from 'node:url';
import { sha256 } from './guards.mjs';

export async function inspectProduction({ projectRef, url, databaseUrl, query = defaultQuery }) {
  assertProductionTarget({ projectRef, url });
  if (!safePresence(databaseUrl)) throw new Error('PRODUCTION_DATABASE_URL is required for a real read-only inspection');
  const rows = await query(databaseUrl);
  return { projectRef, urlHost: new URL(url).hostname, readOnly: true, rows };
}

async function defaultQuery(databaseUrl) {
  let pg;
  try { pg = await import('pg'); } catch { throw new Error('pg dependency unavailable; inspection not executed'); }
  const client = new pg.Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    await client.query('BEGIN READ ONLY');
    const result = await client.query(`select current_database() as database_name,
      current_setting('server_version') as server_version,
      (select count(*)::int from information_schema.tables where table_schema='public') as public_table_count,
      (select count(*)::int from pg_policies where schemaname='public') as public_policy_count,
      (select count(*)::int from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public') as public_function_count,
      (select count(*)::int from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and not t.tgisinternal) as public_trigger_count,
      to_regclass('supabase_migrations.schema_migrations') as migration_history_relation`);
    const [tables, policies, functions, triggers] = await Promise.all([
      client.query(`select table_schema, table_name, column_name, data_type, is_nullable from information_schema.columns where table_schema='public' order by table_schema, table_name, ordinal_position`),
      client.query(`select schemaname, tablename, policyname, permissive, roles, cmd from pg_policies where schemaname='public' order by schemaname, tablename, policyname`),
      client.query(`select n.nspname as schema_name, p.proname as function_name, pg_get_function_identity_arguments(p.oid) as arguments from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' order by n.nspname, p.proname, arguments`),
      client.query(`select n.nspname as schema_name, c.relname as table_name, t.tgname as trigger_name from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and not t.tgisinternal order by n.nspname, c.relname, t.tgname`)
    ]);
    let appliedMigrationCount = null;
    let migrationHistory = [];
    if (result.rows[0].migration_history_relation) {
      const history = await client.query(`select version, name from supabase_migrations.schema_migrations order by version`);
      migrationHistory = history.rows.map(({ version, name }) => ({ version, name }));
      appliedMigrationCount = migrationHistory.length;
    }
    await client.query('ROLLBACK');
    const inventory = { tables: tables.rows, policies: policies.rows, functions: functions.rows, triggers: triggers.rows };
    return { ...result.rows[0], applied_migration_count: appliedMigrationCount, migration_history: migrationHistory, inventory, schema_fingerprint: sha256(JSON.stringify(inventory)) };
  } finally { await client.end(); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    json(await inspectProduction({
      projectRef: process.env.PRODUCTION_SUPABASE_PROJECT_REF,
      url: process.env.PRODUCTION_SUPABASE_URL,
      databaseUrl: process.env.PRODUCTION_DATABASE_URL
    }));
  } catch (error) { json({ ok: false, readOnly: true, error: redactError(error, [process.env.PRODUCTION_DATABASE_URL]) }); process.exitCode = 1; }
}
