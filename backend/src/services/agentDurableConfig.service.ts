import { getEnvConfig } from '../config/env';

export type DurableAgentRuntimeStatus = {
    enabled: boolean;
    reason: 'ready' | 'missing_private_database_url' | 'disabled_by_flag' | 'unsupported_environment';
    environment: string;
    privateTransportConfigured: boolean;
    explicitGateEnabled: boolean;
};

/**
 * The durable dialogue boundary is the canonical runtime for every deployed
 * surface. Production requires an explicit feature flag so a deploy cannot
 * silently change conversational state handling. The durable admission
 * boundary uses the private PostgreSQL RPC transport; a Supabase service-role
 * key alone is not a substitute for that transport.
 */
export function isCanonicalDurableAgentRuntimeEnabled(): boolean {
    return getDurableAgentRuntimeStatus().enabled;
}

/**
 * Exposes only non-secret readiness metadata for health/operations. The
 * private database URL itself is never returned, logged, or echoed.
 */
export function getDurableAgentRuntimeStatus(): DurableAgentRuntimeStatus {
    const environment = getEnvConfig().environmentName;
    const privateTransportConfigured = Boolean(process.env.PING_M7_DATABASE_URL);
    const explicitGateEnabled = process.env.PING_ENABLE_DURABLE_AGENT_TURN === 'true';

    if (!privateTransportConfigured) {
        return {
            enabled: false,
            reason: 'missing_private_database_url',
            environment,
            privateTransportConfigured: false,
            explicitGateEnabled,
        };
    }

    if (!explicitGateEnabled) {
        return {
            enabled: false,
            reason: 'disabled_by_flag',
            environment,
            privateTransportConfigured: true,
            explicitGateEnabled: false,
        };
    }

    if (environment === 'production') {
        return {
            enabled: true,
            reason: 'ready',
            environment,
            privateTransportConfigured: true,
            explicitGateEnabled: true,
        };
    }

    // Vitest uses the isolated test environment name; an explicit flag plus
    // the private transport keeps this opt-in just as strict as local.
    const enabledOutsideProduction = environment === 'local' || environment === 'test';
    return {
        enabled: enabledOutsideProduction,
        reason: enabledOutsideProduction ? 'ready' : 'unsupported_environment',
        environment,
        privateTransportConfigured: true,
        explicitGateEnabled: true,
    };
}
