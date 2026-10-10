import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import test from 'node:test';

const snapshot = JSON.parse(await fs.readFile('docs/production-readiness/production-snapshot-20261010.json', 'utf8'));
const pkg = JSON.parse(await fs.readFile('docs/production-readiness/production-forward-package.json', 'utf8'));

test('production snapshot is the confirmed target and preserves the legacy baseline', () => {
  assert.equal(snapshot.projectRef, 'wbigqhtuzfmpnxservlf');
  assert.equal(snapshot.status, 'ACTIVE_HEALTHY');
  assert.equal(snapshot.publicTableCount, 18);
  assert.equal(snapshot.publicRowCount, 0);
  assert.equal(snapshot.dataStatus, 'STALE_FOR_ROW_COUNTS');
  assert.equal(snapshot.publicRowCountAuthority, 'historical_snapshot_only');
  assert.equal(snapshot.authUserCount, 4);
  assert.deepEqual(snapshot.storage.buckets, ['chat-media', 'recordings']);
  assert.equal(snapshot.storage.objectCount, 48);
  assert.equal(snapshot.rls.disabled.length, 11);
  assert.equal(snapshot.directPrivileges.confirmed, true);
});

test('forward package is ordered, excludes baseline replay and remains fail-closed', () => {
  assert.equal(pkg.projectRef, snapshot.projectRef);
  assert.equal(pkg.rcSha, 'ac7d72af5dfd4a9744a356eca6539bab75609b22');
  assert.equal(pkg.baselinePolicy, 'never-replay-20260712000000_baseline_v2.sql');
  assert.ok(pkg.gates.includes('BACKUP_VERIFIED=YES'));
  assert.equal(pkg.dataSafety.noDrop, true);
  assert.equal(pkg.dataSafety.noReset, true);
  assert.deepEqual(pkg.steps.map((step) => step.order), [...pkg.steps].sort((a, b) => a.order - b.order).map((step) => step.order));
  assert.equal(pkg.notIncluded.length, 3);
  assert.ok(pkg.notIncluded.some((entry) => entry.file.endsWith('baseline_v2.sql')));
  assert.equal(pkg.steps.filter((step) => step.kind === 'migration').length, 29);
  assert.equal(pkg.steps.filter((step) => step.kind === 'history_only').length, 1);
});
