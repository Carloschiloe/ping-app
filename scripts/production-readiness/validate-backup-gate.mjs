import fs from 'node:fs/promises';
import { json, redactError, PRODUCTION_REF } from './guards.mjs';

const file = process.argv[2];
if (!file) throw new Error('usage: node validate-backup-gate.mjs EVIDENCE.json');
try {
  const evidence = JSON.parse(await fs.readFile(file, 'utf8'));
  const required = ['projectRef', 'backupId', 'schemaBackupSha256', 'dataBackupSha256', 'storageInventoryId', 'restoreVerificationId', 'createdAt'];
  const missing = required.filter((k) => !evidence[k]);
  const backupCreated = evidence.BACKUP_CREATED === 'YES';
  const backupVerified = evidence.BACKUP_VERIFIED === 'YES';
  const valid = evidence.projectRef === PRODUCTION_REF && missing.length === 0 && evidence.encrypted === true && evidence.outsideProvider === true && backupCreated && backupVerified;
  json({ valid, projectRef: evidence.projectRef, missing, backupCreated, backupVerified, encrypted: evidence.encrypted === true, outsideProvider: evidence.outsideProvider === true, mutationPerformed: false });
  if (!valid) process.exitCode = 1;
} catch (error) { json({ valid: false, error: redactError(error) }); process.exitCode = 1; }
