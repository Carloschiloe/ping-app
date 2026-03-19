type EnvConfig = {
    nodeEnv: string;
    port: number;
    allowedOrigins: string[];
    runCronJobs: boolean;
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

    if (process.env.NODE_ENV === 'production') {
        const missingRecommended = recommendedProductionEnvVars.filter((envKey) => !process.env[envKey]);
        if (missingRecommended.length > 0) {
            console.warn(`[env] Missing recommended production env vars: ${missingRecommended.join(', ')}`);
        }
    }
}

export function getEnvConfig(): EnvConfig {
    return {
        nodeEnv: process.env.NODE_ENV || 'development',
        port: Number(process.env.PORT || 3000),
        allowedOrigins: (process.env.ALLOWED_ORIGINS || '')
            .split(',')
            .map((origin) => origin.trim())
            .filter(Boolean),
        runCronJobs: process.env.RUN_CRON_JOBS !== 'false',
        encryptionKey: process.env.ENCRYPTION_KEY!,
    };
}
