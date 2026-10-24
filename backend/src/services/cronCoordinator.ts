import { checkDueCommitments } from './push.service';
import { startMorningRoutineCron } from './morningRoutine.service';
import { reconcilePendingAgentExecutionHistory } from './agentConversationTurn.service';
import { getEnvConfig } from '../config/env';

const env = getEnvConfig();
let hasScheduledJobs = false;
let hasAgentHistoryReconciler = false;
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

/**
 * Starts only the durable execution-history repair loop. This is deliberately
 * independent from startScheduledJobs(): recovery must be enableable without
 * enabling reminders, push delivery, or morning routines.
 */
export function startAgentHistoryReconciler() {
    if (!env.agentHistoryReconciler) {
        console.info('[CronCoordinator] ENABLE_AGENT_HISTORY_RECONCILER=false, skipping Agent history reconciliation.');
        return;
    }

    if (hasAgentHistoryReconciler) return;

    console.info('[CronCoordinator] Starting Agent execution history reconciler.');
    // This job only projects already-completed domain executions. It never
    // executes tools and is safe to run on more than one web instance because
    // the conversation event key is idempotent in Postgres.
    reconcileAgentHistory();
    setInterval(reconcileAgentHistory, 60_000);
    hasAgentHistoryReconciler = true;
}
