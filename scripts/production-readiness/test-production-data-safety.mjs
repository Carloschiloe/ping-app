import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import test from 'node:test';

const packageFile = JSON.parse(await fs.readFile('docs/production-readiness/production-forward-package.json', 'utf8'));
const migrationFiles = packageFile.steps.filter((step) => step.kind === 'migration').map((step) => step.file);
const legacyTables = new Set([
  'profiles', 'messages', 'commitments', 'subscriptions', 'contacts', 'conversations',
  'conversation_participants', 'message_reactions', 'user_calendar_accounts', 'ai_messages',
  'calls', 'operation_checklists', 'operation_checklist_items', 'operation_checklist_runs',
  'operation_checklist_run_items', 'shift_reports', 'conversation_operation_focuses',
  'commitment_operation_progress',
]);
const withoutComments = (value) => value
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/^\s*--.*$/gm, '');

test('all executable forward migrations are non-destructive at statement level', async () => {
  assert.equal(migrationFiles.length, 29);
  for (const file of migrationFiles) {
    const sql = withoutComments(await fs.readFile(file, 'utf8'));
    assert.doesNotMatch(sql, /\b(?:truncate|delete\s+from|drop\s+table|drop\s+column)\b/i, file);
    assert.doesNotMatch(sql, /alter\s+table\s+public\.[a-z_]+[\s\S]*?alter\s+column[\s\S]*?\btype\b/i, file);
    assert.doesNotMatch(sql, /alter\s+table\s+public\.[a-z_]+[\s\S]*?\bset\s+not\s+null\b/i, file);
    const legacyAlterStatements = sql.match(/alter\s+table\s+public\.([a-z_]+)[\s\S]*?;/gi) ?? [];
    for (const statement of legacyAlterStatements) {
      const table = statement.match(/alter\s+table\s+public\.([a-z_]+)/i)?.[1];
      if (!legacyTables.has(table)) continue;
      assert.doesNotMatch(statement, /add\s+column[\s\S]*?\bnot\s+null\b(?![\s\S]*?\bdefault\b)/i, `${file}:${table}`);
      assert.doesNotMatch(statement, /alter\s+column[\s\S]*?\btype\b/i, `${file}:${table}`);
    }
    const updateStatements = sql.match(/update\s+public\.[a-z_]+[\s\S]*?(?=\bupdate\s+public\.|\binsert\s+into\s+public\.|\balter\s+table\s+public\.|\bcreate\s+(?:or\s+replace\s+)?function\b|$)/gi) ?? [];
    for (const statement of updateStatements) assert.match(statement, /\bwhere\b/i, `${file}:UPDATE without WHERE`);
  }
});

test('constraint replacement is paired and additive', async () => {
  for (const file of migrationFiles) {
    const sql = withoutComments(await fs.readFile(file, 'utf8'));
    if (!/drop\s+constraint/i.test(sql)) continue;
    const dropped = [...sql.matchAll(/drop\s+constraint(?:\s+if\s+exists)?\s+([a-z_]+)/gi)].map((match) => match[1]);
    for (const name of dropped) assert.match(sql, new RegExp(`add\\s+constraint\\s+${name}\\b`, 'i'), `${file}:${name}`);
  }
});

test('historical backfill is additive/idempotent and preserves message rows', async () => {
  const messaging = withoutComments(await fs.readFile('supabase/migrations/20260830010000_messaging_core_canonical.sql', 'utf8'));
  assert.match(messaging, /on\s+conflict\s*\(message_id,\s*user_id\)\s+do\s+nothing/i);
  assert.match(messaging, /update\s+public\.messages[\s\S]*set\s+status\s*=/i);
  assert.doesNotMatch(messaging, /delete\s+from\s+public\.messages|truncate\s+public\.messages/i);
});

console.log('STATIC_MIGRATION_DATA_SAFETY=PASS');
