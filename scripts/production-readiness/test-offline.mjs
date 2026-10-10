import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import test from 'node:test';
import { assertProductionTarget, redactError, PRODUCTION_REF, STAGING_REF } from './guards.mjs';
import { inspectProduction } from './inspect-production-readonly.mjs';

test('production target rejects staging', () => assert.throws(() => assertProductionTarget({ projectRef: STAGING_REF, url: `https://${STAGING_REF}.supabase.co` })));
test('production target accepts only historical production ref', () => assert.doesNotThrow(() => assertProductionTarget({ projectRef: PRODUCTION_REF, url: `https://${PRODUCTION_REF}.supabase.co` })));
test('inspector requires database URL and never writes', async () => {
  const result = await inspectProduction({ projectRef: PRODUCTION_REF, url: `https://${PRODUCTION_REF}.supabase.co`, databaseUrl: 'postgres://redacted', query: async () => ({ public_table_count: 12, public_policy_count: 8, applied_migration_count: 0 }) });
  assert.equal(result.readOnly, true);
  assert.equal(result.rows.applied_migration_count, 0);
});
test('inspector fails closed without database URL', async () => {
  await assert.rejects(() => inspectProduction({ projectRef: PRODUCTION_REF, url: `https://${PRODUCTION_REF}.supabase.co`, databaseUrl: '' }));
});
test('error redaction removes secret-like values', () => {
  const value = redactError(new Error('token=super-secret-value-12345678901234567890'));
  assert.doesNotMatch(value, /super-secret/);
});

test('reconciliation refuses to infer pending migrations from file count', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'ping-readiness-'));
  try {
    await writeFile(join(dir, 'manifest.json'), JSON.stringify({ migrationCount: 1, migrations: [{ file: '20260712000000_baseline_v2.sql', timestamp: '20260712000000', classification: 'BASELINE_ONLY' }] }));
    await writeFile(join(dir, 'history.json'), JSON.stringify({ applied: [] }));
    await writeFile(join(dir, 'schema.json'), JSON.stringify({ tables: [] }));
    const child = spawn(process.execPath, ['scripts/production-readiness/reconcile-migrations.mjs', '--manifest', join(dir, 'manifest.json'), '--remote-history', join(dir, 'history.json'), '--remote-schema', join(dir, 'schema.json'), '--project-ref', PRODUCTION_REF], { cwd: process.cwd() });
    let output = '';
    child.stdout.on('data', (chunk) => { output += chunk; });
    const exitCode = await new Promise((resolve) => child.on('close', resolve));
    assert.equal(exitCode, 0);
    const result = JSON.parse(output);
    assert.equal(result.safeToApply, false);
    assert.equal(result.rows[0].status, 'DO_NOT_APPLY_BASELINE_BLINDLY');
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('backup gate requires both creation and verification evidence', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'ping-backup-gate-'));
  try {
    const evidence = { projectRef: PRODUCTION_REF, backupId: 'b', schemaBackupSha256: 's', dataBackupSha256: 'd', storageInventoryId: 'i', storageBinaryBackupId: 'sb', storageBinaryBackupSha256: 'sbs', restoreVerificationId: 'r', createdAt: '2026-10-09T00:00:00Z', encrypted: true, outsideProvider: true, publicRowCounts: { profiles: 1 }, publicRowTotal: 1, authUserBaseline: 1, storageBucketBaseline: 1, storageObjectBaseline: 1, publicRowBaseline: 'CAPTURED_AND_PRESERVED' };
    await writeFile(join(dir, 'evidence.json'), JSON.stringify(evidence));
    const child = spawn(process.execPath, ['scripts/production-readiness/validate-backup-gate.mjs', join(dir, 'evidence.json')], { cwd: process.cwd() });
    let output = '';
    child.stdout.on('data', (chunk) => { output += chunk; });
    const exitCode = await new Promise((resolve) => child.on('close', resolve));
    assert.notEqual(exitCode, 0);
    assert.equal(JSON.parse(output).valid, false);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('backup gate accepts a complete runtime public-row baseline', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'ping-backup-gate-valid-'));
  try {
    const publicRowCounts = Object.fromEntries([
      'profiles', 'messages', 'commitments', 'subscriptions', 'contacts', 'conversations',
      'conversation_participants', 'message_reactions', 'user_calendar_accounts', 'ai_messages',
      'calls', 'operation_checklists', 'operation_checklist_items', 'operation_checklist_runs',
      'operation_checklist_run_items', 'shift_reports', 'conversation_operation_focuses',
      'commitment_operation_progress',
    ].map((table) => [table, 0]));
    const evidence = {
      projectRef: PRODUCTION_REF, backupId: 'b', schemaBackupSha256: 's', dataBackupSha256: 'd',
      storageInventoryId: 'i', storageBinaryBackupId: 'sb', storageBinaryBackupSha256: 'sbs',
      restoreVerificationId: 'r', createdAt: '2026-10-09T00:00:00Z', encrypted: true,
      outsideProvider: true, BACKUP_CREATED: 'YES', BACKUP_VERIFIED: 'YES', publicRowCounts,
      publicRowTotal: 0, authUserBaseline: 0, storageBucketBaseline: 0,
      storageObjectBaseline: 0, publicRowBaseline: 'CAPTURED_AND_PRESERVED',
    };
    await writeFile(join(dir, 'evidence.json'), JSON.stringify(evidence));
    const child = spawn(process.execPath, ['scripts/production-readiness/validate-backup-gate.mjs', join(dir, 'evidence.json')], { cwd: process.cwd() });
    let output = '';
    child.stdout.on('data', (chunk) => { output += chunk; });
    const exitCode = await new Promise((resolve) => child.on('close', resolve));
    assert.equal(exitCode, 0);
    assert.equal(JSON.parse(output).valid, true);
  } finally { await rm(dir, { recursive: true, force: true }); }
});
