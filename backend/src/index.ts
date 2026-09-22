import { app } from './app';
import { getEnvConfig, validateEnvironment } from './config/env';
import { startScheduledJobs } from './services/cronCoordinator';
import { startAudioTranscriptionWorker } from './services/audioTranscriptionWorker.service';
import { diagnosePrivateAgentTurnDatabase, isPrivateAgentTurnDatabaseDiagnosticEnabled } from './services/privateAgentTurnAdmission.service';

async function runPrivateDatabaseDiagnostic(): Promise<void> {
    if (!isPrivateAgentTurnDatabaseDiagnosticEnabled()) return;
    const result = await diagnosePrivateAgentTurnDatabase();
    if (result.passed) {
        console.log('PING_M7_PRIVATE_DB_CHECK=PASS');
    } else {
        console.log(`PING_M7_PRIVATE_DB_CHECK=FAIL category=${result.category ?? 'unknown'} code=${result.driverCode ?? 'none'}`);
    }
}

try {
    validateEnvironment();
} catch (error: any) {
    console.error('❌ ERROR FATAL:', error.message);
    process.exit(1);
}

const env = getEnvConfig();
const host = '0.0.0.0';

startScheduledJobs();
startAudioTranscriptionWorker();
void runPrivateDatabaseDiagnostic();

app.listen(env.port, host, () => {
    console.log(`✅ PING Backend listening on ${host}:${env.port} (${env.nodeEnv})`);
});
