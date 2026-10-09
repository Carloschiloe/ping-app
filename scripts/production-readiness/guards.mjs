import crypto from 'node:crypto';

export const PRODUCTION_REF = 'wbigqhtuzfmpnxservlf';
export const STAGING_REF = 'oonijgmddgyymhrlnvuu';
export const RC_SHA = 'ac7d72af5dfd4a9744a356eca6539bab75609b22';
export const ROLLBACK_SHA = 'b6b7175f9b87abfa5fda422931f8e4c4fa92f5c8';

export function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

export function requireExact(value, expected, name) {
  if (value !== expected) throw new Error(`${name} must equal the approved production value`);
}

export function assertProductionTarget({ projectRef, url }) {
  requireExact(projectRef, PRODUCTION_REF, 'projectRef');
  const expectedHost = `${PRODUCTION_REF}.supabase.co`;
  let host;
  try { host = new URL(url).hostname; } catch { throw new Error('SUPABASE_URL is not a valid URL'); }
  requireExact(host, expectedHost, 'SUPABASE_URL host');
  if (url.includes(STAGING_REF)) throw new Error('staging project is forbidden for production inspection');
}

export function safePresence(value) {
  return typeof value === 'string' && value.length > 0;
}

export function redactError(error) {
  return String(error?.message ?? error)
    .replace(/(authorization|apikey|service_role|password|token|secret)\s*[:=]\s*[^\s,;]+/gi, '$1=[REDACTED]')
    .replace(/[A-Za-z0-9_-]{32,}/g, '[REDACTED]');
}

export function json(value) {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}
