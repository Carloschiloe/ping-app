import { checkDueCommitments } from './push.service';
import { startMorningRoutineCron } from './morningRoutine.service';
import { reconcilePendingAgentExecutionHistory } from './agentConversationTurn.service';
import { getEnvConfig } from '../config/env';

const env = getEnvConfig();
let hasScheduledJobs = false;
let isCheckingCommitments = false;
let isReconcilingAgentHistory = false;

function reconcileAgentHistory(): void {
    if (isReconcilingAgentHistory) {
        console.warn('[CronCoordinator] Agent history reconciliation skipped (previous run still in progress).');
        return;
    }
    isReconcilingAgentHistory = true;
    reconcilePendingAgentExecutionHistory()
        .then((summary) => {
            if (summary.scanned > 0) {
                console.info('[CronCoordinator] Agent execution history reconciliation completed.', summary);
            }
        })
        .catch((err) => console.error('[CronCoordinator] Agent execution history reconciliation failed:', err))
        .finally(() => {
            isReconcilingAgentHistory = false;
        });
}

export function startScheduledJobs() {
    if (!env.runCronJobs) {
        console.info('[CronCoordinator] RUN_CRON_JOBS=false, skipping cron jobs.');
        return;
    }

    if (hasScheduledJobs) {
        return;
    }

    console.info('[CronCoordinator] Starting scheduled background jobs.');
    // This job only projects already-completed domain executions. It never
    // executes tools and is safe to run on more than one web instance because
    // the conversation event key is idempotent in Postgres.
    reconcileAgentHistory();
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
        reconcileAgentHistory();
    }, 60_000);

    startMorningRoutineCron();
    hasScheduledJobs = true;
}
