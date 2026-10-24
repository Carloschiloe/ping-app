// M-4 — Execute controller. Input is ONLY an authorizationId (sección 3/38)
// — no direct model access, no tool args from the client. Every valid
// execution outcome (done/partially_done/waiting/failed) is HTTP 200 —
// these are real, honest results, never errors (sección 69, same principle
// as agent.controller.ts's needs_clarification/no_evidence).
import { Request, Response } from 'express';
import { executeAuthorization, markAgentExecutionHistoryProjection } from '../services/agentExecution.service';
import { AppError } from '../utils/AppError';
import { generateTraceId } from '../utils/overdueTrace';
import { AgentDialogueStateService, buildDialogueScopeKey } from '../services/agentDialogueState.service';
import {
    isAgentConversationTurnPersistenceEnabled,
    persistAgentExecutionConversationEvent,
} from '../services/agentConversationTurn.service';
import { getOrCreateSelfConversationId } from '../services/conversation.service';

async function resolveExecutionHistoryConversationId(
    actorUserId: string,
    explicitConversationId?: string,
): Promise<string | undefined> {
    const explicit = explicitConversationId?.trim();
    if (explicit) return explicit;
    try {
        return await getOrCreateSelfConversationId(actorUserId);
    } catch (error: any) {
        // Execution is already authoritative at this point. History is an
        // auxiliary projection; preserve the real execution result if the
        // self-chat cannot be resolved.
        console.warn('[AgentHistory] self conversation unavailable for execution projection', error?.message ?? error);
        return undefined;
    }
}

export const execute = async (req: Request, res: Response): Promise<void> => {
    try {
        const actorUserId = req.user!.id;
        const { authorizationId, conversationId, sourceTurnKey } = req.body;
        const traceId = generateTraceId();
        // Resolve and bind the history target before execution. The claim RPC
        // creates the durable outbox in the same transaction that consumes
        // the authorization, so a crash cannot leave a side effect without
        // a recoverable history target.
        const historyConversationId = isAgentConversationTurnPersistenceEnabled() && sourceTurnKey
            ? await resolveExecutionHistoryConversationId(actorUserId, conversationId)
            : undefined;

        const result = await executeAuthorization({
            authorizationId,
            actorUserId,
            traceId,
            historyConversationId,
            historySourceTurnKey: sourceTurnKey,
        });

        // The legacy mobile flow confirms and executes through separate HTTP
        // calls.  The canonical in-turn flow already closes the dialogue
        // state after a verified write, but this controller is the post-
        // confirmation boundary for the mobile flow and must do the same.
        // Otherwise the next independent question can inherit the completed
        // create-commitment objective and render the old creation form again.
        const verified = result.status === 'done'
            && result.executedSteps.length > 0
            && result.executedSteps.every((step) => step.status === 'succeeded' && step.verified === true);
        if (verified) {
            const dialogueScopeKey = buildDialogueScopeKey({
                conversationId: conversationId ?? null,
                surface: 'mobile_text',
            });
            const dialogueService = new AgentDialogueStateService();
            const dialogueState = dialogueService.getSnapshot(actorUserId, dialogueScopeKey);
            // Only close the state that is actually waiting for authorization.
            // A late/replayed execution must never resolve an unrelated or
            // already-idle dialogue objective.
            if (dialogueState?.lifecycle === 'plan_pending_authorization'
                && dialogueState.currentAuthorizationIdRef === authorizationId) {
                try {
                    dialogueService.markResolvedAfterExecution({
                        actorUserId,
                        dialogueScopeKey,
                        authorizationId,
                        turnId: traceId,
                        turnSequence: dialogueState.lastTurnSequence,
                    });
                } catch (dialogueError: any) {
                    // The side effect is already verified. State cleanup is
                    // auxiliary; keep the honest execution result available
                    // while leaving a diagnostic for the server logs.
                    console.warn('[AgentDialogue] post-execution resolution skipped', {
                        authorizationId,
                        message: dialogueError?.message ?? String(dialogueError),
                    });
                }
            }
        }
        if (historyConversationId && sourceTurnKey) {
            try {
                await persistAgentExecutionConversationEvent({
                    actorUserId,
                    conversationId: historyConversationId,
                    sourceTurnKey,
                    execution: result,
                });
                const projectionMarker = typeof markAgentExecutionHistoryProjection === 'function'
                    ? await markAgentExecutionHistoryProjection({ authorizationId, actorUserId })
                    : { error: null };
                const projectionError = projectionMarker.error;
                if (projectionError) {
                    console.warn('[AgentHistory] execution projection marker deferred', {
                        authorizationId,
                        errorCode: projectionError.code ?? 'unknown',
                    });
                }
            } catch (historyError: any) {
                // Domain execution already completed. Keep the canonical result
                // available to the caller while preserving a pending outbox
                // row for a later idempotent retry.
                try {
                    const markerResult = typeof markAgentExecutionHistoryProjection === 'function'
                        ? await markAgentExecutionHistoryProjection({
                            authorizationId,
                            actorUserId,
                            errorCode: historyError instanceof AppError ? `history_${historyError.statusCode}` : 'history_projection_failed',
                        })
                        : { error: null };
                    const markerError = markerResult.error;
                    if (markerError) {
                        console.warn('[AgentHistory] execution projection failure marker deferred', {
                            authorizationId,
                            errorCode: markerError.code ?? 'unknown',
                        });
                    }
                } catch {
                    // Keep the execution response available even if the
                    // observability marker is temporarily unavailable.
                }
                console.warn('[AgentHistory] execution projection skipped', {
                    code: historyError instanceof AppError ? historyError.statusCode : 'unknown',
                });
            }
        }
        res.status(200).json(result);
    } catch (error: any) {
        const statusCode = error instanceof AppError ? error.statusCode : 500;
        res.status(statusCode).json({ error: statusCode === 500 ? 'Execution could not be processed right now.' : error.message });
    }
};
