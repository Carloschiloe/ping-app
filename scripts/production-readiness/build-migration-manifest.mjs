import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { sha256 } from './guards.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '..', '..');
const migrationsDir = path.join(repoRoot, 'supabase', 'migrations');
const output = path.join(repoRoot, 'docs', 'production-readiness', 'migration-manifest.json');

function stripComments(sql) {
  return sql.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*--.*$/gm, '');
}

function classify(name, sql) {
  const active = stripComments(sql).toLowerCase();
  if (name.includes('baseline_v2')) return { classification: 'BASELINE_ONLY', reasons: ['fresh-database baseline; never infer applicability to historical production'] };
  const reasons = [];
  if (/\bdrop\s+(table|column|type|schema)\b|\btruncate\b|\bdelete\s+from\b/.test(active)) reasons.push('active destructive/data operation');
  if (/\balter\s+table\b|\balter\s+type\b|\bcreate\s+or\s+replace\s+function\b|\bcreate\s+policy\b|\bdrop\s+policy\b|\bsecurity\s+definer\b|\bgrant\b/.test(active)) reasons.push('requires live-schema/RLS/function review');
  if (/\bupdate\s+[^;]+\bset\b/.test(active)) reasons.push('data backfill/update requires row-count and rollback review');
  if (/\bcreate\s+(table|index|function|trigger)\b/.test(active)) reasons.push('creates executable/database objects');
  return { classification: reasons.some((r) => r.includes('destructive')) ? 'DESTRUCTIVE_OR_DATA_RISK' : reasons.length ? 'REQUIRES_REVIEW' : 'SAFE_FORWARD', reasons };
}

const names = (await fs.readdir(migrationsDir)).filter((n) => n.endsWith('.sql')).sort();
const migrations = [];
for (const name of names) {
  const sql = await fs.readFile(path.join(migrationsDir, name), 'utf8');
  const result = classify(name, sql);
  migrations.push({ file: name, timestamp: name.slice(0, 14), sha256: sha256(sql), ...result });
}
const manifest = {
  schemaSource: 'supabase/migrations',
  generatedFrom: 'ac7d72af5dfd4a9744a356eca6539bab75609b22',
  migrationCount: migrations.length,
  policy: 'classification is conservative; live applicability requires read-only schema and migration-history evidence',
  migrations
};
if (process.argv.includes('--write')) {
  await fs.mkdir(path.dirname(output), { recursive: true });
  await fs.writeFile(output, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
}
process.stdout.write(`${JSON.stringify(manifest, null, 2)}\n`);
