import { getEnvConfig } from '../config/env';

/**
 * The durable dialogue boundary is the canonical runtime for every deployed
 * surface. Production requires an explicit feature flag so a deploy cannot
 * silently change conversational state handling. The durable admission
 * boundary uses the private PostgreSQL RPC transport; a Supabase service-role
 * key alone is not a substitute for that transport.
 */
export function isCanonicalDurableAgentRuntimeEnabled(): boolean {
    const environment = getEnvConfig().environmentName;
    const hasAdmissionTransport = Boolean(process.env.PING_M7_DATABASE_URL);
    if (!hasAdmissionTransport) return false;
    if (environment === 'production') return process.env.PING_ENABLE_DURABLE_AGENT_TURN === 'true';
    // Vitest uses the isolated test environment name; an explicit flag
    // plus the private transport keeps this opt-in just as strict as local.
    return (environment === 'local' || environment === 'test')
        && process.env.PING_ENABLE_DURABLE_AGENT_TURN === 'true';
}
