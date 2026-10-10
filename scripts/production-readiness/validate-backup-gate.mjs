import fs from 'node:fs/promises';
import { json, redactError, PRODUCTION_REF } from './guards.mjs';

const file = process.argv[2];
if (!file) throw new Error('usage: node validate-backup-gate.mjs EVIDENCE.json');
try {
  const evidence = JSON.parse(await fs.readFile(file, 'utf8'));
  const required = ['projectRef', 'backupId', 'schemaBackupSha256', 'dataBackupSha256', 'storageInventoryId', 'storageBinaryBackupId', 'storageBinaryBackupSha256', 'restoreVerificationId', 'createdAt', 'publicRowCounts', 'publicRowTotal', 'authUserBaseline', 'storageBucketBaseline', 'storageObjectBaseline', 'publicRowBaseline'];
  const publicTables = ['profiles', 'messages', 'commitments', 'subscriptions', 'contacts', 'conversations', 'conversation_participants', 'message_reactions', 'user_calendar_accounts', 'ai_messages', 'calls', 'operation_checklists', 'operation_checklist_items', 'operation_checklist_runs', 'operation_checklist_run_items', 'shift_reports', 'conversation_operation_focuses', 'commitment_operation_progress'];
  const missing = required.filter((k) => evidence[k] === undefined || evidence[k] === null || evidence[k] === '');
  const backupCreated = evidence.BACKUP_CREATED === 'YES';
  const backupVerified = evidence.BACKUP_VERIFIED === 'YES';
  const publicCountsValid = evidence.publicRowCounts && typeof evidence.publicRowCounts === 'object'
    && publicTables.every((table) => Number.isInteger(evidence.publicRowCounts[table]) && evidence.publicRowCounts[table] >= 0)
    && publicTables.reduce((sum, table) => sum + evidence.publicRowCounts[table], 0) === evidence.publicRowTotal;
  const publicBaselineValid = evidence.publicRowBaseline === 'CAPTURED_AND_PRESERVED'
    && publicCountsValid
    && Number.isInteger(evidence.publicRowTotal) && evidence.publicRowTotal >= 0
    && Number.isInteger(evidence.authUserBaseline) && evidence.authUserBaseline >= 0
    && Number.isInteger(evidence.storageBucketBaseline) && evidence.storageBucketBaseline >= 0
    && Number.isInteger(evidence.storageObjectBaseline) && evidence.storageObjectBaseline >= 0;
  const valid = evidence.projectRef === PRODUCTION_REF && missing.length === 0 && publicBaselineValid && evidence.encrypted === true && evidence.outsideProvider === true && backupCreated && backupVerified;
  json({ valid, projectRef: evidence.projectRef, missing, publicBaselineValid, backupCreated, backupVerified, encrypted: evidence.encrypted === true, outsideProvider: evidence.outsideProvider === true, mutationPerformed: false });
  if (!valid) process.exitCode = 1;
} catch (error) { json({ valid: false, error: redactError(error) }); process.exitCode = 1; }
