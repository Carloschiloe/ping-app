import { app } from './app';
import { checkDueCommitments } from './services/push.service';
import { startMorningRoutineCron } from './services/morningRoutine.service';
import { getEnvConfig, validateEnvironment } from './config/env';

try {
    validateEnvironment();
} catch (error: any) {
    console.error('❌ ERROR FATAL:', error.message);
    process.exit(1);
}

const env = getEnvConfig();

// Ensure the pushing cron job runs every 60 seconds
setInterval(() => {
    checkDueCommitments().catch(console.error);
}, 60000);

// Phase 24: Start morning routine cron job (runs daily at 8 AM Santiago time)
startMorningRoutineCron();

app.listen(env.port, () => {
    console.log(`✅ PING Backend listening on port ${env.port} (${env.nodeEnv})`);
});
