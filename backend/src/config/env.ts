import { parseAllowedOrigins } from '../security/corsPolicy';

type EnvConfig = {
    nodeEnv: string;
    environmentName: string;
    port: number;
    allowedOrigins: string[];
    runCronJobs: boolean;
    agentHistoryReconciler: boolean;
    encryptionKey: string;
};

const requiredEnvVars = [
    'SUPABASE_URL',
    'SUPABASE_ANON_KEY',
    'SUPABASE_SERVICE_ROLE_KEY',
    'ENCRYPTION_KEY',
];

const recommendedProductionEnvVars = [
    'ALLOWED_ORIGINS',
    'ENCRYPTION_KEY',
];

export function validateEnvironment() {
    const missingRequired = requiredEnvVars.filter((envKey) => !process.env[envKey]);
    if (missingRequired.length > 0) {
        throw new Error(`Missing required environment variables: ${missingRequired.join(', ')}`);
    }

    const expectedProjectRef = process.env.PING_EXPECTED_SUPABASE_PROJECT_REF?.trim();
    if (expectedProjectRef) {
        let supabaseHost: string;
        try {
            supabaseHost = new URL(process.env.SUPABASE_URL!).hostname;
        } catch {
            throw new Error('SUPABASE_URL must be a valid URL');
        }

        if (supabaseHost !== `${expectedProjectRef}.supabase.co`) {
            throw new Error(
                'SUPABASE_URL does not match PING_EXPECTED_SUPABASE_PROJECT_REF'
            );
        }
    }

    const allowedOrigins = parseAllowedOrigins(process.env.ALLOWED_ORIGINS);
    if (allowedOrigins.invalidCount > 0) {
        throw new Error(
            `ALLOWED_ORIGINS contains ${allowedOrigins.invalidCount} invalid origin entr${allowedOrigins.invalidCount === 1 ? 'y' : 'ies'}`
        );
    }

    if (process.env.NODE_ENV === 'production') {
        const missingRecommended = recommendedProductionEnvVars.filter((envKey) => {
            if (envKey === 'ALLOWED_ORIGINS') return allowedOrigins.origins.length === 0;
            return !process.env[envKey];
        });
        if (missingRecommended.length > 0) {
            console.warn(`[env] Missing recommended production env vars: ${missingRecommended.join(', ')}`);
        }
    }
}

export function getEnvConfig(): EnvConfig {
    return {
        nodeEnv: process.env.NODE_ENV || 'development',
        environmentName: process.env.PING_ENVIRONMENT || 'local',
        port: Number(process.env.PORT || 3000),
        allowedOrigins: parseAllowedOrigins(process.env.ALLOWED_ORIGINS).origins,
        // Background automations require a separate explicit containment gate.
        // A legacy RUN_CRON_JOBS=true value alone can no longer reactivate them.
        runCronJobs: process.env.ENABLE_AUTOMATIONS === 'true'
            && process.env.RUN_CRON_JOBS === 'true',
        // This repair loop only projects already-completed executions into
        // durable history. It has its own explicit gate so enabling recovery
        // never enables reminders, pushes, or other background automations.
        agentHistoryReconciler: process.env.ENABLE_AGENT_HISTORY_RECONCILER === 'true',
        encryptionKey: process.env.ENCRYPTION_KEY!,
    };
}
