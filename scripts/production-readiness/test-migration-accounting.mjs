import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import test from 'node:test';

test('all RC migrations have one explicit reconciliation disposition', async () => {
  const child = spawn(process.execPath, ['scripts/production-readiness/resolve-migration-accounting.mjs'], { cwd: process.cwd() });
  let stdout = '';
  let stderr = '';
  child.stdout.on('data', (chunk) => { stdout += chunk; });
  child.stderr.on('data', (chunk) => { stderr += chunk; });
  const exitCode = await new Promise((resolve) => child.on('close', resolve));
  assert.equal(exitCode, 0, stderr || stdout);
  const result = JSON.parse(stdout);
  assert.equal(result.migrationCount, 33);
  assert.equal(result.entries.length, 33);
  assert.equal(result.unknownCount, 0);
  assert.equal(result.readyAfterBackupAndPrecheck, true);
  assert.equal(result.snapshot, 'docs/production-readiness/production-snapshot-20261010.json');
  assert.equal(result.forwardPackage, 'docs/production-readiness/production-forward-package.json');
  assert.equal(result.safeToApply, false);
  assert.equal(result.counts.EXPLICITLY_BLOCKED_WITH_PROVEN_REASON, 1);
  assert.equal(result.counts.HANDLED_BY_BRIDGE, 2);
  assert.equal(result.counts.SAFE_FORWARD_AFTER_BRIDGE, 29);
  assert.equal(result.counts.HISTORY_ONLY_AFTER_VERIFICATION, 1);
});
