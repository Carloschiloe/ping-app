import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import test from 'node:test';

const bridgePath = 'supabase/production-reconciliation/20261009_production_legacy_to_rc_bridge.sql';
const precheckPath = 'supabase/production-reconciliation/production-bridge-precheck.sql';
const postcheckPath = 'supabase/production-reconciliation/production-bridge-postcheck.sql';
const stripComments = (value) => value.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*--.*$/gm, '');

test('bridge is outside migration chain and carries explicit gates', async () => {
  const bridge = await fs.readFile(bridgePath, 'utf8');
  assert.match(bridge, /DO NOT AUTO-APPLY/);
  assert.match(bridge, /REQUIRES BACKUP/);
  assert.match(bridge, /ping\.backup_created/);
  assert.match(bridge, /ping\.legacy_client_access_reviewed/);
  assert.match(bridge, /enable row level security/);
  assert.match(bridge, /revoke all privileges on table/);
  assert.doesNotMatch(stripComments(bridge), /\b(delete\s+from|truncate|drop\s+(table|column))\b/i);
  assert.doesNotMatch(stripComments(bridge), /storage\.(objects|buckets)\s+(delete|update|insert)/i);
});

test('precheck/postcheck are read-only and preserve mandatory baselines', async () => {
  const pre = await fs.readFile(precheckPath, 'utf8');
  const post = await fs.readFile(postcheckPath, 'utf8');
  for (const sql of [pre, post]) {
    assert.doesNotMatch(stripComments(sql), /\b(insert|update|delete|alter|create|drop|truncate|grant|revoke)\b/i);
  }
  assert.match(pre, /count\(\*\).*4/);
  assert.match(pre, /count\(\*\).*2/);
  assert.match(pre, /count\(\*\).*48/);
  assert.match(pre, /expected_public_profiles/);
  assert.match(pre, /captured baseline/);
  assert.doesNotMatch(pre, /coalesce\(sum\(row_count\),\s*0\)\s*=\s*0/);
  assert.match(post, /auth_users_preserved/);
  assert.match(post, /storage_objects_preserved/);
});
