import { assertProductionTarget, json, redactError, safePresence } from './guards.mjs';

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
      (select count(*)::int from information_schema.tables where table_schema='public') as public_table_count,
      (select count(*)::int from pg_policies where schemaname='public') as public_policy_count,
      (select count(*)::int from supabase_migrations.schema_migrations) as applied_migration_count`);
    await client.query('ROLLBACK');
    return result.rows[0];
  } finally { await client.end(); }
}

if (import.meta.url === `file://${process.argv[1]?.replaceAll('\\', '/')}`) {
  try {
    json(await inspectProduction({
      projectRef: process.env.PRODUCTION_SUPABASE_PROJECT_REF,
      url: process.env.PRODUCTION_SUPABASE_URL,
      databaseUrl: process.env.PRODUCTION_DATABASE_URL
    }));
  } catch (error) { json({ ok: false, readOnly: true, error: redactError(error) }); process.exitCode = 1; }
}
