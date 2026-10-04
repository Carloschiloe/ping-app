import { authorizePlan } from './agentAuthorization.service';
import { executeAuthorization } from './agentExecution.service';
import { isCanonicalDurableAgentRuntimeEnabled } from './agentDurableConfig.service';
import { runAgentTurn } from './agentTurn.service';
import { runDurableAgentTurn, type DurableTurnPostProcessContext } from './agentTurnDurableBoundary.service';
import type { AgentTurnInput, AgentTurnResult } from '../types/agentTurn';
import type { RunAgentTurnOptions } from './agentTurnCore.service';

/**
 * One server-owned conversation runtime for every channel. Adapters submit a
 * turn and render this result; they do not own plan, confirmation,
 * authorization or execution state.
 */
export async function runCanonicalAgentTurn(
    input: AgentTurnInput,
    options: RunAgentTurnOptions,
    idempotencyKey: string,
): Promise<AgentTurnResult> {
    if (!isCanonicalDurableAgentRuntimeEnabled()) return runAgentTurn(input, options);

    return runDurableAgentTurn(
        input,
        options,
        idempotencyKey,
        undefined,
        async (context) => executeConfirmedTurn(input, options, context),
    );
}

async function executeConfirmedTurn(
    input: AgentTurnInput,
    options: RunAgentTurnOptions,
    context: DurableTurnPostProcessContext,
): Promise<AgentTurnResult> {
    const turn = context.result;
    if (turn.kind !== 'plan' || turn.confirmationState !== 'received') return turn;
    if (typeof turn.plan.planDigest !== 'string' || turn.plan.planDigest.length === 0) {
        return executionResponse('El plan confirmado ya no está disponible para autorizarlo.', false);
    }

    const authorization = await authorizePlan({
        actorUserId: input.actorUserId,
        input: input.input ?? '',
        conversationId: input.conversationId,
        channel: input.channel,
        locale: input.locale,
        timezone: input.timezone,
        now: options.now ?? input.now,
        traceId: input.traceId,
        planDigest: turn.plan.planDigest,
        requestedStepIds: turn.plan.steps.map((step) => step.stepId),
        confirm: true,
    });

    if (!authorization.ok) return executionResponse(authorization.message, false);

    const execution = await executeAuthorization({
        authorizationId: authorization.authorization.id,
        actorUserId: input.actorUserId,
        traceId: input.traceId,
    });
    const verified = execution.status === 'done'
        && execution.executedSteps.length > 0
        && execution.executedSteps.every((step) => step.status === 'succeeded' && step.verified === true);

    if (verified) {
        const state = context.dialogueService.getSnapshot(input.actorUserId, context.dialogueScopeKey);
        if (state) {
            context.dialogueService.markResolved({
                actorUserId: input.actorUserId,
                dialogueScopeKey: context.dialogueScopeKey,
                turnId: context.turnId,
                turnSequence: state.lastTurnSequence + 1,
            });
        }
    }

    return executionResponse(execution.humanReadableSummary, verified);
}

function executionResponse(answer: string, verified: boolean): AgentTurnResult {
    return {
        kind: 'response',
        response: {
            status: verified ? 'answered' : 'capability_gap',
            answer,
            citations: [],
        },
    };
}
