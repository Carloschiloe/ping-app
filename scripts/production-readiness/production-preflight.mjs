import { assertProductionTarget, json, redactError, safePresence, PRODUCTION_REF, RC_SHA, ROLLBACK_SHA, STAGING_REF } from './guards.mjs';

const config = {
  environment: process.env.PING_ENVIRONMENT,
  projectRef: process.env.PRODUCTION_SUPABASE_PROJECT_REF,
  url: process.env.PRODUCTION_SUPABASE_URL,
  semanticModel: process.env.PING_SEMANTIC_MODEL,
  semanticFamily: process.env.PING_SEMANTIC_MODEL_FAMILY,
  expectedSha: process.env.PRODUCTION_EXPECTED_RC_SHA,
  openAiKey: safePresence(process.env.OPENAI_API_KEY),
  supabaseAnonKey: safePresence(process.env.SUPABASE_ANON_KEY),
  supabaseServiceRoleKey: safePresence(process.env.SUPABASE_SERVICE_ROLE_KEY),
  rollbackSha: process.env.ROLLBACK_SHA,
  backupGate: process.env.BACKUP_GATE === 'PASS',
  schemaPlan: process.env.SCHEMA_RECONCILIATION === 'PASS',
  health: process.env.PRODUCTION_READONLY_HEALTH === 'PASS'
};
const checks = [];
try {
  if (config.environment !== 'production') throw new Error('PING_ENVIRONMENT must be production');
  if (config.projectRef === STAGING_REF) throw new Error('staging project is forbidden');
  assertProductionTarget({ projectRef: config.projectRef, url: config.url });
  checks.push('production-target');
  if (config.expectedSha !== RC_SHA) throw new Error('expected release candidate SHA mismatch');
  if (config.rollbackSha !== ROLLBACK_SHA) throw new Error('rollback SHA mismatch');
  if (!config.openAiKey || !config.supabaseAnonKey || !config.supabaseServiceRoleKey) throw new Error('required secret presence gate failed');
  if (!config.backupGate || !config.schemaPlan || !config.health) throw new Error('backup/schema/health gates are not PASS');
  json({ ready: true, checks, projectRef: PRODUCTION_REF, model: config.semanticModel, family: config.semanticFamily, secretsPresent: true, mutationPerformed: false });
} catch (error) { json({ ready: false, checks, error: redactError(error), mutationPerformed: false }); process.exitCode = 1; }
