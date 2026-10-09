import dns from 'node:dns/promises';
import { assertProductionTarget, json, redactError, PRODUCTION_REF, RC_SHA, STAGING_REF } from './guards.mjs';
import { inspectProduction } from './inspect-production-readonly.mjs';

function required(name) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
}

async function getJson(url, headers = {}) {
  const response = await fetch(url, { method: 'GET', headers, signal: AbortSignal.timeout(10_000) });
  const body = await response.json().catch(() => null);
  return { status: response.status, ok: response.ok, body };
}

async function main() {
  if (process.env.RUN_POST_RESTORE_INSPECT !== 'YES') throw new Error('RUN_POST_RESTORE_INSPECT=YES is required');
  const projectRef = required('PRODUCTION_SUPABASE_PROJECT_REF');
  const supabaseUrl = required('PRODUCTION_SUPABASE_URL');
  const databaseUrl = required('PRODUCTION_DATABASE_URL');
  const renderUrl = required('PRODUCTION_RENDER_URL').replace(/\/$/, '');
  const anonKey = required('SUPABASE_ANON_KEY');
  assertProductionTarget({ projectRef, url: supabaseUrl });
  if (projectRef === STAGING_REF || supabaseUrl.includes(STAGING_REF)) throw new Error('staging target rejected');
  const host = new URL(supabaseUrl).hostname;
  const addresses = await dns.lookup(host, { all: true });
  if (addresses.length === 0) throw new Error('production Supabase DNS returned no addresses');
  const api = await getJson(`${supabaseUrl}/rest/v1/`, { apikey: anonKey });
  if (!api.ok && api.status !== 401 && api.status !== 403) throw new Error(`Supabase API health failed with HTTP ${api.status}`);
  const health = await getJson(`${renderUrl}/api/health`);
  if (!health.ok || health.body?.ok !== true) throw new Error(`Render health failed with HTTP ${health.status}`);
  const db = await inspectProduction({ projectRef, url: supabaseUrl, databaseUrl });
  json({
    ready: true,
    readOnly: true,
    mutationPerformed: false,
    projectRef: PRODUCTION_REF,
    rcShaForComparison: RC_SHA,
    dns: { host, addressCount: addresses.length },
    supabaseApi: { status: api.status, accepted: api.ok || api.status === 401 || api.status === 403 },
    renderHealth: { status: health.status, ok: health.body?.ok === true },
    database: db.rows,
    next: 'Run migration reconciliation from the captured schema/history; do not execute DDL.'
  });
}

try { await main(); } catch (error) { json({ ready: false, readOnly: true, mutationPerformed: false, error: redactError(error, [process.env.PRODUCTION_DATABASE_URL, process.env.SUPABASE_ANON_KEY]) }); process.exitCode = 1; }
