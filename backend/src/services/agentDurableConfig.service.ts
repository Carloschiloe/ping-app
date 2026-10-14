import { getEnvConfig } from '../config/env';

/**
 * The durable dialogue boundary is the canonical runtime for every deployed
 * surface. Staging keeps its historical implicit opt-in when the private
 * admission database is present. Production requires an explicit feature
 * flag so a deploy cannot silently change conversational state handling.
 */
export function isCanonicalDurableAgentRuntimeEnabled(): boolean {
    const environment = getEnvConfig().environmentName;
    const hasAdmissionTransport = Boolean(
        process.env.PING_M7_DATABASE_URL || process.env.SUPABASE_SERVICE_ROLE_KEY,
    );
    if (!hasAdmissionTransport) return false;
    if (environment === 'staging') return Boolean(process.env.PING_M7_DATABASE_URL);
    if (environment === 'production') return process.env.PING_ENABLE_DURABLE_AGENT_TURN === 'true';
    return environment === 'local' && process.env.PING_ENABLE_DURABLE_AGENT_TURN === 'true';
}
