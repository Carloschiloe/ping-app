import fs from 'node:fs/promises';
import { json, redactError, PRODUCTION_REF } from './guards.mjs';

const file = process.argv[2];
if (!file) throw new Error('usage: node validate-backup-gate.mjs EVIDENCE.json');

const publicTables = [
  'profiles', 'messages', 'commitments', 'subscriptions', 'contacts', 'conversations',
  'conversation_participants', 'message_reactions', 'user_calendar_accounts', 'ai_messages',
  'calls', 'operation_checklists', 'operation_checklist_items', 'operation_checklist_runs',
  'operation_checklist_run_items', 'shift_reports', 'conversation_operation_focuses',
  'commitment_operation_progress',
];
const sha256 = /^[a-f0-9]{64}$/;

try {
  const evidence = JSON.parse(await fs.readFile(file, 'utf8'));
  const required = [
    'projectRef', 'backupId', 'schemaBackupSha256', 'dataBackupSha256',
    'applicationSchemaBackupSha256', 'applicationDataBackupSha256', 'applicationRolesBackupSha256',
    'authRecoveryBackupSha256', 'storageInventoryId', 'storageBinaryBackupId',
    'storageBinaryBackupSha256', 'restoreVerificationId', 'createdAt', 'publicRowCounts',
    'publicRowTotal', 'authUserBaseline', 'storageBucketBaseline', 'storageObjectBaseline',
    'authUserIdsSha256', 'authIdentityBaseline', 'authIdentityIdsSha256', 'storageInventoryValidation',
    'encryptedPackageRoundTrip',
    'publicRowBaseline', 'backupTool', 'applicationDumpTool', 'rolesDumpTool', 'authRecoveryMode', 'restoreRehearsal',
    'appPortableValidation', 'managedSchemasExcludedFromApplicationDump', 'genericManagedRestoreAttempted',
  ];
  const missing = required.filter((key) => evidence[key] === undefined || evidence[key] === null || evidence[key] === '');
  const backupCreated = evidence.BACKUP_CREATED === 'YES';
  const backupVerified = evidence.BACKUP_VERIFIED === 'YES';
  const publicCountsValid = evidence.publicRowCounts && typeof evidence.publicRowCounts === 'object'
    && publicTables.every((table) => Number.isInteger(evidence.publicRowCounts[table]) && evidence.publicRowCounts[table] >= 0)
    && publicTables.reduce((sum, table) => sum + evidence.publicRowCounts[table], 0) === evidence.publicRowTotal;
  const publicBaselineValid = evidence.publicRowBaseline === 'CAPTURED_AND_PRESERVED'
    && publicCountsValid
    && Number.isInteger(evidence.publicRowTotal) && evidence.publicRowTotal >= 0
    && Number.isInteger(evidence.authUserBaseline) && evidence.authUserBaseline >= 0
    && Number.isInteger(evidence.authIdentityBaseline) && evidence.authIdentityBaseline >= 0
    && Number.isInteger(evidence.storageBucketBaseline) && evidence.storageBucketBaseline >= 0
    && Number.isInteger(evidence.storageObjectBaseline) && evidence.storageObjectBaseline >= 0;
  const hashesValid = [
    evidence.schemaBackupSha256, evidence.dataBackupSha256, evidence.applicationSchemaBackupSha256,
    evidence.applicationDataBackupSha256, evidence.applicationRolesBackupSha256,
    evidence.authRecoveryBackupSha256, evidence.storageBinaryBackupSha256,
  ].every((value) => typeof value === 'string' && sha256.test(value));
  const supportedTool = evidence.backupTool === 'PG_DUMP_APPLICATION_ONLY'
    && evidence.applicationDumpTool === 'PG_DUMP_APPLICATION_ONLY';
  const authBaselineValid = typeof evidence.authUserIdsSha256 === 'string' && sha256.test(evidence.authUserIdsSha256)
    && typeof evidence.authIdentityIdsSha256 === 'string' && sha256.test(evidence.authIdentityIdsSha256);
  const supportedRestore = evidence.restoreRehearsal === 'SUPABASE_LOCAL_STACK_PASS';
  const managedBoundaryValid = evidence.managedSchemasExcludedFromApplicationDump === true
    && evidence.genericManagedRestoreAttempted === false
    && evidence.authRecoveryMode === 'SUPABASE_MANAGED_RECOVERY_ARTIFACT'
    && evidence.appPortableValidation === 'PASS';
  const componentPass = evidence.database === 'PASS' && evidence.auth === 'PASS'
    && evidence.storageMetadata === 'PASS' && evidence.storageInventoryValidation === 'PASS'
    && evidence.encryptedPackageRoundTrip === 'PASS' && evidence.sha256 === 'PASS'
    && evidence.productionPrecheck === 'PASS_WITH_EXPECTED_LEGACY_REVIEW'
    && evidence.storageBinaries === `${evidence.storageObjectBaseline}/${evidence.storageObjectBaseline}`;
  const valid = evidence.projectRef === PRODUCTION_REF
    && missing.length === 0 && publicBaselineValid && hashesValid && supportedTool && authBaselineValid
    && supportedRestore && managedBoundaryValid && componentPass
    && evidence.encrypted === true && evidence.outsideProvider === true
    && backupCreated && backupVerified;
  json({
    valid,
    projectRef: evidence.projectRef,
    missing,
    publicBaselineValid,
    hashesValid,
    supportedTool,
    supportedRestore,
    managedBoundaryValid,
    componentPass,
    backupCreated,
    backupVerified,
    encrypted: evidence.encrypted === true,
    outsideProvider: evidence.outsideProvider === true,
    mutationPerformed: false,
  });
  if (!valid) process.exitCode = 1;
} catch (error) {
  json({ valid: false, error: redactError(error) });
  process.exitCode = 1;
}
