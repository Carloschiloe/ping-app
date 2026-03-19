import { checkDueCommitments } from './push.service';
import { startMorningRoutineCron } from './morningRoutine.service';
import { getEnvConfig } from '../config/env';

const env = getEnvConfig();
let hasScheduledJobs = false;
let isCheckingCommitments = false;

export function startScheduledJobs() {
    if (!env.runCronJobs) {
        console.info('[CronCoordinator] RUN_CRON_JOBS=false, skipping cron jobs.');
        return;
    }

    if (hasScheduledJobs) {
        return;
    }

    console.info('[CronCoordinator] Starting scheduled background jobs.');
    setInterval(() => {
        if (isCheckingCommitments) {
            console.warn('[CronCoordinator] checkDueCommitments skipped (previous run still in progress).');
            return;
        }
        isCheckingCommitments = true;
        checkDueCommitments()
            .catch((err) => console.error('[CronCoordinator] checkDueCommitments failed:', err))
            .finally(() => {
                isCheckingCommitments = false;
            });
    }, 60_000);

    startMorningRoutineCron();
    hasScheduledJobs = true;
}
