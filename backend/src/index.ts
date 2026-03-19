import { app } from './app';
import { getEnvConfig, validateEnvironment } from './config/env';
import { startScheduledJobs } from './services/cronCoordinator';

try {
    validateEnvironment();
} catch (error: any) {
    console.error('❌ ERROR FATAL:', error.message);
    process.exit(1);
}

const env = getEnvConfig();

startScheduledJobs();

app.listen(env.port, () => {
    console.log(`✅ PING Backend listening on port ${env.port} (${env.nodeEnv})`);
});
