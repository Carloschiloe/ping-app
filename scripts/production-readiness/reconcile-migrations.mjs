import fs from 'node:fs/promises';
import { PRODUCTION_REF, json, redactError } from './guards.mjs';

function usage() { throw new Error('usage: node reconcile-migrations.mjs --manifest FILE --remote-history FILE --remote-schema FILE --project-ref wbigqhtuzfmpnxservlf'); }
function arg(name) { const i = process.argv.indexOf(name); return i < 0 ? undefined : process.argv[i + 1]; }
const manifestPath = arg('--manifest');
const historyPath = arg('--remote-history');
const schemaPath = arg('--remote-schema');
const ref = arg('--project-ref');
if (!manifestPath || !historyPath || !schemaPath || ref !== PRODUCTION_REF) usage();
try {
  const [manifest, history, schema] = await Promise.all([manifestPath, historyPath, schemaPath].map((p) => fs.readFile(p, 'utf8').then(JSON.parse)));
  if (!Array.isArray(manifest.migrations) || !Array.isArray(history.applied)) throw new Error('malformed manifest/history');
  const applied = new Set(history.applied.map((x) => typeof x === 'string' ? x : x.version));
  const rows = manifest.migrations.map((m) => ({
    file: m.file,
    status: applied.has(m.timestamp) ? 'ALREADY_APPLIED_UNKNOWN_SCHEMA_MATCH' : m.classification === 'BASELINE_ONLY' ? 'DO_NOT_APPLY_BASELINE_BLINDLY' : 'PENDING_REQUIRES_REVIEW',
    classification: m.classification
  }));
  json({ projectRef: ref, schemaSnapshotPresent: Boolean(schema), migrationCount: manifest.migrationCount, appliedCount: applied.size, rows, safeToApply: false, reason: 'No migration is approved from file difference alone.' });
} catch (error) { json({ ok: false, error: redactError(error) }); process.exitCode = 1; }
