import { getEnvConfig } from '../config/env';

/**
 * The durable dialogue boundary is the canonical runtime in staging. Local
 * development keeps the explicit opt-in used by isolated tests; production
 * never enables this path implicitly.
 */
export function isCanonicalDurableAgentRuntimeEnabled(): boolean {
    const environment = getEnvConfig().environmentName;
    if (!process.env.PING_M7_DATABASE_URL) return false;
    if (environment === 'staging') return true;
    return environment === 'local' && process.env.PING_ENABLE_DURABLE_AGENT_TURN === 'true';
}
