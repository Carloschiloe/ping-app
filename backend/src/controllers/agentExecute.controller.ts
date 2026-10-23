// M-4 — Execute controller. Input is ONLY an authorizationId (sección 3/38)
// — no direct model access, no tool args from the client. Every valid
// execution outcome (done/partially_done/waiting/failed) is HTTP 200 —
// these are real, honest results, never errors (sección 69, same principle
// as agent.controller.ts's needs_clarification/no_evidence).
import { Request, Response } from 'express';
import { executeAuthorization } from '../services/agentExecution.service';
import { AppError } from '../utils/AppError';
import { generateTraceId } from '../utils/overdueTrace';
import { AgentDialogueStateService, buildDialogueScopeKey } from '../services/agentDialogueState.service';
import {
    isAgentConversationTurnPersistenceEnabled,
    persistAgentExecutionConversationEvent,
} from '../services/agentConversationTurn.service';

export const execute = async (req: Request, res: Response): Promise<void> => {
    try {
        const actorUserId = req.user!.id;
        const { authorizationId, conversationId, sourceTurnKey } = req.body;
        const traceId = generateTraceId();

        const result = await executeAuthorization({ authorizationId, actorUserId, traceId });

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
        if (isAgentConversationTurnPersistenceEnabled() && conversationId && sourceTurnKey) {
            try {
                await persistAgentExecutionConversationEvent({
                    actorUserId,
                    conversationId,
                    sourceTurnKey,
                    execution: result,
                });
            } catch (historyError: any) {
                // Domain execution already completed. Keep the canonical result
                // available to the caller while exposing a safe server-side
                // diagnostic for the auxiliary conversation projection.
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
