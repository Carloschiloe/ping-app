import { checkDueCommitments } from './push.service';
import { cleanupExpiredMessageAttachments } from './attachmentApplication.service';
import { startMorningRoutineCron } from './morningRoutine.service';
import { getEnvConfig } from '../config/env';

const env = getEnvConfig();
let hasScheduledJobs = false;
let isCheckingCommitments = false;
let isCleaningExpiredAttachments = false;
const EXPIRED_ATTACHMENT_SWEEP_MS = 15 * 60_000;

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

    const sweepExpiredAttachments = () => {
        if (isCleaningExpiredAttachments) {
            console.warn('[CronCoordinator] expired attachment sweep skipped (previous run still in progress).');
            return;
        }
        isCleaningExpiredAttachments = true;
        cleanupExpiredMessageAttachments()
            .then((result) => {
                if (result.examined > 0) {
                    console.info('[CronCoordinator] expired attachment sweep completed:', result);
                }
            })
            .catch((err) => console.error('[CronCoordinator] expired attachment sweep failed:', err))
            .finally(() => {
                isCleaningExpiredAttachments = false;
            });
    };

    sweepExpiredAttachments();
    const interval = setInterval(sweepExpiredAttachments, EXPIRED_ATTACHMENT_SWEEP_MS);
    interval.unref?.();
    hasScheduledJobs = true;
}
